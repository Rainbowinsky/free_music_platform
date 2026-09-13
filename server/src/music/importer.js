/**
 * 入库流水线：候选召回 → 判定 → 下载 → 归档（歌手/专辑/歌曲）
 *
 * 媒体文件仍然全部落在本地磁盘 public/{music,covers,lyrics}，
 * MySQL 只保存元数据与相对路径。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseBuffer } from 'music-metadata';

import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import {
  artistKey,
  artistMatches,
  dedupKey,
  isOriginalTitle,
  scoreCandidate,
  stripBrackets,
  titleKey,
} from './normalize.js';
import { agentEnabled, adjudicate, parseQuery } from './agent.js';
import {
  externalSearchUrl,
  fetchAudio,
  fetchImage,
  fetchLyrics,
  neteaseDetail,
  probeAudio,
  searchNeteaseOfficial,
  searchSource,
  sleep,
} from './sources.js';

const sha1 = (input) => crypto.createHash('sha1').update(input).digest('hex');

/**
 * 修正上传文件名乱码：multipart 的 filename 按 latin1 解码，中文会变成 mojibake。
 * 转回 utf8 后如果出现替换字符，说明原本就是正常字符串，保持原样。
 */
export function decodeUploadName(name = '') {
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    if (fixed.includes('\uFFFD')) return name;
    return fixed;
  } catch {
    return name;
  }
}

/**
 * 文件名 → { title, artist }
 * 源站的 mp3 常常把 ID3 的 title/artist 清空（实测只剩 track/disk），
 * 所以上传通路需要靠文件名 + 在线检索来还原元数据。
 * 注意：入参应当是已解码的文件名（decodeUploadName 只在入口调用一次）。
 */
export async function guessTitleArtist(rawName = '') {
  const base = String(rawName)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^\s*\d{1,3}[\s._\-]+/, '')
    .trim();

  const candidates = [];
  const bracket = /^[\[【(（]([^\]】)）]+)[\]】)）]\s*(.+)$/.exec(base);
  if (bracket) candidates.push({ artist: bracket[1].trim(), title: bracket[2].trim(), from: 'bracket' });

  const dash = /^(.+?)\s*[-–—_]\s*(.+)$/.exec(base);
  if (dash) {
    candidates.push({ title: dash[1].trim(), artist: dash[2].trim(), from: 'title-artist' });
    candidates.push({ artist: dash[1].trim(), title: dash[2].trim(), from: 'artist-title' });
  }
  candidates.push({ title: base, artist: '', from: 'plain' });

  // 用官方检索验证哪种拆法能同时命中歌名与歌手
  for (const cand of candidates) {
    if (!cand.title) continue;
    const list = await searchNeteaseOfficial(`${cand.title} ${cand.artist}`.trim(), 8).catch(() => []);
    const hit = list.find(
      (s) => titleKey(s.name) === titleKey(cand.title) && (!cand.artist || artistMatches(s.artists, cand.artist)),
    );
    if (hit) return { ...cand, matched: hit };
  }
  return candidates[0] ?? { title: base, artist: '' };
}

async function ensureDirs() {
  for (const dir of Object.values(config.media)) await fs.mkdir(dir, { recursive: true });
}

const publicPath = (kind, filename) => `/${kind}/${filename}`;

/** 曲库里是否已经有这首（标题 + 歌手归一化后匹配） */
export async function findDuplicate(title, artist) {
  const rows = await query(
    `SELECT s.id, s.title, s.artist_text, s.src, s.cover, s.lrc, s.duration,
            s.playable, s.source, s.source_id, s.album_id, al.name AS album
       FROM songs s
       LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.title_key = ?`,
    [titleKey(title)],
  );
  return (
    rows.find((row) => {
      if (!artist) return true;
      return artistMatches([row.artist_text], artist) || artistMatches([artist], row.artist_text);
    }) ?? null
  );
}

/**
 * 模型裁决（第二阶段）：给候选打上 原版/变体/翻唱 判定与理由。
 * 只调整置信度与理由，不改变候选集合；失败就退回规则判定，不影响可用性。
 */
export async function judgeCandidates({ target, candidates, signal }) {
  if (!agentEnabled() || !candidates.length) {
    return { candidates, agentApplied: false, agentNote: agentEnabled() ? '' : '未配置模型，使用规则判定' };
  }
  const adjudication = await adjudicate({ target, candidates, signal });
  const verdicts = Array.isArray(adjudication) ? adjudication : null;
  if (!verdicts) {
    return {
      candidates,
      agentApplied: false,
      agentNote: adjudication?.aborted
        ? '模型裁决已取消'
        : adjudication?.timedOut
          ? `裁决模型超时（>${config.agent.timeoutMs}ms），已退回规则判定`
          : `裁决模型未返回结果${adjudication?.error ? `（${adjudication.error}）` : ''}，已退回规则判定`,
    };
  }
  for (const v of verdicts) {
    const cand = candidates[v.index];
    if (!cand) continue;
    cand.agentVerdict = v.verdict;
    cand.agentReason = v.reason;
    const weight = v.verdict === 'original' ? 1 : v.verdict === 'variant' ? 0.75 : v.verdict === 'cover' ? 0.25 : 0.5;
    cand.confidence = Math.round(Math.min(100, cand.confidence * 0.4 + Number(v.confidence || 0) * 0.6) * weight);
    if (v.verdict === 'cover' && !cand.flags.includes('模型判为非原版')) cand.flags.push('模型判为非原版');
  }
  const audioRank = (cand) => (cand.audioAvailable === true ? 2 : cand.audioAvailable === undefined ? 1 : 0);
  for (const cand of candidates) {
    if (cand.audioAvailable === false) cand.confidence = Math.min(cand.confidence, 35);
    cand.importable = cand.audioAvailable !== false;
  }
  candidates.sort((a, b) => audioRank(b) - audioRank(a) || b.confidence - a.confidence);
  return { candidates, agentApplied: true, agentNote: '' };
}

/** 召回候选：多源搜索 + 官方接口补元数据 + 体积探测 + 打分（可选接模型裁决） */
export async function collectCandidates(rawQuery, { withProbe = true, signal, skipJudge = false } = {}) {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) throw new Error('请输入要搜索的歌曲');

  // 每一步之间检查取消信号，保证「停止搜索」能立刻生效
  const ensureActive = () => {
    if (signal?.aborted) throw Object.assign(new Error('搜索已取消'), { cancelled: true });
  };
  ensureActive();

  // 阶段耗时（排查"搜索偶尔特别慢"用）
  const timing = { start: Date.now() };
  const mark = (key) => {
    timing[key] = Date.now() - timing.start;
  };

  // 1) 查询理解
  //    「歌名 歌手」这种规矩输入用规则拆就够了，不必等模型（模型波动 1–20s，是搜索变慢的主因）；
  //    只有单个词或口语化描述才交给模型。
  const COLLOQUIAL = /(那首|唱的那|的歌|什么歌|叫啥|叫什|哪个|哪首|翻唱|原唱|纯音乐|伴奏|版本)/;
  const ruleSplit = (() => {
    const m = /^(.+?)[\s\-—/]+(.+)$/.exec(trimmed);
    return m ? { title: m[1].trim(), artist: m[2].trim() } : null;
  })();

  let target = ruleSplit ?? { title: trimmed, artist: '' };
  let parsedBy = ruleSplit ? 'rule' : 'raw';
  if (agentEnabled() && (!ruleSplit || COLLOQUIAL.test(trimmed))) {
    const parsed = await parseQuery(trimmed, { signal });
    if (parsed && parsed.title) {
      target = { title: parsed.title, artist: parsed.artist };
      parsedBy = 'agent';
    }
  }
  ensureActive();
  mark('parse');

  const keyword = `${target.title} ${target.artist}`.trim();

  // 2) 多源召回
  const [official, ...metingLists] = await Promise.all([
    searchNeteaseOfficial(keyword, 30, { signal }).catch(() => []),
    ...config.sources.priority.map((server) => searchSource(server, keyword, { signal }).catch(() => [])),
  ]);
  ensureActive();
  mark('recall');
  await sleep(150);

  // 2.1 方向纠正：用户可能按「歌手 歌名」输入。
  //     判断依据是"这个词更像歌名还是更像歌手"——统计它在召回结果里命中 name 字段与 artist 字段的次数。
  if (ruleSplit && parsedBy === 'rule') {
    const top = official.slice(0, 15);
    const nameHits = (word) => top.filter((s) => titleKey(s.name) === titleKey(word)).length;
    const artistHits = (word) => top.filter((s) => artistMatches(s.artists || [], word)).length;
    const [wordA, wordB] = [target.title, target.artist];
    const aIsTitle = nameHits(wordA) - artistHits(wordA);
    const bIsTitle = nameHits(wordB) - artistHits(wordB);
    // 第二个词更像歌名（命中 name 字段）且第一个词不像歌名时交换。
    // 注意：不能要求"第一个词命中 artist"——像周杰伦这种整库缺失的歌手，官方搜索里根本查不到他。
    if (bIsTitle > aIsTitle && nameHits(wordB) > 0) {
      target = { title: wordB, artist: wordA };
      parsedBy = 'rule(自动换向)';
    }
  }

  const pool = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.server}:${item.id}`;
    if (!item.id || seen.has(key)) return;
    seen.add(key);
    pool.push(item);
  };
  // 官方接口信息最全，先入池
  official.forEach((item) => push({ ...item, artists: item.artists || [item.artist] }));
  metingLists.flat().forEach((item) => push({ ...item, artists: [item.artist] }));

  // 3) 初判：标题要能对上，其余作为参考项保留但降权
  const targetKey = titleKey(target.title);
  const rough = pool.filter((item) => {
    const k = titleKey(item.name);
    return k === targetKey || k.includes(targetKey) || targetKey.includes(k);
  });
  const workingSet = rough.length ? rough : pool;

  const scored = workingSet
    .map((item) => {
      const scored = scoreCandidate(
        {
          name: item.name,
          artists: item.artists,
          album: item.album || '',
          durationSec: item.durationSec || 0,
          sizeBytes: 0,
          source: item.server,
        },
        { ...target, refSec: 0 },
      );
      return { ...item, ...scored };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, config.rules.maxCandidates);

  // 4) 深入校验：补元数据 + 封面地址（网易云前几个候选）+ 音源可用性探测
  const neteaseTop = scored.filter((item) => item.server === 'netease').slice(0, 3);
  const detailTargets = scored.filter(
    (item) => item.server === 'netease' && ((!item.album || !item.durationSec) || neteaseTop.includes(item)),
  );
  const details = new Map();
  for (const item of detailTargets.slice(0, 4)) {
    ensureActive();
    const detail = await neteaseDetail(item.id, { signal });
    if (detail) details.set(item.id, detail);
    await sleep(80);
  }
  ensureActive();
  mark('detail');

  // 4.1 源级熔断：每个源先探一次，探一次就能确定整源是否可取，避免逐个候选浪费探测名额。
  const sourceReachable = new Map();
  if (withProbe) {
    const servers = [...new Set(scored.map((item) => item.server))];
    await Promise.all(
      servers.map(async (server) => {
        const first = scored.find((item) => item.server === server);
        try {
          const probe = await probeAudio(server, first.id, 320, { signal });
          sourceReachable.set(server, probe.reachable);
        } catch {
          sourceReachable.set(server, false);
        }
      }),
    );
  }
  ensureActive();

  // 4.2 只对"源可用"的候选逐个探测体积（并行）
  const probeCandidates = scored
    .filter((item) => withProbe && sourceReachable.get(item.server) !== false)
    .slice(0, Math.max(config.rules.maxVerify, 2));
  const probes = new Map(
    await Promise.all(
      probeCandidates.map(async (item) => {
        try {
          return [item.id, await probeAudio(item.server, item.id, 320, { signal })];
        } catch {
          return [item.id, { reachable: false, size: null }];
        }
      }),
    ),
  );
  ensureActive();
  mark('probe');

  const candidates = scored.map((item) => {
    const enriched = { ...item };
    const detail = details.get(item.id);
    if (detail) {
      enriched.album = detail.album || enriched.album;
      enriched.coverUrl = detail.coverUrl || enriched.coverUrl;
      enriched.durationSec = detail.durationSec || enriched.durationSec;
      enriched.artist = detail.artist || enriched.artist;
      enriched.artists = detail.artists || enriched.artists;
    }

    const reachable = sourceReachable.get(item.server);
    const probe = probes.get(item.id);
    if (probe) {
      enriched.sizeBytes = probe.size ?? null;
      enriched.reachable = probe.reachable;
    }

    // 音源是否真能取到全曲
    let audioAvailable;
    if (reachable === false) audioAvailable = false; // 整源不可用
    else if (probe) {
      audioAvailable = Boolean(probe.reachable) && (probe.size === null || probe.size >= config.rules.minFullBytes);
    } else {
      audioAvailable = undefined; // 未探测
    }

    const finalScore = scoreCandidate(
      {
        name: enriched.name,
        artists: enriched.artists,
        album: enriched.album || '',
        durationSec: enriched.durationSec || 0,
        sizeBytes: enriched.sizeBytes || 0,
        source: enriched.server,
        audioAvailable,
      },
      target,
    );
    return {
      ...enriched,
      ...finalScore,
      audioAvailable,
      isOriginal: isOriginalTitle(enriched.name, target.title),
      full: (enriched.sizeBytes ?? 0) >= config.rules.minFullBytes,
      sizeMB: enriched.sizeBytes ? +(enriched.sizeBytes / 1048576).toFixed(2) : null,
      externalUrl: externalSearchUrl(target.title, target.artist),
    };
  });

  // 排序：确认可用的排在未探测前面，不可用的沉底
  const audioRank = (cand) => (cand.audioAvailable === true ? 2 : cand.audioAvailable === undefined ? 1 : 0);
  candidates.sort((a, b) => audioRank(b) - audioRank(a) || b.score - a.score);

  // 音源取不到的候选（例如酷狗/QQ音乐条目）：不管版本判得多准，都不能作为"可入库"结果
  const markImportable = (list) => {
    for (const cand of list) {
      if (cand.audioAvailable === false) cand.confidence = Math.min(cand.confidence, 35);
      cand.importable = cand.audioAvailable !== false;
    }
  };
  markImportable(candidates);

  // 5) 模型裁决：默认异步（两阶段），skipJudge 时先返回规则结果，由 /judge 补齐
  let agentApplied = false;
  let agentNote = '';
  if (!skipJudge && agentEnabled() && candidates.length) {
    ensureActive();
    const judged = await judgeCandidates({ target, candidates, signal });
    ensureActive();
    agentApplied = judged.agentApplied;
    agentNote = judged.agentNote;
    candidates.sort((a, b) => audioRank(b) - audioRank(a) || b.confidence - a.confidence);
  }

  // 6) 去重提示
  const existing = await findDuplicate(target.title, target.artist || (candidates[0]?.artist ?? ''));
  for (const cand of candidates) {
    const dup = await findDuplicate(cand.name, cand.artist);
    cand.duplicate = dup ? { id: dup.id, title: dup.title, artist: dup.artist_text, album: dup.album, playable: Boolean(dup.playable) } : null;
  }
  mark('judge');

  // 阶段耗时：排查"搜索偶尔特别慢"，超过 3 秒就记一条，便于对照是模型还是音源慢
  const totalMs = Date.now() - timing.start;
  if (totalMs > 3000 || process.env.SEARCH_DEBUG === '1') {
    console.log(
      `[search] "${keyword}" 共 ${totalMs}ms｜解析 ${timing.parse ?? '-'} 召回 ${timing.recall ?? '-'} ` +
        `详情 ${timing.detail ?? '-'} 探测 ${timing.probe ?? '-'} 裁决/去重 ${timing.judge ?? '-'}｜模型参与=${agentApplied}`,
    );
  }

  return {
    query: trimmed,
    target,
    parsedBy,
    agentApplied,
    agentEnabled: agentEnabled(),
    agentNote,
    keyword,
    total: pool.length,
    candidates,
    duplicate: existing
      ? { id: existing.id, title: existing.title, artist: existing.artist_text, album: existing.album, playable: Boolean(existing.playable) }
      : null,
  };
}

async function findOrCreateArtist(name) {
  const clean = stripBrackets(String(name || '').split('/')[0]).trim();
  const key = artistKey(clean);
  if (!key) return null;
  await query('INSERT IGNORE INTO artists (name, name_key) VALUES (?, ?)', [clean, key]);
  const row = await queryOne('SELECT id, cover FROM artists WHERE name_key = ?', [key]);
  return row || null;
}

async function findOrCreateAlbum(name, artistId, cover = '', year = '') {
  const clean = String(name || '').trim() || '未知专辑';
  const key = titleKey(clean);
  const cleanYear = String(year || '').trim().slice(0, 8);
  const existing = await queryOne(
    'SELECT id, cover, year FROM albums WHERE name_key = ? AND (artist_id <=> ?)',
    [key, artistId],
  );
  if (existing) {
    const sets = [];
    const params = [];
    if (cover && !existing.cover) {
      sets.push('cover = ?');
      params.push(cover);
    }
    if (cleanYear && !existing.year) {
      sets.push('year = ?');
      params.push(cleanYear);
    }
    if (sets.length) {
      params.push(existing.id);
      await query(`UPDATE albums SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    return { id: existing.id, created: false };
  }
  const res = await query('INSERT INTO albums (name, name_key, artist_id, cover, year) VALUES (?, ?, ?, ?, ?)', [
    clean,
    key,
    artistId,
    cover,
    cleanYear,
  ]);
  return { id: res.insertId, created: true };
}

/** 音频入库落盘 + 元数据写入 */
export async function persistSong({
  source,
  sourceId,
  title,
  artist,
  album,
  albumYear = '',
  durationSec,
  audioBuffer,
  audioExt = 'mp3',
  coverBuffer,
  coverExt,
  lyricsText,
  externalUrl = '',
  playable = true,
  /** 复用磁盘上已存在的文件（回填历史曲库时用），传入后不再写文件 */
  filePath,
  coverPath: coverPathOverride,
  lrcPath: lrcPathOverride,
}) {
  await ensureDirs();
  const fileBase = `${source}-${sourceId}`;
  const hasAudio = audioBuffer && audioBuffer.length > 0;
  const reuse = Boolean(filePath);
  const safeAudioExt = String(audioExt || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
  const safeCoverExt = String(coverExt || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const musicFile = hasAudio && !reuse ? `${fileBase}.${safeAudioExt}` : '';
  const coverFile = coverBuffer && !reuse ? `${fileBase}.${safeCoverExt}` : '';
  const lrcFile = lyricsText && !reuse ? `${fileBase}.lrc` : '';

  if (hasAudio && !reuse) await fs.writeFile(path.join(config.media.music, musicFile), audioBuffer);
  if (coverBuffer && !reuse) await fs.writeFile(path.join(config.media.covers, coverFile), coverBuffer);
  if (lyricsText && !reuse) await fs.writeFile(path.join(config.media.lyrics, lrcFile), lyricsText, 'utf8');

  const musicPath = reuse ? filePath : musicFile ? publicPath('music', musicFile) : '';
  const coverPath = coverPathOverride ?? (coverFile ? publicPath('covers', coverFile) : '');
  const lrcPath = lrcPathOverride ?? (lrcFile ? publicPath('lyrics', lrcFile) : '');

  const artistRow = await findOrCreateArtist(artist);
  // 当前模型没有独立的歌手头像上传字段；歌手尚无图片时，用本次专辑封面作为展示兜底。
  // 用 COALESCE/NULLIF 在 SQL 侧判空，避免依赖 findOrCreateArtist 返回的快照，
  // 也保证任何一次"带封面的导入"都能把空缺补上（不覆盖已上传的独立头像）。
  if (artistRow && coverPath) {
    await query(
      "UPDATE artists SET cover = ? WHERE id = ? AND (cover IS NULL OR cover = '')",
      [coverPath, artistRow.id],
    );
  }
  const albumRow = await findOrCreateAlbum(album, artistRow?.id ?? null, coverPath, albumYear);

  await query(
    `INSERT INTO songs
       (title, title_key, artist_id, album_id, artist_text, duration, src, cover, lrc, source, source_id, playable, external_url, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), artist_id = VALUES(artist_id), album_id = VALUES(album_id),
       artist_text = VALUES(artist_text), duration = VALUES(duration), src = VALUES(src),
       cover = VALUES(cover), lrc = VALUES(lrc), playable = VALUES(playable),
       external_url = VALUES(external_url), file_size = VALUES(file_size)`,
    [
      title,
      titleKey(title),
      artistRow?.id ?? null,
      albumRow.id,
      artist,
      durationSec || 0,
      musicPath,
      coverPath,
      lrcPath,
      source,
      String(sourceId),
      playable ? 1 : 0,
      externalUrl,
      audioBuffer.length,
    ],
  );

  return queryOne(
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name
       FROM songs s
       LEFT JOIN artists ar ON ar.id = s.artist_id
       LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.source = ? AND s.source_id = ?`,
    [source, String(sourceId)],
  );
}

/** 在线候选入库（管理端「确认入库」调用） */
export async function importCandidate({ server, id, target }, onProgress = () => {}) {
  const step = (name, progress, message = '') => onProgress({ step: name, progress, message });

  step('校验音源', 10, '正在探测音源体积');
  const probe = await probeAudio(server, id);
  if (probe.reachable && probe.size !== undefined && probe.size !== null && probe.size < config.rules.minFullBytes) {
    return { status: 'failed', message: `该音源只有 ${(probe.size / 1048576).toFixed(2)}MB（试听片段），不入库` };
  }

  step('下载音频', 30, '正在下载全曲');
  const audio = await fetchAudio(server, id);
  if (!audio.ok || audio.size < config.rules.minFullBytes) {
    return { status: 'failed', message: `音源不可用或体积过小（${(audio.size / 1048576).toFixed(2)}MB）` };
  }

  step('补全元数据', 50, '读取专辑与封面');
  let meta = { name: '', artist: '', album: '', coverUrl: '', durationSec: 0 };
  if (server === 'netease') {
    const detail = await neteaseDetail(id);
    if (detail) meta = { ...detail, coverUrl: detail.coverUrl };
  }

  const title = meta.name || target?.title || '';
  const artist = meta.artist || target?.artist || '';
  const album = meta.album || '';

  const dup = await findDuplicate(title, artist);
  if (dup) {
    return {
      status: 'skipped',
      message: `曲库中已有《${dup.title}》- ${dup.artist_text}${dup.album ? `《${dup.album}》` : ''}`,
      songId: dup.id,
    };
  }

  step('下载封面与歌词', 65);
  let coverBuffer = null;
  let coverExt = 'jpg';
  if (meta.coverUrl) {
    const img = await fetchImage(meta.coverUrl);
    if (img.ok) {
      coverBuffer = img.buf;
      coverExt = img.ct.includes('png') ? 'png' : 'jpg';
    }
  }
  const lrc = await fetchLyrics('netease', id);

  step('归档到歌手/专辑', 85);
  const song = await persistSong({
    source: server,
    sourceId: id,
    title,
    artist,
    album,
    durationSec: meta.durationSec || 0,
    audioBuffer: audio.buf,
    coverBuffer,
    coverExt,
    lyricsText: lrc.ok ? lrc.text : '',
    externalUrl: '',
    playable: true,
  });

  step('完成', 100, '入库成功');
  return {
    status: 'success',
    message: `已入库《${title}》- ${artist}${album ? `《${album}》` : ''}`,
    song,
  };
}

/** 不依赖在线服务的文件名兜底：推荐“歌手 - 歌名.mp3” */
function guessLocalTitleArtist(filename = '') {
  const base = String(filename)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^\s*\d{1,3}[\s._-]+/, '')
    .trim();
  const bracket = /^[\[【(（]([^\]】)）]+)[\]】)）]\s*(.+)$/.exec(base);
  if (bracket) return { artist: bracket[1].trim(), title: bracket[2].trim(), from: 'filename-bracket' };
  const dash = /^(.+?)\s*[-–—_]\s*(.+)$/.exec(base);
  if (dash) return { artist: dash[1].trim(), title: dash[2].trim(), from: 'filename-artist-title' };
  return { artist: '', title: base, from: 'filename-title' };
}

function decodeUtf8Text(buffer, label) {
  if (!buffer?.length) return '';
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (text.includes('\uFFFD')) {
    const error = new Error(`${label}不是有效的 UTF-8 编码，请转换编码后重新上传`);
    error.status = 400;
    throw error;
  }
  return text;
}

function parseUploadedLrc(buffer) {
  const text = decodeUtf8Text(buffer, 'LRC 歌词');
  if (!text) return { text: '', title: '', artist: '', album: '', timedLines: 0 };
  const meta = (key) => {
    const match = new RegExp(`^\\[${key}:([^\\]]*)\\]`, 'im').exec(text);
    return match ? match[1].trim() : '';
  };
  const timedLines = text.split('\n').filter((line) => /\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(line)).length;
  if (!timedLines) {
    const error = new Error('LRC 文件没有有效的时间标签，无法用于同步歌词');
    error.status = 400;
    throw error;
  }
  return { text: `${text}\n`, title: meta('ti'), artist: meta('ar'), album: meta('al'), timedLines };
}

function detectImageExt(input) {
  if (!input?.length) return '';
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return '';
}

function looksLikeMp3(buffer) {
  if (!buffer || buffer.length < 4) return false;
  if (buffer.toString('ascii', 0, 3) === 'ID3') return true;
  const limit = Math.min(buffer.length - 1, 8192);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

/**
 * 本地完整归档：MP3 标签/内嵌封面 + 可选 LRC/独立封面 + 管理员字段。
 * 全流程不调用网易云或其它在线音乐服务。
 */
export async function archiveUploadedFile(
  {
    buffer,
    filename = '',
    mimetype = '',
    lyricsBuffer = null,
    coverBuffer: uploadedCoverBuffer = null,
    metadata = {},
  },
  onProgress = () => {},
) {
  const step = (name, progress, message = '') => onProgress({ step: name, progress, message });
  const displayName = decodeUploadName(filename);
  if (!buffer?.length) {
    const error = new Error('MP3 文件为空');
    error.status = 400;
    throw error;
  }
  if (!/\.mp3$/i.test(displayName) || !looksLikeMp3(buffer)) {
    const error = new Error('当前完整归档仅支持真实的 MP3 文件');
    error.status = 400;
    throw error;
  }

  step('解析音频标签', 15, '正在读取 MP3 标签和内嵌封面');
  let parsed;
  try {
    parsed = await parseBuffer(buffer, { mimeType: mimetype || 'audio/mpeg', path: displayName });
  } catch (cause) {
    const error = new Error(`MP3 无法解析：${cause.message}`);
    error.status = 400;
    throw error;
  }
  const durationSec = parsed.format?.duration ? Math.round(parsed.format.duration) : 0;
  if (!durationSec) {
    const error = new Error('没有从 MP3 中读取到有效时长，文件可能已损坏');
    error.status = 400;
    throw error;
  }

  step('解析附属资源', 35, '正在校验 LRC 与封面');
  const lrc = lyricsBuffer?.length ? parseUploadedLrc(lyricsBuffer) : { text: '', title: '', artist: '', album: '', timedLines: 0 };
  const common = parsed.common || {};
  const guessed = guessLocalTitleArtist(displayName);
  const manual = {
    title: String(metadata.title || '').trim(),
    artist: String(metadata.artist || '').trim(),
    album: String(metadata.album || '').trim(),
    year: String(metadata.year || '').trim(),
  };
  const tags = {
    title: manual.title || String(common.title || '').trim() || lrc.title || guessed.title,
    artist: manual.artist || String(common.artist || common.albumartist || '').trim() || lrc.artist || guessed.artist,
    album: manual.album || String(common.album || '').trim() || lrc.album || '未知专辑',
    albumYear: manual.year || String(common.year || common.date || '').trim().slice(0, 8),
    durationSec,
  };
  if (!tags.title || !tags.artist) {
    const error = new Error('无法确定歌名或歌手，请在管理员自定义信息中补充后再上传');
    error.status = 400;
    throw error;
  }

  let coverBuffer = uploadedCoverBuffer;
  let coverSource = coverBuffer?.length ? 'uploaded' : '';
  if (!coverBuffer?.length) {
    coverBuffer = common.picture?.[0]?.data ?? null;
    if (coverBuffer?.length) coverSource = 'embedded';
  }
  if (coverBuffer?.length && !Buffer.isBuffer(coverBuffer)) coverBuffer = Buffer.from(coverBuffer);
  let coverExt = '';
  if (coverBuffer?.length) {
    coverExt = detectImageExt(coverBuffer);
    if (!coverExt) {
      const error = new Error(`${coverSource === 'uploaded' ? '上传的封面' : 'MP3 内嵌封面'}不是支持的 JPG、PNG 或 WebP 图片`);
      error.status = 400;
      throw error;
    }
  }

  step('检查重复曲目', 60, '正在判断新建或补齐现有曲目');
  const dup = await findDuplicate(tags.title, tags.artist);
  if (dup?.playable) {
    return {
      status: 'skipped',
      message: `曲库中已有可播放的《${dup.title}》- ${dup.artist_text}${dup.album ? `《${dup.album}》` : ''}`,
      songId: dup.id,
      tags: { ...tags, cover: Boolean(coverBuffer), coverSource, lyrics: Boolean(lrc.text), lyricsLines: lrc.timedLines },
    };
  }

  step('写入曲库', 80, dup ? '正在为已有曲目补齐本地媒体' : '正在归档到歌手 / 专辑');
  const contentId = sha1(buffer).slice(0, 16);
  const song = await persistSong({
    // 对“仅元数据”歌曲原位补齐，保留其 source/source_id，避免用户喜欢记录失效。
    source: dup?.source || 'local',
    sourceId: dup?.source_id || contentId,
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    albumYear: tags.albumYear,
    durationSec: tags.durationSec,
    audioBuffer: buffer,
    audioExt: 'mp3',
    coverBuffer,
    coverExt: coverExt || 'jpg',
    lyricsText: lrc.text,
    coverPath: !coverBuffer?.length && dup?.cover ? dup.cover : undefined,
    lrcPath: !lrc.text && dup?.lrc ? dup.lrc : undefined,
    externalUrl: '',
    playable: true,
  });

  step('完成', 100, dup ? '已有曲目已补齐' : '归档成功');
  return {
    status: 'success',
    upgraded: Boolean(dup),
    message: dup
      ? `已为《${tags.title}》- ${tags.artist}补齐本地音频${lrc.text ? '与歌词' : ''}`
      : `已归档《${tags.title}》- ${tags.artist}${tags.album ? `《${tags.album}》` : ''}`,
    song,
    matched: null,
    tags: {
      ...tags,
      cover: Boolean(coverBuffer || dup?.cover),
      coverSource: coverSource || (dup?.cover ? 'existing' : ''),
      lyrics: Boolean(lrc.text || dup?.lrc),
      lyricsLines: lrc.timedLines,
      metadataSource: manual.title || manual.artist || manual.album ? '管理员 + MP3/LRC' : 'MP3/LRC',
    },
  };
}

export { dedupKey };
