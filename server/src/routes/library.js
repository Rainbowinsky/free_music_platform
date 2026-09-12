import { Router } from 'express';

import { query, queryOne } from '../db.js';
import { adminRequired } from '../auth.js';

const router = Router();

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
  playable: Boolean(row.playable),
  externalUrl: row.external_url,
  fileSize: row.file_size,
  createdAt: row.created_at,
});

/** 曲库列表（公开读） */
router.get('/songs', async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(req.query.size) || 24));
  const onlyPlayable = String(req.query.playable || '') === '1';

  const where = [];
  const params = [];
  if (keyword) {
    where.push('(s.title LIKE ? OR s.artist_text LIKE ? OR al.name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (onlyPlayable) where.push('s.playable = 1');
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
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );

  res.json({ total: Number(total), page, size, items: rows.map(mapSong) });
});

/** 歌手列表（含歌曲数） */
router.get('/artists', async (_req, res) => {
  const rows = await query(
    `SELECT ar.id, ar.name, ar.cover, COUNT(s.id) AS song_count,
            SUM(CASE WHEN s.playable = 1 THEN 1 ELSE 0 END) AS playable_count
       FROM artists ar
       LEFT JOIN songs s ON s.artist_id = ar.id
      GROUP BY ar.id
      ORDER BY song_count DESC, ar.name ASC`,
  );
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      cover: r.cover,
      songCount: Number(r.song_count),
      playableCount: Number(r.playable_count),
    })),
  });
});

/** 某歌手下的专辑与歌曲 */
router.get('/artists/:id', async (req, res) => {
  const artist = await queryOne('SELECT id, name, cover FROM artists WHERE id = ?', [req.params.id]);
  if (!artist) return res.status(404).json({ error: '歌手不存在' });
  const albums = await query('SELECT id, name, cover, year FROM albums WHERE artist_id = ? ORDER BY id', [artist.id]);
  const songs = await query(
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name
       FROM songs s
       LEFT JOIN artists ar ON ar.id = s.artist_id
       LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.artist_id = ?
      ORDER BY s.album_id, s.id`,
    [artist.id],
  );
  return res.json({
    artist,
    albums: albums.map((a) => ({ id: a.id, name: a.name, cover: a.cover, year: a.year })),
    songs: songs.map(mapSong),
  });
});

/** 曲库概览 */
router.get('/stats', async (_req, res) => {
  const [songs] = await query('SELECT COUNT(*) AS total, SUM(playable = 1) AS playable FROM songs');
  const [artists] = await query('SELECT COUNT(*) AS total FROM artists');
  const [albums] = await query('SELECT COUNT(*) AS total FROM albums');
  const [bytes] = await query('SELECT COALESCE(SUM(file_size), 0) AS total FROM songs');
  res.json({
    songs: Number(songs.total),
    playable: Number(songs.playable || 0),
    metaOnly: Number(songs.total) - Number(songs.playable || 0),
    artists: Number(artists.total),
    albums: Number(albums.total),
    totalBytes: Number(bytes.total),
  });
});

/** 管理员：编辑歌曲元数据 */
router.patch('/songs/:id', adminRequired, async (req, res) => {
  const { title, artist, album, externalUrl, playable } = req.body || {};
  const song = await queryOne('SELECT * FROM songs WHERE id = ?', [req.params.id]);
  if (!song) return res.status(404).json({ error: '歌曲不存在' });

  const sets = [];
  const params = [];
  if (title) {
    sets.push('title = ?', 'title_key = ?');
    const key = String(title).toLowerCase().replace(/[\s·・.,，、_\-'"!?！？:：]/g, '');
    params.push(String(title).trim(), key);
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
  if (album !== undefined) {
    const albumRow = await queryOne('SELECT id FROM albums WHERE name = ? LIMIT 1', [String(album).trim()]);
    if (albumRow) {
      sets.push('album_id = ?');
      params.push(albumRow.id);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '没有需要更新的字段' });

  params.push(song.id);
  await query(`UPDATE songs SET ${sets.join(', ')} WHERE id = ?`, params);
  const updated = await queryOne(
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name
       FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.id = ?`,
    [song.id],
  );
  return res.json({ song: mapSong(updated) });
});

export default router;
