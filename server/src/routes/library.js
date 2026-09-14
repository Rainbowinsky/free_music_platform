import { Router } from 'express';

import { query, queryOne } from '../db.js';
import { adminRequired } from '../auth.js';
import { artistKey } from '../music/normalize.js';

const router = Router();

const mapSong = (row) => ({
  id: row.id,
  title: row.title,
  artist: row.artist_name || row.artist_text,
  artistText: row.artist_text,
  album: row.album_name || '',
  // 专辑主键：前端据此把列表里的专辑名做成可跳转的链接
  albumId: row.album_id ?? null,
  duration: row.duration,
  src: row.src,
  cover: row.cover || row.album_cover || '',
  lrc: row.lrc,
  source: row.source,
  // 前端 Song.id、用户收藏和推荐歌单关联均使用来源侧 ID，不使用数据库自增主键。
  sourceId: row.source_id,
  playable: Boolean(row.playable),
  externalUrl: row.external_url,
  fileSize: row.file_size,
  createdAt: row.created_at,
});

/**
 * 专辑行 → 前端结构（专辑列表与详情页共用同一套字段）。
 * 用同一个 mapper 是为了避免列表显示「12 首」、点进去却只有 3 首这种对不上的情况。
 */
const mapAlbum = (row) => ({
  id: Number(row.id),
  name: row.name,
  cover: row.cover || '',
  year: row.year || '',
  artistId: row.artist_id ?? null,
  artistName: row.artist_name || '',
  songCount: Number(row.song_count || 0),
  playableCount: Number(row.playable_count || 0),
  /** 曲目总时长（秒），前端用来显示「共 12 首 · 48 分钟」 */
  totalDuration: Number(row.total_duration || 0),
});

const mapFeaturedPlaylist = (row, songIds = []) => {
  let tags = [];
  try {
    const parsed = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
    tags = Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === 'string').slice(0, 8) : [];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    desc: row.description,
    tags,
    playCount: Number(row.play_count || 0),
    creator: row.creator,
    songIds,
  };
};

/** 首页推荐歌单（为空时前端回退内置展示数据） */
router.get('/playlists', async (_req, res) => {
  const rows = await query(
    `SELECT * FROM featured_playlists
      WHERE visible = 1
      ORDER BY sort_order ASC, created_at DESC`,
  );
  if (!rows.length) return res.json({ items: [] });
  const ids = rows.map((row) => row.id);
  const marks = ids.map(() => '?').join(', ');
  const links = await query(
    `SELECT playlist_id, song_id FROM featured_playlist_songs
      WHERE playlist_id IN (${marks})
      ORDER BY playlist_id, position ASC, created_at ASC`,
    ids,
  );
  const songsByPlaylist = new Map(ids.map((id) => [id, []]));
  for (const link of links) songsByPlaylist.get(link.playlist_id)?.push(link.song_id);
  return res.json({ items: rows.map((row) => mapFeaturedPlaylist(row, songsByPlaylist.get(row.id) || [])) });
});

/** 单个推荐歌单详情（供歌单详情页读取） */
router.get('/playlists/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM featured_playlists WHERE id = ? AND visible = 1', [req.params.id]);
  if (!row) return res.status(404).json({ error: '歌单不存在' });
  const links = await query(
    `SELECT song_id FROM featured_playlist_songs
      WHERE playlist_id = ?
      ORDER BY position ASC, created_at ASC`,
    [row.id],
  );
  return res.json({ playlist: mapFeaturedPlaylist(row, links.map((link) => link.song_id)) });
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
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name, al.cover AS album_cover
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
    // artists.cover 是可选的独立头像（仅少数歌手有）；为空时回退到该歌手任一歌曲的封面，
    // 否则歌手列表页会大面积退化成渐变占位，而详情页却有图（详情页取 songs[0].cover）。
    `SELECT ar.id, ar.name,
            COALESCE(NULLIF(ar.cover, ''), MAX(s.cover)) AS cover,
            COUNT(s.id) AS song_count,
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

/**
 * 某歌手下的专辑与歌曲。
 *
 * `:id` 既接受数字主键，也接受歌手名 —— 主站的歌手页链接用的是名字
 * （`/artist/:name`，因为列表数据里只有歌手名，没有 id），这里统一收口，
 * 免得前端为了拿 id 先去全量拉一遍歌手列表。
 * 名字会先用 artistKey 归一化后按 name_key 兜底匹配，兼容括注、空格与繁简差异。
 */
router.get('/artists/:id', async (req, res) => {
  const raw = String(req.params.id || '').trim();
  if (!raw) return res.status(400).json({ error: '缺少歌手标识' });

  const artist = /^\d+$/.test(raw)
    ? await queryOne('SELECT id, name, cover FROM artists WHERE id = ?', [Number(raw)])
    : await queryOne('SELECT id, name, cover FROM artists WHERE name = ? OR name_key = ?', [raw, artistKey(raw)]);
  if (!artist) return res.status(404).json({ error: '歌手不存在' });

  const albums = await query(
    // 与 /albums 用同一套聚合字段，歌手页的专辑卡片才能显示「曲目数 / 总时长」
    `SELECT ${ALBUM_AGGREGATE}
       FROM albums al
       LEFT JOIN artists ar ON ar.id = al.artist_id
       LEFT JOIN songs s ON s.album_id = al.id
      WHERE al.artist_id = ?
        AND ${ALBUM_NOT_PLACEHOLDER}
      GROUP BY al.id
      ORDER BY COALESCE(NULLIF(al.year, ''), '0000') DESC, al.name ASC`,
    [artist.id],
  );
  const songs = await query(
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name, al.cover AS album_cover
       FROM songs s
       LEFT JOIN artists ar ON ar.id = s.artist_id
       LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.artist_id = ?
      ORDER BY s.album_id, s.id`,
    [artist.id],
  );
  return res.json({
    artist,
    albums: albums.map(mapAlbum),
    songs: songs.map(mapSong),
  });
});

/** 专辑聚合字段（列表与详情共用，避免两处 SQL 漂移出不同的 song_count） */
const ALBUM_AGGREGATE = `al.id, al.name, al.year, al.artist_id,
            MAX(ar.name) AS artist_name,
            COALESCE(NULLIF(al.cover, ''), MAX(s.cover)) AS cover,
            COUNT(s.id) AS song_count,
            SUM(CASE WHEN s.playable = 1 THEN 1 ELSE 0 END) AS playable_count,
            COALESCE(SUM(s.duration), 0) AS total_duration`;

/**
 * 占位专辑过滤条件。
 *
 * 入库时专辑信息拿不到会被写成「未知专辑」（见 music/importer.js），
 * 把它当成一张真专辑铺在专辑库里很突兀，所以**列表类**查询一律滤掉；
 * 但 /albums/:id 仍可直达，歌曲行里的专辑名也照旧显示 —— 只是不给它一个展示位。
 */
const ALBUM_NOT_PLACEHOLDER = "al.name NOT IN ('未知专辑', '未知')";

/**
 * 专辑列表（公开读）。
 *
 * 专辑信息本来就由管理台维护（`/api/admin/albums`），主站此前没有任何公开读接口，
 * 导致管理台整理好的封面与年份在主站完全看不到 —— 专辑页的封面、年份、
 * 「专辑共几首」全都依赖这里。
 *
 * 支持：
 *   keyword  专辑名 / 歌手名模糊匹配
 *   artist   按歌手过滤（走 name_key 归一化，与入库时的 findOrCreateArtist 口径一致）
 *   sort     new（默认，按年份倒序）· hot（曲目最多）· name（专辑名）
 *   page/size 分页，同时返回 total 供前端显示「共 N 张」
 *
 * cover 为空时回退到该专辑任一歌曲的封面（与 /artists 同样的理由，避免整页退化成占位图）。
 */
router.get('/albums', async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const artist = String(req.query.artist || '').trim();
  const sort = String(req.query.sort || 'new');
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(120, Math.max(1, Number(req.query.size) || 48));

  const where = [ALBUM_NOT_PLACEHOLDER];
  const params = [];
  if (keyword) {
    where.push('(al.name LIKE ? OR ar.name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (artist) {
    where.push('(ar.name = ? OR ar.name_key = ?)');
    params.push(artist, artistKey(artist));
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  // 排序走白名单，绝不把用户输入直接拼进 ORDER BY
  const orderSql =
    sort === 'hot'
      ? 'song_count DESC, al.name ASC'
      : sort === 'name'
        ? 'al.name ASC'
        : // 年份缺失的专辑不能排在最前（'' 会排最后），统一当成 '0000'
          "COALESCE(NULLIF(al.year, ''), '0000') DESC, al.name ASC";

  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id ${whereSql}`,
    params,
  );

  const rows = await query(
    `SELECT ${ALBUM_AGGREGATE}
       FROM albums al
       LEFT JOIN artists ar ON ar.id = al.artist_id
       LEFT JOIN songs s ON s.album_id = al.id
       ${whereSql}
      GROUP BY al.id
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );

  return res.json({ total: Number(total), page, size, items: rows.map(mapAlbum) });
});

/**
 * 单个专辑详情：专辑信息 + 全部曲目 + 同歌手其他专辑。
 *
 * `related` 是「更多来自这位歌手」，没有它专辑页就是个孤岛 ——
 * 用户看完一张专辑没法顺着歌手找到下一张。
 */
router.get('/albums/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '专辑 ID 不合法' });

  const album = await queryOne(
    `SELECT al.*, ar.name AS artist_name FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id WHERE al.id = ?`,
    [id],
  );
  if (!album) return res.status(404).json({ error: '专辑不存在' });

  const songs = await query(
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name, al.cover AS album_cover
       FROM songs s
       LEFT JOIN artists ar ON ar.id = s.artist_id
       LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.album_id = ?
      ORDER BY s.id`,
    [album.id],
  );

  const related = album.artist_id
    ? await query(
        `SELECT ${ALBUM_AGGREGATE}
           FROM albums al
           LEFT JOIN artists ar ON ar.id = al.artist_id
           LEFT JOIN songs s ON s.album_id = al.id
          WHERE al.artist_id = ? AND al.id <> ? AND ${ALBUM_NOT_PLACEHOLDER}
          GROUP BY al.id
          ORDER BY COALESCE(NULLIF(al.year, ''), '0000') DESC, al.name ASC
          LIMIT 12`,
        [album.artist_id, album.id],
      )
    : [];

  return res.json({
    album: {
      id: Number(album.id),
      name: album.name,
      cover: album.cover || songs[0]?.cover || '',
      year: album.year || '',
      artistId: album.artist_id ?? null,
      artistName: album.artist_name || '',
      // 曲目统计按实际取到的 songs 算，与列表页的聚合口径保持一致
      songCount: songs.length,
      playableCount: songs.filter((song) => song.playable).length,
      totalDuration: songs.reduce((sum, song) => sum + Number(song.duration || 0), 0),
    },
    songs: songs.map(mapSong),
    related: related.map(mapAlbum),
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
    `SELECT s.*, ar.name AS artist_name, al.name AS album_name, al.cover AS album_cover
       FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.id = ?`,
    [song.id],
  );
  return res.json({ song: mapSong(updated) });
});

export default router;
