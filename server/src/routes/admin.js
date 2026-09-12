import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';

import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { adminRequired } from '../auth.js';
import { agentStatus } from '../music/agent.js';
import { archiveUploadedFile, collectCandidates, importCandidate, judgeCandidates } from '../music/importer.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

/** 单次搜索/裁决的最长耗时：超时自动中止，避免任务一直跑 */
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 60000);
/** 两阶段搜索：第一阶段（召回）结束后的候选缓存，供第二阶段模型裁决使用 */
const judgedCache = new Map(); // searchId -> { target, candidates, keyword, createdAt }
const JUDGE_CACHE_TTL = 10 * 60 * 1000;

function pruneJudgeCache() {
  const now = Date.now();
  for (const [key, value] of judgedCache) {
    if (now - value.createdAt > JUDGE_CACHE_TTL) judgedCache.delete(key);
  }
  // 只保留最近 30 条，避免无限增长
  while (judgedCache.size > 30) judgedCache.delete(judgedCache.keys().next().value);
}

const mapSong = (row) => ({
  id: row.id,
  title: row.title,
  artist: row.artist_name || row.artist_text,
  artistText: row.artist_text,
  album: row.album_name || '',
  duration: row.duration,
  src: row.src,
  cover: row.cover,
  lrc: row.lrc,
  source: row.source,
  sourceId: row.source_id,
  playable: Boolean(row.playable),
  externalUrl: row.external_url,
  fileSize: row.file_size,
  createdAt: row.created_at,
});

const mapTask = (row) => ({
  id: row.id,
  action: row.action,
  target: row.target,
  status: row.status,
  step: row.step,
  progress: row.progress,
  message: row.message,
  songId: row.song_id,
  payload: row.payload,
  createdAt: row.created_at,
});

async function createTask(action, target) {
  const id = crypto.randomUUID();
  await query('INSERT INTO import_tasks (id, action, target, status, step, progress) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    action,
    target,
    'running',
    '准备中',
    5,
  ]);
  return id;
}

const updateTask = (id, patch) => {
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(patch)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  params.push(id);
  return query(`UPDATE import_tasks SET ${sets.join(', ')} WHERE id = ?`, params);
};

/** 模型可用性 */
router.get('/agent/status', adminRequired, async (_req, res) => {
  const status = await agentStatus();
  res.json(status);
});

/* ─────────────────── 账号管理 ─────────────────── */

const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,16}$/;

const mapUser = (row) => ({
  id: row.id,
  username: row.username,
  nickname: row.nickname,
  role: row.role,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at ?? null,
});

/** 账号列表 */
router.get('/users', adminRequired, async (req, res) => {
  const rows = await query('SELECT id, username, nickname, role, created_at, last_login_at FROM users ORDER BY id');
  res.json({ items: rows.map(mapUser), currentId: Number(req.auth.sub) });
});

/** 新建账号（管理员可直接指定角色） */
router.post('/users', adminRequired, async (req, res) => {
  const { username, password, nickname, role } = req.body || {};
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) return res.status(400).json({ error: '账号需为 2-16 位中文、字母、数字或下划线' });
  if (String(password || '').length < 6) return res.status(400).json({ error: '密码长度不能少于 6 位' });
  const exists = await queryOne('SELECT id FROM users WHERE username = ?', [name]);
  if (exists) return res.status(409).json({ error: '该账号已存在' });

  const hash = await bcrypt.hash(String(password), 10);
  const insert = await query('INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)', [
    name,
    hash,
    String(nickname || '').trim() || name,
    role === 'admin' ? 'admin' : 'user',
  ]);
  const row = await queryOne('SELECT id, username, nickname, role, created_at, last_login_at FROM users WHERE id = ?', [
    insert.insertId,
  ]);
  return res.json({ user: mapUser(row) });
});

/** 修改昵称 / 角色 */
router.patch('/users/:id', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  const { nickname, role } = req.body || {};
  const target = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '账号不存在' });

  const sets = [];
  const params = [];

  if (nickname !== undefined) {
    const value = String(nickname).trim();
    if (!value) return res.status(400).json({ error: '昵称不能为空' });
    sets.push('nickname = ?');
    params.push(value);
  }

  if (role !== undefined && role !== target.role) {
    const nextRole = role === 'admin' ? 'admin' : 'user';
    if (id === Number(req.auth.sub) && nextRole !== 'admin') {
      return res.status(400).json({ error: '不能取消自己的管理员权限，请让其他管理员操作' });
    }
    if (target.role === 'admin' && nextRole !== 'admin') {
      const [{ total }] = await query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
      if (Number(total) <= 1) return res.status(400).json({ error: '至少要保留一个管理员' });
    }
    sets.push('role = ?');
    params.push(nextRole);
  }

  if (!sets.length) return res.status(400).json({ error: '没有需要更新的字段' });
  params.push(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  const row = await queryOne('SELECT id, username, nickname, role, created_at, last_login_at FROM users WHERE id = ?', [id]);
  return res.json({ user: mapUser(row) });
});

/** 重置密码（管理员可重置任意账号，包括自己） */
router.post('/users/:id/password', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (String(password || '').length < 6) return res.status(400).json({ error: '密码长度不能少于 6 位' });
  const target = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  const hash = await bcrypt.hash(String(password), 10);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
  return res.json({ ok: true });
});

/** 删除账号 */
router.delete('/users/:id', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (id === Number(req.auth.sub)) return res.status(400).json({ error: '不能删除当前登录的账号' });
  const target = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  if (target.role === 'admin') {
    const [{ total }] = await query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
    if (Number(total) <= 1) return res.status(400).json({ error: '至少要保留一个管理员' });
  }
  await query('DELETE FROM users WHERE id = ?', [id]);
  return res.json({ ok: true });
});

/**
 * 候选封面代理：源站图片直连浏览器常被跨域/网络策略挡住，
 * 由服务端取回转发给前端。
 *
 * 注意：该接口不能要求 Authorization —— <img src> 无法携带请求头。
 * 因此安全性依赖「域名白名单 + 仅转发图片」，不落盘、不缓存到磁盘。
 */
const COVER_HOST_ALLOW = [/(^|\.)music\.126\.net$/i, /(^|\.)qijieya\.cn$/i];
router.get('/cover', async (req, res) => {
  const raw = String(req.query.url || '');
  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: '封面地址不合法' });
  }
  if (!/^https?:$/.test(target.protocol) || !COVER_HOST_ALLOW.some((re) => re.test(target.hostname))) {
    return res.status(403).json({ error: '该域名不在封面白名单内' });
  }
  // 网易云图床支持 param=WxH 取缩略图，避免把 7MB 原图传给列表
  if (/(^|\.)music\.126\.net$/i.test(target.hostname)) target.searchParams.set('param', '240y240');
  try {
    const upstream = await fetch(target.toString(), { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } });
    const type = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !type.startsWith('image/')) return res.status(502).json({ error: '封面获取失败' });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(buf);
  } catch (error) {
    return res.status(502).json({ error: `封面获取失败：${error.message}` });
  }
});

/** 搜歌 → 候选列表 */
/**
 * 搜歌 → 候选列表
 * 取消机制有两层：
 *  1) 客户端显式取消（推荐）：带上 searchId 调 /search/cancel，服务端立即中止整条流水线；
 *     这一层不受 Vite/nginx 之类的反向代理影响（代理常常不会把客户端断开传递给上游）。
 *  2) 连接断开兜底：直接调后端时，res 关闭也会中止。
 *  3) 超时兜底：超过 SEARCH_TIMEOUT_MS 自动中止，保证任务不会一直跑。
 */
const runningSearches = new Map(); // searchId -> { controller, cancelledByUser, startedAt }

router.post('/search/cancel', adminRequired, (req, res) => {
  const searchId = String(req.body?.searchId || '');
  const entry = searchId ? runningSearches.get(searchId) : null;
  if (!entry) return res.json({ cancelled: false, message: '没有正在进行的搜索' });
  entry.cancelledByUser = true;
  entry.controller.abort();
  return res.json({ cancelled: true });
});

router.post('/search', adminRequired, async (req, res) => {
  const { query: rawQuery, searchId: rawSearchId } = req.body || {};
  const searchId = String(rawSearchId || crypto.randomUUID());

  // 同一个 searchId 重复发起时，先把上一次中止掉
  runningSearches.get(searchId)?.controller.abort();

  const controller = new AbortController();
  const entry = { controller, cancelledByUser: false, startedAt: Date.now() };
  runningSearches.set(searchId, entry);

  let timedOut = false;
  const onClientGone = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClientGone);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SEARCH_TIMEOUT_MS);

  try {
    // 第一阶段：只做召回/探测/规则打分，先快速返回给界面（通常 2–4 秒）
    const result = await collectCandidates(rawQuery, { signal: controller.signal, skipJudge: true });
    judgedCache.set(searchId, {
      target: result.target,
      candidates: result.candidates,
      query: result.query,
      createdAt: Date.now(),
    });
    pruneJudgeCache();
    return res.json({ ...result, searchId, judged: false, judgePending: result.agentEnabled && result.candidates.length > 0 });
  } catch (error) {
    const cancelled = Boolean(error.cancelled) || controller.signal.aborted;
    if (cancelled) {
      const reason = timedOut ? '超时中止' : entry.cancelledByUser ? '用户取消' : '连接断开';
      const message = timedOut
        ? `搜索超过 ${SEARCH_TIMEOUT_MS / 1000} 秒已自动中止，请重试或换个关键词`
        : '搜索已取消';
      console.log(`[search] ${reason}：${String(rawQuery || '').slice(0, 40)}`);
      if (!res.writableEnded) res.status(499).json({ error: message, cancelled: true, timedOut, searchId });
      return undefined;
    }
    return res.status(400).json({ error: error.message, searchId });
  } finally {
    clearTimeout(timer);
    res.off('close', onClientGone);
    if (runningSearches.get(searchId) === entry) runningSearches.delete(searchId);
  }
});

/**
 * 第二阶段：模型裁决
 * 候选先以上面 /search 的规则结果返回，界面渲染完后调用这里补上模型判定，
 * 这样"模型慢"不会拖住整个搜索（实测裁决 3–17 秒且波动很大）。
 */
router.post('/judge', adminRequired, async (req, res) => {
  const { searchId: rawSearchId } = req.body || {};
  const searchId = String(rawSearchId || '');
  const cached = judgedCache.get(searchId);
  if (!cached) return res.status(404).json({ error: '候选已过期，请重新搜索' });

  runningSearches.get(searchId)?.controller.abort();
  const controller = new AbortController();
  const entry = { controller, cancelledByUser: false, startedAt: Date.now() };
  runningSearches.set(searchId, entry);

  let timedOut = false;
  const onClientGone = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClientGone);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SEARCH_TIMEOUT_MS);

  try {
    const judged = await judgeCandidates({
      target: cached.target,
      candidates: cached.candidates,
      signal: controller.signal,
    });
    return res.json({ searchId, judged: true, ...judged });
  } catch (error) {
    const cancelled = Boolean(error.cancelled) || controller.signal.aborted;
    if (cancelled) {
      const reason = timedOut ? '超时中止' : entry.cancelledByUser ? '用户取消' : '连接断开';
      console.log(`[judge] ${reason}：${String(cached.query || '').slice(0, 40)}`);
      if (!res.writableEnded) res.status(499).json({ error: '裁决已取消', cancelled: true, searchId });
      return undefined;
    }
    return res.status(400).json({ error: error.message, searchId });
  } finally {
    clearTimeout(timer);
    res.off('close', onClientGone);
    if (runningSearches.get(searchId) === entry) runningSearches.delete(searchId);
  }
});

/** 确认入库（异步任务 + 轮询进度） */
router.post('/import', adminRequired, async (req, res) => {
  const { server, id, target } = req.body || {};
  if (!server || !id) return res.status(400).json({ error: '缺少候选来源信息' });

  const taskId = await createTask('import', `${target?.title || ''} ${target?.artist || ''}`.trim());
  res.json({ taskId });

  (async () => {
    try {
      const result = await importCandidate({ server, id, target }, (progress) => {
        updateTask(taskId, {
          step: progress.step,
          progress: progress.progress,
          message: progress.message || '',
        }).catch(() => {});
      });
      await updateTask(taskId, {
        status: result.status === 'success' ? 'success' : result.status,
        step: result.status === 'success' ? '完成' : '结束',
        progress: 100,
        message: result.message,
        song_id: result.song?.id ?? result.songId ?? null,
        payload: JSON.stringify(result.song ?? null),
      });
    } catch (error) {
      await updateTask(taskId, { status: 'failed', progress: 100, message: error.message });
    }
  })();
});

/** 任务状态 */
router.get('/tasks/:id', adminRequired, async (req, res) => {
  const row = await queryOne('SELECT * FROM import_tasks WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: '任务不存在' });
  return res.json({ task: mapTask(row) });
});

router.get('/tasks', adminRequired, async (_req, res) => {
  const rows = await query('SELECT * FROM import_tasks ORDER BY created_at DESC LIMIT 20');
  res.json({ items: rows.map(mapTask) });
});

/** 本地上传音频 → 自动识别归档 */
router.post('/upload', adminRequired, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择要上传的音频文件' });
  try {
    const result = await archiveUploadedFile({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/** 管理端曲库列表（含无音源项） */
router.get('/songs', adminRequired, async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const playable = String(req.query.playable || '');
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(req.query.size) || 20));

  const where = [];
  const params = [];
  if (keyword) {
    where.push('(s.title LIKE ? OR s.artist_text LIKE ? OR al.name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (playable === '1') where.push('s.playable = 1');
  if (playable === '0') where.push('s.playable = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM songs s LEFT JOIN albums al ON al.id = s.album_id ${whereSql}`,
    params,
  );
  const rows = await query(
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name
       FROM songs s
       LEFT JOIN artists ar ON ar.id = s.artist_id
       LEFT JOIN albums al ON al.id = s.album_id
       ${whereSql}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  res.json({ total: Number(total), page, size, items: rows.map(mapSong) });
});

/** 删除歌曲（同时清理本地文件） */
router.delete('/songs/:id', adminRequired, async (req, res) => {
  const song = await queryOne('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!song) return res.status(404).json({ error: '歌曲不存在' });

  const files = [
    song.src ? path.join(config.media.music, path.basename(song.src)) : '',
    song.cover ? path.join(config.media.covers, path.basename(song.cover)) : '',
    song.lrc ? path.join(config.media.lyrics, path.basename(song.lrc)) : '',
  ].filter(Boolean);
  for (const file of files) await fs.rm(file, { force: true }).catch(() => {});

  await query('DELETE FROM songs WHERE id = ?', [song.id]);
  return res.json({ ok: true, deletedFiles: files.map((f) => path.basename(f)) });
});

/** 手动新增/更新外链（无音源曲目的合规跳转） */
router.patch('/songs/:id', adminRequired, async (req, res) => {
  const { title, artist, album, externalUrl, playable } = req.body || {};
  const song = await queryOne('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!song) return res.status(404).json({ error: '歌曲不存在' });

  const sets = [];
  const params = [];
  if (title) {
    sets.push('title = ?', 'title_key = ?');
    params.push(String(title).trim(), String(title).toLowerCase().replace(/[\s·・.,，、_\-'"!?！？:：]/g, ''));
  }
  if (artist !== undefined) {
    sets.push('artist_text = ?');
    params.push(String(artist).trim());
  }
  if (externalUrl !== undefined) {
    sets.push('external_url = ?');
    params.push(String(externalUrl || ''));
  }
  if (playable !== undefined) {
    sets.push('playable = ?');
    params.push(playable ? 1 : 0);
  }
  if (album) {
    const key = String(album).trim().toLowerCase();
    const albumRow = await queryOne('SELECT id FROM albums WHERE name_key = ? LIMIT 1', [key]);
    if (albumRow) {
      sets.push('album_id = ?');
      params.push(albumRow.id);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '没有需要更新的字段' });
  params.push(song.id);
  await query(`UPDATE songs SET ${sets.join(', ')} WHERE id = ?`, params);
  const updated = await queryOne(
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name FROM songs s
       LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id WHERE s.id = ?`,
    [song.id],
  );
  return res.json({ song: mapSong(updated) });
});

/** 仅元数据入库：为「源站拿不到音源」的曲目先建好歌手/专辑/曲目结构 */
router.post('/metadata-only', adminRequired, async (req, res) => {
  const { title, artist, album, externalUrl } = req.body || {};
  if (!title) return res.status(400).json({ error: '请填写歌名' });
  const { persistSong, findDuplicate } = await import('../music/importer.js');

  // 同样要去重：曲库里已有就不重复建档
  const dup = await findDuplicate(String(title).trim(), String(artist || '').trim());
  if (dup) {
    return res.json({
      status: 'skipped',
      message: `曲库中已有《${dup.title}》- ${dup.artist_text}${dup.album ? `《${dup.album}》` : ''}`,
      song: mapSong({ ...dup, id: dup.id, title: dup.title, artist_text: dup.artist_text }),
    });
  }

  const song = await persistSong({
    source: 'manual',
    sourceId: crypto.randomUUID().slice(0, 16),
    title: String(title).trim(),
    artist: String(artist || '未知歌手').trim(),
    album: String(album || '未知专辑').trim(),
    durationSec: 0,
    audioBuffer: Buffer.alloc(0),
    coverBuffer: null,
    coverExt: 'jpg',
    lyricsText: '',
    externalUrl: externalUrl || `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${title} ${artist || ''}`.trim())}`,
    playable: false,
  });
  res.json({ song: mapSong(song) });
});

export default router;
