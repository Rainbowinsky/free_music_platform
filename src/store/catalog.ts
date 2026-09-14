import { create } from 'zustand';
import type { Song } from '../types';
import { SONGS as STATIC_SONGS, SONG_MAP as STATIC_MAP } from '../data/songs';
import { toSong, type ApiSong } from '../lib/song';

/**
 * 曲库数据源
 *
 * 管理台入库写的是 MySQL + public/ 下的音频文件，所以前端必须从后端接口读曲库，
 * 否则「管理台下载的歌在首页/搜索里看不到」。
 * 后端未启动时自动回退到 src/data/songs.ts 的静态数据，保证站点仍可用。
 */
interface CatalogState {
  songs: Song[];
  map: Record<string, Song>;
  source: 'api' | 'static';
  status: 'loading' | 'ready';
  error: string;
  load: () => Promise<void>;
}

export const useCatalog = create<CatalogState>((set) => ({
  songs: STATIC_SONGS,
  map: STATIC_MAP,
  source: 'static',
  status: 'loading',
  error: '',

  load: async () => {
    try {
      const res = await fetch('/api/library/songs?size=1000');
      if (!res.ok) throw new Error(`接口返回 ${res.status}`);
      const data = (await res.json()) as { items?: ApiSong[] };
      const songs = (data.items ?? []).map(toSong);
      if (!songs.length) throw new Error('接口没有返回曲目');
      const map: Record<string, Song> = {};
      for (const song of songs) map[song.id] = song;
      set({ songs, map, source: 'api', status: 'ready', error: '' });
    } catch (error) {
      // 后端没起或接口异常时回退静态曲库（保持站点可用）
      set({
        songs: STATIC_SONGS,
        map: STATIC_MAP,
        source: 'static',
        status: 'ready',
        error: error instanceof Error ? error.message : '曲库接口不可用',
      });
    }
  },
}));

/** 曲库列表 */
export const useSongs = (): Song[] => useCatalog((s) => s.songs);
/** 曲库索引（按 id 取歌） */
export const useSongMap = (): Record<string, Song> => useCatalog((s) => s.map);
/** 当前数据源，用于界面上提示「本地静态曲库」 */
export const useCatalogSource = () => useCatalog((s) => s.source);
/**
 * 曲库是否仍在加载。
 * 初始 state 里 songs 是内置静态数据，直接渲染会先显示静态曲库再被接口数据替换，
 * 造成一次内容闪动；列表页据此改用骨架屏。
 */
export const useCatalogLoading = (): boolean => useCatalog((s) => s.status === 'loading');

export const getCatalogSongs = (): Song[] => useCatalog.getState().songs;
export const getCatalogMap = (): Record<string, Song> => useCatalog.getState().map;
