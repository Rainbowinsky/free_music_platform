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

import { query, queryOne } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();
router.use(authRequired);

const RECENT_LIMIT = 100;
const TITLE_LIMIT = 30;
const DESC_LIMIT = 200;

const uid = (req) => Number(req.auth.sub);

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

export default router;
