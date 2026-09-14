import type { Song } from '../types';

/**
 * 后端曲库接口（/api/library/*）返回的歌曲结构 → 前端 Song 的映射。
 *
 * 单独放一份而不是写在各页面里，是因为歌手页 / 专辑页 / 曲库 store 都要用到同一套字段对齐规则；
 * 尤其是 `id` 的取法（用来源侧 ID）一旦两处不一致，用户的「喜欢」记录就会对不上。
 */
export interface ApiSong {
  id: number;
  title: string;
  artist: string;
  artistText: string;
  album: string;
  albumId?: number | null;
  duration: number;
  src: string;
  cover: string;
  lrc: string;
  source: string;
  sourceId: string;
  playable: boolean;
  externalUrl: string;
}

export const toSong = (row: ApiSong): Song => ({
  // 用来源侧 ID 作为前端 ID：与静态数据的网易云 ID 对齐，历史「喜欢」记录不会失效
  id: row.sourceId || String(row.id),
  name: row.title,
  artist: row.artist,
  album: row.album || '未知专辑',
  albumId: row.albumId ?? null,
  cover: row.cover || '',
  src: row.src || '',
  lrc: row.lrc || undefined,
  duration: row.duration || 0,
  playable: row.playable,
  externalUrl: row.externalUrl || undefined,
});

export const toSongs = (rows: ApiSong[] | undefined): Song[] => (rows ?? []).map(toSong);
