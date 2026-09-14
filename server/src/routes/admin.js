import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';

import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { adminRequired, ROLE, roleRank, normalizeRole } from '../auth.js';
import { agentStatus } from '../music/agent.js';
import { artistKey, titleKey } from '../music/normalize.js';
import { archiveUploadedFile, collectCandidates, importCandidate, judgeCandidates } from '../music/importer.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 3, fields: 8 },
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
  cover: row.cover || row.album_cover || '',
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

function detectImageExt(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return '';
}

async function saveCoverAsset(file, prefix) {
  if (!file?.buffer?.length) {
    const error = new Error('请选择封面图片');
    error.status = 400;
    throw error;
  }
  if (file.size > 10 * 1024 * 1024) {
    const error = new Error('封面图片不能超过 10MB');
    error.status = 400;
    throw error;
  }
  const ext = detectImageExt(file.buffer);
  if (!ext) {
    const error = new Error('封面仅支持真实的 JPG、PNG 或 WebP 图片');
    error.status = 400;
    throw error;
  }
  const digest = crypto.createHash('sha1').update(file.buffer).digest('hex').slice(0, 12);
  const filename = `${prefix}-${digest}.${ext}`;
  await fs.mkdir(config.media.covers, { recursive: true });
  await fs.writeFile(path.join(config.media.covers, filename), file.buffer);
  return `/covers/${filename}`;
}

const parseTags = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8);
  return String(value || '')
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
};

const mapFeatured = (row, songIds = []) => {
  let tags = [];
  try {
    const parsed = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    cover: row.cover,
    tags,
    creator: row.creator,
    playCount: Number(row.play_count || 0),
    sortOrder: Number(row.sort_order || 0),
    visible: Boolean(row.visible),
    songIds,
    createdAt: row.created_at,
  };
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

const USER_COLS = 'id, username, nickname, role, created_at, last_login_at';

const countByRole = async (role) => {
  const [row] = await query('SELECT COUNT(*) AS total FROM users WHERE role = ?', [role]);
  return Number(row.total);
};

/**
 * 角色变更的统一护栏。返回错误文案，通过则返回 null。
 *
 * 规则（对应「超管可给任何人管理员权限，但自身不可被降级」）：
 *  1. 只有 superadmin 能授予 / 撤销 admin 权限（admin 之间不能互相提降）
 *  2. superadmin 不能被任何人降级（包括其他 superadmin），保证超管身份稳定
 *  3. 不能修改自己的角色（避免误操作把自己锁死）
 *  4. 其它角色变更仍需保留角色基数
 */
async function checkRoleChange({ actorId, actorRole, target, nextRole }) {
  const targetRole = target.role;
  if (nextRole === targetRole) return null;

  const touchesAdminLevel = roleRank(targetRole) >= 1 || roleRank(nextRole) >= 1;

  // 规则 1：涉及 admin/superadmin 层级的变更，只有超管能操作
  if (touchesAdminLevel && actorRole !== ROLE.SUPERADMIN) {
    return '只有超级管理员可以授予或撤销管理员权限';
  }

  // 规则 2：superadmin 不可被降级
  if (targetRole === ROLE.SUPERADMIN && nextRole !== ROLE.SUPERADMIN) {
    return '超级管理员不能被降级';
  }

  // 规则 3：不能改自己的角色
  if (Number(target.id) === Number(actorId)) {
    return '不能修改自己的角色，请让其他超级管理员操作';
  }

  // 规则 4：仍要保留至少一个 superadmin
  if (targetRole === ROLE.SUPERADMIN) {
    const total = await countByRole(ROLE.SUPERADMIN);
    if (total <= 1) return '系统至少要保留一个超级管理员';
  }

  return null;
}

/** 账号列表（全部账号，含主站注册的普通用户） */
router.get('/users', adminRequired, async (req, res) => {
  const rows = await query(
    `SELECT ${USER_COLS} FROM users
      ORDER BY FIELD(role, 'superadmin', 'admin', 'user'), id`,
  );
  res.json({
    items: rows.map(mapUser),
    currentId: Number(req.auth.sub),
    currentRole: req.auth.role,
    canGrantAdmin: req.auth.role === ROLE.SUPERADMIN,
  });
});

/** 新建账号（超级管理员可直接指定任意角色） */
router.post('/users', adminRequired, async (req, res) => {
  const { username, password, nickname, role } = req.body || {};
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) return res.status(400).json({ error: '账号需为 2-16 位中文、字母、数字或下划线' });
  if (String(password || '').length < 6) return res.status(400).json({ error: '密码长度不能少于 6 位' });
  const exists = await queryOne('SELECT id FROM users WHERE username = ?', [name]);
  if (exists) return res.status(409).json({ error: '该账号已存在' });

  const nextRole = normalizeRole(role);
  // 只有超管能创建 admin / superadmin，普通管理员只能建普通用户
  if (nextRole !== ROLE.USER && req.auth.role !== ROLE.SUPERADMIN) {
    return res.status(403).json({ error: '只有超级管理员可以创建管理员账号' });
  }

  const hash = await bcrypt.hash(String(password), 10);
  const insert = await query('INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)', [
    name,
    hash,
    String(nickname || '').trim() || name,
    nextRole,
  ]);
  const row = await queryOne(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [insert.insertId]);
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
    const nextRole = normalizeRole(role);
    const denied = await checkRoleChange({
      actorId: req.auth.sub,
      actorRole: req.auth.role,
      target,
      nextRole,
    });
    if (denied) return res.status(403).json({ error: denied });
    sets.push('role = ?');
    params.push(nextRole);
  }

  if (!sets.length) return res.status(400).json({ error: '没有需要更新的字段' });
  params.push(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  const row = await queryOne(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
  return res.json({ user: mapUser(row) });
});

/** 重置密码（管理员可重置普通用户；管理员及以上仅超管可重置） */
router.post('/users/:id/password', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (String(password || '').length < 6) return res.status(400).json({ error: '密码长度不能少于 6 位' });
  const target = await queryOne('SELECT id, username, role FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '账号不存在' });

  // 避免普通管理员通过改密码的方式接管管理员/超管账号
  if (target.role !== ROLE.USER && req.auth.role !== ROLE.SUPERADMIN) {
    return res.status(403).json({ error: '只有超级管理员可以重置管理员账号的密码' });
  }

  const hash = await bcrypt.hash(String(password), 10);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
  return res.json({ ok: true });
});

/** 删除账号 */
router.delete('/users/:id', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  const target = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '账号不存在' });

  if (Number(req.auth.sub) === id) return res.status(400).json({ error: '不能删除当前登录的账号' });

  if (target.role === ROLE.SUPERADMIN) {
    return res.status(403).json({ error: '超级管理员不能被删除' });
  }
  if (target.role === ROLE.ADMIN && req.auth.role !== ROLE.SUPERADMIN) {
    return res.status(403).json({ error: '只有超级管理员可以删除管理员账号' });
  }
  if (target.role === ROLE.ADMIN && (await countByRole(ROLE.ADMIN)) <= 1) {
    return res.status(400).json({ error: '至少要保留一个管理员' });
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

/** 本地完整归档：MP3 + 可选 LRC/封面 + 管理员自定义元数据，全程不依赖在线音乐平台 */
router.post(
  '/upload',
  adminRequired,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'lyrics', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
    // 兼容旧前端使用的 file 字段
    { name: 'file', maxCount: 1 },
  ]),
  async (req, res) => {
    const audio = req.files?.audio?.[0] || req.files?.file?.[0];
    const lyrics = req.files?.lyrics?.[0];
    const cover = req.files?.cover?.[0];
    if (!audio) return res.status(400).json({ error: '请选择要上传的 MP3 文件' });
    if (audio.size > 60 * 1024 * 1024) return res.status(400).json({ error: 'MP3 文件不能超过 60MB' });
    if (lyrics && lyrics.size > 2 * 1024 * 1024) return res.status(400).json({ error: 'LRC 文件不能超过 2MB' });
    if (cover && cover.size > 10 * 1024 * 1024) return res.status(400).json({ error: '封面图片不能超过 10MB' });
    if (lyrics && !/\.lrc$/i.test(lyrics.originalname)) return res.status(400).json({ error: '歌词文件必须是 .lrc 格式' });
    if (cover && !/\.(jpe?g|png|webp)$/i.test(cover.originalname)) {
      return res.status(400).json({ error: '封面仅支持 JPG、PNG 或 WebP' });
    }
    try {
      const result = await archiveUploadedFile({
        buffer: audio.buffer,
        filename: audio.originalname,
        mimetype: audio.mimetype,
        lyricsBuffer: lyrics?.buffer ?? null,
        coverBuffer: cover?.buffer ?? null,
        metadata: {
          title: req.body?.title,
          artist: req.body?.artist,
          album: req.body?.album,
          year: req.body?.year,
        },
      });
      return res.json(result);
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message });
    }
  },
);

/** ─────────────────── 歌手 / 专辑管理 ─────────────────── */
router.get('/artists', adminRequired, async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const params = [];
  const where = keyword ? 'WHERE ar.name LIKE ?' : '';
  if (keyword) params.push(`%${keyword}%`);
  const rows = await query(
    `SELECT ar.*, COUNT(DISTINCT s.id) AS song_count, COUNT(DISTINCT al.id) AS album_count
       FROM artists ar
       LEFT JOIN songs s ON s.artist_id = ar.id
       LEFT JOIN albums al ON al.artist_id = ar.id
       ${where}
      GROUP BY ar.id
      ORDER BY song_count DESC, ar.name ASC`,
    params,
  );
  return res.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      cover: row.cover,
      songCount: Number(row.song_count || 0),
      albumCount: Number(row.album_count || 0),
      createdAt: row.created_at,
    })),
  });
});

router.patch('/artists/:id', adminRequired, async (req, res) => {
  const artist = await queryOne('SELECT * FROM artists WHERE id = ?', [req.params.id]);
  if (!artist) return res.status(404).json({ error: '歌手不存在' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: '歌手名称不能为空' });
  const key = artistKey(name);
  const same = await queryOne('SELECT id FROM artists WHERE name_key = ? AND id <> ?', [key, artist.id]);
  if (same) return res.status(409).json({ error: '已有同名歌手，不能合并修改' });
  await query('UPDATE artists SET name = ?, name_key = ? WHERE id = ?', [name, key, artist.id]);
  // 单歌手曲目同步展示文本；合唱等保留原 artist_text，避免破坏署名。
  await query('UPDATE songs SET artist_text = ? WHERE artist_id = ? AND artist_text = ?', [name, artist.id, artist.name]);
  const updated = await queryOne('SELECT * FROM artists WHERE id = ?', [artist.id]);
  return res.json({ artist: updated });
});

router.post('/artists/:id/cover', adminRequired, upload.single('cover'), async (req, res) => {
  const artist = await queryOne('SELECT id FROM artists WHERE id = ?', [req.params.id]);
  if (!artist) return res.status(404).json({ error: '歌手不存在' });
  try {
    const cover = await saveCoverAsset(req.file, `artist-${artist.id}`);
    await query('UPDATE artists SET cover = ? WHERE id = ?', [cover, artist.id]);
    return res.json({ cover });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/albums', adminRequired, async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const params = [];
  const where = keyword ? 'WHERE al.name LIKE ? OR ar.name LIKE ?' : '';
  if (keyword) params.push(`%${keyword}%`, `%${keyword}%`);
  const rows = await query(
    `SELECT al.*, ar.name AS artist_name, COUNT(s.id) AS song_count
       FROM albums al
       LEFT JOIN artists ar ON ar.id = al.artist_id
       LEFT JOIN songs s ON s.album_id = al.id
       ${where}
      GROUP BY al.id
      ORDER BY al.updated_at DESC, al.id DESC`,
    params,
  );
  return res.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      artistId: row.artist_id,
      artistName: row.artist_name || '',
      cover: row.cover,
      year: row.year,
      songCount: Number(row.song_count || 0),
      createdAt: row.created_at,
    })),
  });
});

router.patch('/albums/:id', adminRequired, async (req, res) => {
  const album = await queryOne('SELECT * FROM albums WHERE id = ?', [req.params.id]);
  if (!album) return res.status(404).json({ error: '专辑不存在' });
  const name = String(req.body?.name || '').trim();
  const year = String(req.body?.year ?? album.year ?? '').trim().slice(0, 8);
  if (!name) return res.status(400).json({ error: '专辑名称不能为空' });
  const key = titleKey(name);
  const same = await queryOne('SELECT id FROM albums WHERE artist_id <=> ? AND name_key = ? AND id <> ?', [album.artist_id, key, album.id]);
  if (same) return res.status(409).json({ error: '该歌手下已有同名专辑' });
  await query('UPDATE albums SET name = ?, name_key = ?, year = ? WHERE id = ?', [name, key, year, album.id]);
  const updated = await queryOne(
    `SELECT al.*, ar.name AS artist_name FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id WHERE al.id = ?`,
    [album.id],
  );
  return res.json({ album: updated });
});

router.post('/albums/:id/cover', adminRequired, upload.single('cover'), async (req, res) => {
  const album = await queryOne('SELECT id FROM albums WHERE id = ?', [req.params.id]);
  if (!album) return res.status(404).json({ error: '专辑不存在' });
  try {
    const cover = await saveCoverAsset(req.file, `album-${album.id}`);
    await query('UPDATE albums SET cover = ? WHERE id = ?', [cover, album.id]);
    // 专辑下歌曲没有独立封面时，后续读取自然会通过 album.cover 显示；已有单曲封面不强行覆盖。
    return res.json({ cover });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

/** ─────────────────── 首页推荐歌单管理 ─────────────────── */
async function featuredWithSongs(id) {
  const row = await queryOne('SELECT * FROM featured_playlists WHERE id = ?', [id]);
  if (!row) return null;
  const links = await query(
    'SELECT song_id FROM featured_playlist_songs WHERE playlist_id = ? ORDER BY position ASC, created_at ASC',
    [id],
  );
  return mapFeatured(row, links.map((link) => link.song_id));
}

router.get('/featured-playlists', adminRequired, async (_req, res) => {
  const rows = await query('SELECT * FROM featured_playlists ORDER BY sort_order ASC, created_at DESC');
  const ids = rows.map((row) => row.id);
  if (!ids.length) return res.json({ items: [] });
  const links = await query(
    `SELECT playlist_id, song_id FROM featured_playlist_songs WHERE playlist_id IN (${ids.map(() => '?').join(', ')}) ORDER BY playlist_id, position ASC, created_at ASC`,
    ids,
  );
  const songMap = new Map(ids.map((id) => [id, []]));
  for (const link of links) songMap.get(link.playlist_id)?.push(link.song_id);
  return res.json({ items: rows.map((row) => mapFeatured(row, songMap.get(row.id) || [])) });
});

router.post('/featured-playlists', adminRequired, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: '歌单标题不能为空' });
  const id = `featured-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const [orderRow] = await query('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM featured_playlists');
  await query(
    `INSERT INTO featured_playlists (id, title, description, creator, tags, play_count, sort_order, visible)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title,
      String(req.body?.description || '').trim(),
      String(req.body?.creator || 'Free音乐官方').trim() || 'Free音乐官方',
      JSON.stringify(parseTags(req.body?.tags)),
      Math.max(0, Number(req.body?.playCount) || 0),
      req.body?.sortOrder === undefined ? Number(orderRow?.max_order || -1) + 1 : Number(req.body.sortOrder) || 0,
      req.body?.visible === false ? 0 : 1,
    ],
  );
  return res.status(201).json({ playlist: await featuredWithSongs(id) });
});

router.patch('/featured-playlists/:id', adminRequired, async (req, res) => {
  const current = await queryOne('SELECT * FROM featured_playlists WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: '歌单不存在' });
  const title = req.body?.title === undefined ? current.title : String(req.body.title).trim();
  if (!title) return res.status(400).json({ error: '歌单标题不能为空' });
  const patch = {
    title,
    description: req.body?.description === undefined ? current.description : String(req.body.description || '').trim(),
    creator: req.body?.creator === undefined ? current.creator : String(req.body.creator || '').trim() || 'Free音乐官方',
    tags: req.body?.tags === undefined ? current.tags : JSON.stringify(parseTags(req.body.tags)),
    playCount: req.body?.playCount === undefined ? current.play_count : Math.max(0, Number(req.body.playCount) || 0),
    sortOrder: req.body?.sortOrder === undefined ? current.sort_order : Number(req.body.sortOrder) || 0,
    visible: req.body?.visible === undefined ? current.visible : req.body.visible ? 1 : 0,
  };
  await query(
    `UPDATE featured_playlists
        SET title = ?, description = ?, creator = ?, tags = ?, play_count = ?, sort_order = ?, visible = ?
      WHERE id = ?`,
    [patch.title, patch.description, patch.creator, patch.tags, patch.playCount, patch.sortOrder, patch.visible, current.id],
  );
  return res.json({ playlist: await featuredWithSongs(current.id) });
});

router.delete('/featured-playlists/:id', adminRequired, async (req, res) => {
  const result = await query('DELETE FROM featured_playlists WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: '歌单不存在' });
  return res.json({ ok: true });
});

router.post('/featured-playlists/:id/cover', adminRequired, upload.single('cover'), async (req, res) => {
  const playlist = await queryOne('SELECT id FROM featured_playlists WHERE id = ?', [req.params.id]);
  if (!playlist) return res.status(404).json({ error: '歌单不存在' });
  try {
    const cover = await saveCoverAsset(req.file, `featured-${playlist.id}`);
    await query('UPDATE featured_playlists SET cover = ? WHERE id = ?', [cover, playlist.id]);
    return res.json({ cover });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.put('/featured-playlists/:id/songs', adminRequired, async (req, res) => {
  const playlist = await queryOne('SELECT id FROM featured_playlists WHERE id = ?', [req.params.id]);
  if (!playlist) return res.status(404).json({ error: '歌单不存在' });
  const requested = Array.isArray(req.body?.songIds) ? req.body.songIds.map((id) => String(id)).filter(Boolean) : [];
  const songIds = [...new Set(requested)].slice(0, 500);
  if (songIds.length) {
    const rows = await query(`SELECT source_id FROM songs WHERE source_id IN (${songIds.map(() => '?').join(', ')})`, songIds);
    const valid = new Set(rows.map((row) => String(row.source_id)));
    const missing = songIds.filter((id) => !valid.has(id));
    if (missing.length) return res.status(400).json({ error: `有 ${missing.length} 首歌曲不在曲库中，请刷新后重试` });
  }
  await query('DELETE FROM featured_playlist_songs WHERE playlist_id = ?', [playlist.id]);
  for (const [position, songId] of songIds.entries()) {
    await query('INSERT INTO featured_playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)', [playlist.id, songId, position]);
  }
  return res.json({ playlist: await featuredWithSongs(playlist.id) });
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
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name, al.cover AS album_cover
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
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name, al.cover AS album_cover FROM songs s
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
