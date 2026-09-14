import type { Album, Song } from '../types';
import { toSongs, type ApiSong } from './song';

/**
 * 专辑数据层
 *
 * 单独抽一份的原因与 lib/song.ts 相同：专辑列表页、专辑详情页、搜索页、
 * 「我的收藏」都要拿同一套字段，字段对齐规则一旦分散在多处就会漂移
 * （典型症状是列表显示「12 首」而详情页只有 3 首）。
 */
export interface ApiAlbum {
  id: number;
  name: string;
  cover: string;
  year: string;
  artistId: number | null;
  artistName: string;
  songCount: number;
  playableCount: number;
  totalDuration: number;
}

export const toAlbum = (row: ApiAlbum): Album => ({
  id: Number(row.id),
  name: row.name,
  cover: row.cover || '',
  year: row.year || '',
  artistId: row.artistId ?? null,
  artistName: row.artistName || '',
  songCount: Number(row.songCount || 0),
  playableCount: Number(row.playableCount || 0),
  totalDuration: Number(row.totalDuration || 0),
});

export const toAlbumList = (rows: ApiAlbum[] | undefined): Album[] => (rows ?? []).map(toAlbum);

/** 专辑排序方式（与后端 /api/library/albums?sort= 的白名单一一对应） */
export type AlbumSort = 'all' | 'new' | 'hot' | 'name';

/**
 * 排序选项。
 * 「综合排序」目前是占位：还没有实现按热度/新鲜度/偏好加权，先按最新发行展示，
 * 等产品层把综合算法定下来再接到后端（界面上用「即将上线」标签明示）。
 */
export const ALBUM_SORTS: { value: AlbumSort; label: string; tag?: string }[] = [
  { value: 'all', label: '综合排序', tag: '即将上线' },
  { value: 'new', label: '最新发行' },
  { value: 'hot', label: '曲目最多' },
  { value: 'name', label: '名称排序' },
];

export const isAlbumSort = (value: string): value is AlbumSort =>
  value === 'all' || value === 'new' || value === 'hot' || value === 'name';

/**
 * 专辑规模标签。
 *
 * 曲库里只有「某专辑收录了几首歌」这一个事实，凭它做行业通用的粗暴划分：
 * 1-3 首算单曲、4-6 首算 EP、7 首以上算专辑。仅作展示，不参与任何逻辑判断。
 */
export function albumKind(songCount: number): string | null {
  if (songCount <= 0) return null;
  if (songCount <= 3) return '单曲';
  if (songCount <= 6) return 'EP';
  return '专辑';
}

export interface AlbumQuery {
  keyword?: string;
  artist?: string;
  sort?: AlbumSort;
  page?: number;
  size?: number;
}

export interface AlbumListResult {
  total: number;
  page: number;
  size: number;
  items: Album[];
}

/** 列表接口不可用时抛出，调用方据此决定是回退本地数据还是直接报错 */
export class AlbumApiError extends Error {}

/** GET /api/library/albums */
export async function fetchAlbums(query: AlbumQuery = {}): Promise<AlbumListResult> {
  const params = new URLSearchParams();
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.artist) params.set('artist', query.artist);
  // 'all'（综合排序）是占位项，算法未定前不传给后端，走后端默认的「最新发行」
  if (query.sort && query.sort !== 'all') params.set('sort', query.sort);
  if (query.page) params.set('page', String(query.page));
  if (query.size) params.set('size', String(query.size));

  const url = `/api/library/albums${params.toString() ? `?${params}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new AlbumApiError('无法连接服务器（请确认后端已启动 npm run server）');
  }
  if (!res.ok) throw new AlbumApiError(`专辑接口返回 ${res.status}`);

  const data = (await res.json()) as { total?: number; page?: number; size?: number; items?: ApiAlbum[] };
  return {
    total: Number(data.total ?? 0),
    page: Number(data.page ?? 1),
    size: Number(data.size ?? 0),
    items: toAlbumList(data.items),
  };
}

export interface AlbumDetailPayload {
  album: Album;
  songs: Song[];
  /** 同歌手的其他专辑（「更多来自这位歌手」） */
  related: Album[];
}

export type AlbumDetailStatus = 'loading' | 'ready' | 'notfound' | 'error';

export interface AlbumDetailResult {
  status: Exclude<AlbumDetailStatus, 'loading'>;
  data?: AlbumDetailPayload;
  error?: string;
}

/** GET /api/library/albums/:id */
export async function fetchAlbumDetail(id: string | number): Promise<AlbumDetailResult> {
  let res: Response;
  try {
    res = await fetch(`/api/library/albums/${encodeURIComponent(String(id))}`);
  } catch {
    return { status: 'error', error: '无法连接服务器（请确认后端已启动 npm run server）' };
  }
  if (res.status === 404) return { status: 'notfound' };
  if (!res.ok) return { status: 'error', error: `专辑接口返回 ${res.status}` };

  const payload = (await res.json()) as {
    album: ApiAlbum;
    songs?: ApiSong[];
    related?: ApiAlbum[];
  };

  return {
    status: 'ready',
    data: {
      album: toAlbum(payload.album),
      songs: toSongs(payload.songs),
      related: toAlbumList(payload.related),
    },
  };
}
