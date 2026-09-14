/**
 * 「我的音乐」私有数据接口（全部需要登录）
 *
 * 数据归属靠 user_id + req.auth.sub 强制约束：
 *   - 所有查询都带 user_id = 当前登录用户
 *   - 所有对歌单的写操作都先校验该歌单属于当前用户，防止越权改别人的歌单
 *
 * song_id 用前端 Song.id（来源侧 ID 字符串），理由见 db.js 的注释。
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { query, queryOne } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();
router.use(authRequired);

const RECENT_LIMIT = 100;
const TITLE_LIMIT = 30;
const DESC_LIMIT = 200;
/** 批量移除时一次最多处理这么多首，避免超长 IN 子句 */
const BULK_LIMIT = 500;
const PASSWORD_MIN = 6;

const uid = (req) => Number(req.auth.sub);

/**
 * 把 DATE / DATETIME 值转成 YYYY-MM-DD（本地时区）。
 * 连接池配了 timezone: 'local'，所以 mysql2 返回的是本地时间的 Date 对象；
 * 但仍兼容 dateStrings 模式下返回字符串的情况，避免跨时区解析偏一天。
 */
function toDateKey(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

const mapPlaylist = (row, songIds = []) => ({
  id: String(row.id),
  title: row.title,
  desc: row.description || '',
  cover: row.cover || '',
  songIds,
  createdAt: new Date(row.created_at).getTime(),
  updatedAt: new Date(row.updated_at).getTime(),
});

/** 按 kind 取 id 列表（按加入时间倒序 = 最近加入的在前） */
async function idsOf(userId, kind, limit = 0) {
  const sql =
    `SELECT song_id FROM user_songs WHERE user_id = ? AND kind = ? ORDER BY created_at DESC, id DESC` +
    (limit ? ' LIMIT ?' : '');
  const rows = await query(sql, limit ? [userId, kind, limit] : [userId, kind]);
  return rows.map((r) => r.song_id);
}

/** 一次取回该用户某个歌单的歌曲 id（含顺序） */
async function songIdsOfPlaylists(playlistIds) {
  if (!playlistIds.length) return new Map();
  const placeholders = playlistIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT playlist_id, song_id FROM user_playlist_songs
      WHERE playlist_id IN (${placeholders})
      ORDER BY added_at DESC, id DESC`,
    playlistIds,
  );
  const map = new Map();
  for (const row of rows) {
    const key = String(row.playlist_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.song_id);
  }
  return map;
}

/* ─────────────── 读取：一次性返回全部「我的音乐」 ─────────────── */

router.get('/library', async (req, res) => {
  const userId = uid(req);
  const [liked, recent, collectedRows, playlistRows] = await Promise.all([
    idsOf(userId, 'like'),
    idsOf(userId, 'recent', RECENT_LIMIT),
    query('SELECT playlist_id FROM user_collected_playlists WHERE user_id = ? ORDER BY created_at DESC, id DESC', [userId]),
    query('SELECT * FROM user_playlists WHERE user_id = ? ORDER BY updated_at DESC, id DESC', [userId]),
  ]);

  const songIdsByPlaylist = await songIdsOfPlaylists(playlistRows.map((p) => p.id));

  res.json({
    liked,
    recent,
    collected: collectedRows.map((r) => r.playlist_id),
    playlists: playlistRows.map((p) => mapPlaylist(p, songIdsByPlaylist.get(String(p.id)) ?? [])),
  });
});

/* ─────────────── 喜欢 ─────────────── */

/** 切换喜欢状态，返回切换后的结果 */
router.post('/likes/:songId', async (req, res) => {
  const userId = uid(req);
  const songId = String(req.params.songId);
  const existing = await queryOne('SELECT id FROM user_songs WHERE user_id = ? AND song_id = ? AND kind = ?', [
    userId,
    songId,
    'like',
  ]);
  if (existing) {
    await query('DELETE FROM user_songs WHERE id = ?', [existing.id]);
    return res.json({ liked: false });
  }
  await query('INSERT INTO user_songs (user_id, song_id, kind) VALUES (?, ?, ?)', [userId, songId, 'like']);
  return res.json({ liked: true });
});

/* ─────────────── 收藏官方歌单 ─────────────── */

router.post('/collected/:playlistId', async (req, res) => {
  const userId = uid(req);
  const playlistId = String(req.params.playlistId);
  const existing = await queryOne('SELECT id FROM user_collected_playlists WHERE user_id = ? AND playlist_id = ?', [
    userId,
    playlistId,
  ]);
  if (existing) {
    await query('DELETE FROM user_collected_playlists WHERE id = ?', [existing.id]);
    return res.json({ collected: false });
  }
  await query('INSERT INTO user_collected_playlists (user_id, playlist_id) VALUES (?, ?)', [userId, playlistId]);
  return res.json({ collected: true });
});

/* ─────────────── 最近播放 ─────────────── */

router.post('/recent', async (req, res) => {
  const userId = uid(req);
  const songId = String(req.body?.songId || '');
  if (!songId) return res.status(400).json({ error: '缺少 songId' });

  // 先删后插，让它成为"最近"；同时避免重复
  await query('DELETE FROM user_songs WHERE user_id = ? AND song_id = ? AND kind = ?', [userId, songId, 'recent']);
  await query('INSERT INTO user_songs (user_id, song_id, kind) VALUES (?, ?, ?)', [userId, songId, 'recent']);

  // 只保留最近 RECENT_LIMIT 条
  await query(
    `DELETE FROM user_songs
      WHERE user_id = ? AND kind = 'recent'
        AND id NOT IN (
          SELECT id FROM (
            SELECT id FROM user_songs WHERE user_id = ? AND kind = 'recent'
             ORDER BY created_at DESC, id DESC LIMIT ${RECENT_LIMIT}
          ) keep
        )`,
    [userId, userId],
  );
  return res.json({ ok: true });
});

router.delete('/recent', async (req, res) => {
  await query("DELETE FROM user_songs WHERE user_id = ? AND kind = 'recent'", [uid(req)]);
  res.json({ ok: true });
});

/* ─────────────── 播放埋点与听歌统计 ─────────────── */

/**
 * 记录一次播放。
 *
 * 由前端在「累计播放超过阈值」时调用，而不是一按播放就上报 ——
 * 否则快速切歌会把统计刷得虚高，排行榜也就不准了。
 */
router.post('/plays', async (req, res) => {
  const userId = uid(req);
  const songId = String(req.body?.songId || '').trim().slice(0, 64);
  if (!songId) return res.status(400).json({ error: '缺少 songId' });

  const title = String(req.body?.title || '').trim().slice(0, 255);
  const artist = String(req.body?.artist || '').trim().slice(0, 255);
  // 时长只用于累计，限制在 0~10 小时之间，避免脏数据把总时长撑爆
  const duration = Math.max(0, Math.min(36000, Math.round(Number(req.body?.duration) || 0)));

  await query('INSERT INTO play_events (user_id, song_id, title, artist, duration) VALUES (?, ?, ?, ?, ?)', [
    userId,
    songId,
    title,
    artist,
    duration,
  ]);
  return res.json({ ok: true });
});

/** 听歌统计聚合。days 控制"最近 N 天趋势"的窗口 */
router.get('/stats', async (req, res) => {
  const userId = uid(req);
  const days = Math.min(90, Math.max(7, Math.round(Number(req.query.days) || 14)));

  const [overview] = await query(
    `SELECT COUNT(*) AS totalPlays,
            COALESCE(SUM(duration), 0) AS totalSeconds,
            COUNT(DISTINCT song_id) AS distinctSongs,
            COUNT(DISTINCT NULLIF(artist, '')) AS distinctArtists,
            MIN(played_at) AS firstPlayedAt
       FROM play_events
      WHERE user_id = ?`,
    [userId],
  );

  const topArtists = await query(
    `SELECT artist, COUNT(*) AS plays, COALESCE(SUM(duration), 0) AS seconds
       FROM play_events
      WHERE user_id = ? AND artist <> ''
      GROUP BY artist
      ORDER BY plays DESC, artist ASC
      LIMIT 8`,
    [userId],
  );

  const topSongs = await query(
    `SELECT song_id, MAX(title) AS title, MAX(artist) AS artist, COUNT(*) AS plays
       FROM play_events
      WHERE user_id = ?
      GROUP BY song_id
      ORDER BY plays DESC, song_id ASC
      LIMIT 10`,
    [userId],
  );

  const hourRows = await query(
    `SELECT HOUR(played_at) AS h, COUNT(*) AS plays
       FROM play_events
      WHERE user_id = ?
      GROUP BY h`,
    [userId],
  );

  // days 已钳制为 7~90 的整数，直接内联，避免 INTERVAL ? 的兼容性差异
  const dayRows = await query(
    `SELECT DATE(played_at) AS d, COUNT(*) AS plays
       FROM play_events
      WHERE user_id = ? AND played_at >= DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)
      GROUP BY d
      ORDER BY d`,
    [userId],
  );

  // 24 小时分布：补齐没有播放的小时，前端画图不用再处理空洞
  const hourMap = new Map(hourRows.map((row) => [Number(row.h), Number(row.plays)]));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, plays: hourMap.get(h) || 0 }));

  // 最近 N 天：同样补齐没有播放的日期
  const dayMap = new Map(dayRows.map((row) => [toDateKey(row.d), Number(row.plays)]));
  const byDay = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = toDateKey(date);
    byDay.push({ date: key, plays: dayMap.get(key) || 0 });
  }

  return res.json({
    overview: {
      totalPlays: Number(overview?.totalPlays || 0),
      totalSeconds: Number(overview?.totalSeconds || 0),
      distinctSongs: Number(overview?.distinctSongs || 0),
      distinctArtists: Number(overview?.distinctArtists || 0),
      firstPlayedAt: overview?.firstPlayedAt ? new Date(overview.firstPlayedAt).getTime() : null,
    },
    topArtists: topArtists.map((row) => ({
      artist: row.artist,
      plays: Number(row.plays),
      seconds: Number(row.seconds),
    })),
    topSongs: topSongs.map((row) => ({
      songId: row.song_id,
      title: row.title,
      artist: row.artist,
      plays: Number(row.plays),
    })),
    byHour,
    byDay,
    days,
  });
});

/* ─────────────── 账号自助（改自己的密码） ─────────────── */

/**
 * 修改自己的密码。
 *
 * 只处理「已登录 + 知道旧密码」这一条路径，刻意不做邮箱/手机找回：
 * 那需要引入 SMTP 之类的外部依赖，与「本地曲库演示项目」的定位不符。
 * 管理员重置他人密码仍走 /api/admin/users/:id/password（有超管护栏）。
 */
router.post('/password', async (req, res) => {
  const userId = uid(req);
  const oldPassword = String(req.body?.oldPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!oldPassword) return res.status(400).json({ error: '请输入当前密码' });
  if (newPassword.length < PASSWORD_MIN) return res.status(400).json({ error: `新密码长度不能少于 ${PASSWORD_MIN} 位` });
  if (oldPassword === newPassword) return res.status(400).json({ error: '新密码不能与当前密码相同' });

  const row = await queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!row) return res.status(404).json({ error: '账号不存在' });

  const ok = await bcrypt.compare(oldPassword, row.password_hash);
  if (!ok) return res.status(401).json({ error: '当前密码不正确' });

  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  // 旧 JWT 仍在有效期内也能继续用（改密码不代表踢下线），这里只返回结果
  return res.json({ ok: true });
});

/* ─────────────── 自建歌单 ─────────────── */

/** 校验歌单归属，返回该行或 null */
async function ownPlaylist(userId, rawId) {
  const id = Number(rawId);
  if (!Number.isFinite(id)) return null;
  return queryOne('SELECT * FROM user_playlists WHERE id = ? AND user_id = ?', [id, userId]);
}

router.post('/playlists', async (req, res) => {
  const userId = uid(req);
  const title = String(req.body?.title || '').trim().slice(0, TITLE_LIMIT);
  const desc = String(req.body?.desc || '').trim().slice(0, DESC_LIMIT);
  if (!title) return res.status(400).json({ error: '请填写歌单名称' });

  const result = await query('INSERT INTO user_playlists (user_id, title, description) VALUES (?, ?, ?)', [
    userId,
    title,
    desc,
  ]);
  const row = await queryOne('SELECT * FROM user_playlists WHERE id = ?', [result.insertId]);
  return res.json({ playlist: mapPlaylist(row, []) });
});

router.patch('/playlists/:id', async (req, res) => {
  const userId = uid(req);
  const target = await ownPlaylist(userId, req.params.id);
  if (!target) return res.status(404).json({ error: '歌单不存在' });

  const sets = [];
  const params = [];
  if (req.body?.title !== undefined) {
    const title = String(req.body.title).trim().slice(0, TITLE_LIMIT);
    if (!title) return res.status(400).json({ error: '歌单名称不能为空' });
    sets.push('title = ?');
    params.push(title);
  }
  if (req.body?.desc !== undefined) {
    sets.push('description = ?');
    params.push(String(req.body.desc).trim().slice(0, DESC_LIMIT));
  }
  if (req.body?.cover !== undefined) {
    sets.push('cover = ?');
    params.push(String(req.body.cover || '').trim());
  }
  if (!sets.length) return res.status(400).json({ error: '没有需要更新的字段' });

  params.push(target.id);
  await query(`UPDATE user_playlists SET ${sets.join(', ')} WHERE id = ?`, params);
  const row = await queryOne('SELECT * FROM user_playlists WHERE id = ?', [target.id]);
  const songIds = (await songIdsOfPlaylists([target.id])).get(String(target.id)) ?? [];
  return res.json({ playlist: mapPlaylist(row, songIds) });
});

router.delete('/playlists/:id', async (req, res) => {
  const userId = uid(req);
  const target = await ownPlaylist(userId, req.params.id);
  if (!target) return res.status(404).json({ error: '歌单不存在' });
  // user_playlist_songs 有 ON DELETE CASCADE，会一起清掉
  await query('DELETE FROM user_playlists WHERE id = ?', [target.id]);
  return res.json({ ok: true });
});

/** 添加歌曲到歌单 */
router.post('/playlists/:id/songs', async (req, res) => {
  const userId = uid(req);
  const target = await ownPlaylist(userId, req.params.id);
  if (!target) return res.status(404).json({ error: '歌单不存在' });

  const songId = String(req.body?.songId || '');
  if (!songId) return res.status(400).json({ error: '缺少 songId' });

  const existing = await queryOne('SELECT id FROM user_playlist_songs WHERE playlist_id = ? AND song_id = ?', [
    target.id,
    songId,
  ]);
  if (existing) return res.json({ added: false, message: '这首歌已在歌单里' });

  await query('INSERT INTO user_playlist_songs (playlist_id, song_id) VALUES (?, ?)', [target.id, songId]);
  await query('UPDATE user_playlists SET updated_at = NOW() WHERE id = ?', [target.id]);
  return res.json({ added: true });
});

/** 从歌单移除歌曲 */
router.delete('/playlists/:id/songs/:songId', async (req, res) => {
  const userId = uid(req);
  const target = await ownPlaylist(userId, req.params.id);
  if (!target) return res.status(404).json({ error: '歌单不存在' });

  await query('DELETE FROM user_playlist_songs WHERE playlist_id = ? AND song_id = ?', [target.id, req.params.songId]);
  await query('UPDATE user_playlists SET updated_at = NOW() WHERE id = ?', [target.id]);
  return res.json({ ok: true });
});

/**
 * 批量从歌单移除歌曲（多选删除）。
 *
 * 用 POST 而不是 DELETE：DELETE 带 body 在部分反向代理下会被丢掉，
 * 而这里要传一个数组，走 body 最自然。返回 removed 让前端能核对实际删掉几首。
 */
router.post('/playlists/:id/songs/remove', async (req, res) => {
  const userId = uid(req);
  const target = await ownPlaylist(userId, req.params.id);
  if (!target) return res.status(404).json({ error: '歌单不存在' });

  const raw = Array.isArray(req.body?.songIds) ? req.body.songIds : [];
  const songIds = [...new Set(raw.map((id) => String(id)).filter(Boolean))].slice(0, BULK_LIMIT);
  if (!songIds.length) return res.status(400).json({ error: '请选择要移除的歌曲' });

  const marks = songIds.map(() => '?').join(', ');
  const result = await query(
    `DELETE FROM user_playlist_songs WHERE playlist_id = ? AND song_id IN (${marks})`,
    [target.id, ...songIds],
  );
  await query('UPDATE user_playlists SET updated_at = NOW() WHERE id = ?', [target.id]);
  return res.json({ ok: true, removed: result.affectedRows || 0 });
});

export default router;
