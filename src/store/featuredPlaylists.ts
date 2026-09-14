import { create } from 'zustand';
import type { Playlist } from '../types';
import { PLAYLISTS } from '../data/playlists';

interface ApiPlaylist {
  id: string;
  title: string;
  cover: string;
  desc: string;
  tags: string[];
  playCount: number;
  creator: string;
  songIds: string[];
}

interface FeaturedPlaylistState {
  playlists: Playlist[];
  source: 'api' | 'static';
  status: 'loading' | 'ready';
  error: string;
  load: () => Promise<void>;
}

const toPlaylist = (item: ApiPlaylist): Playlist => ({
  id: item.id,
  title: item.title,
  cover: item.cover || '',
  desc: item.desc || '',
  tags: Array.isArray(item.tags) ? item.tags : [],
  playCount: Number(item.playCount || 0),
  creator: item.creator || 'Free音乐官方',
  songIds: Array.isArray(item.songIds) ? item.songIds : [],
});

/**
 * 首页可管理推荐歌单。
 * 数据库尚未创建歌单或接口不可用时保留内置示例，确保首页不会出现空白。
 */
export const useFeaturedPlaylists = create<FeaturedPlaylistState>((set) => ({
  playlists: PLAYLISTS,
  source: 'static',
  status: 'loading',
  error: '',
  load: async () => {
    try {
      const res = await fetch('/api/library/playlists');
      if (!res.ok) throw new Error(`接口返回 ${res.status}`);
      const data = (await res.json()) as { items?: ApiPlaylist[] };
      const items = (data.items || []).map(toPlaylist);
      // 空数据库不是错误：继续展示项目自带的示例歌单，等待管理员从管理台创建首批歌单。
      if (!items.length) {
        set({ playlists: PLAYLISTS, source: 'static', status: 'ready', error: '' });
        return;
      }
      set({ playlists: items, source: 'api', status: 'ready', error: '' });
    } catch (error) {
      set({
        playlists: PLAYLISTS,
        source: 'static',
        status: 'ready',
        error: error instanceof Error ? error.message : '推荐歌单接口不可用',
      });
    }
  },
}));

export const useFeaturedPlaylistItems = (): Playlist[] => useFeaturedPlaylists((state) => state.playlists);
