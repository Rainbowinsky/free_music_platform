import { create } from 'zustand';
import type { Song, UserPlaylist } from '../types';
import { meApi, MeError, store } from '../lib/db';

const RECENT_LIMIT = 100;
const TITLE_LIMIT = 30;

interface LibraryState {
  /** 当前登录账号，null 表示未登录 */
  username: string | null;
  /** 是否正在从后端拉取「我的音乐」，首次进入时用于展示骨架屏 */
  loading: boolean;
  /** 后端不可达时的提示，界面上可以给用户一个明确的解释 */
  error: string;
  liked: string[];
  collected: string[];
  recent: string[];
  /** 我创建的歌单 */
  playlists: UserPlaylist[];
  /**
   * 切换账号时载入该账号的「我的音乐」数据。
   * 登录后调用 loadFor(username) 会向后端拉取；传 null 表示退出登录。
   */
  loadFor: (username: string | null) => Promise<void>;
  toggleLike: (songId: string) => Promise<void>;
  toggleCollect: (playlistId: string) => Promise<void>;
  addRecent: (songId: string) => Promise<void>;
  clearRecent: () => Promise<void>;
  /**
   * 上报一次播放（听歌统计用）。播放器在累计听够阈值后调用一次。
   * 未登录时静默跳过——统计是账号级数据，游客没有归属处。
   */
  recordPlay: (song: Song) => void;
  createPlaylist: (title: string, desc?: string) => Promise<UserPlaylist | null>;
  updatePlaylist: (playlistId: string, patch: Partial<Pick<UserPlaylist, 'title' | 'desc' | 'cover'>>) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
}

/** 把错误转成一句能给用户看的话 */
function describe(error: unknown): string {
  if (error instanceof MeError) {
    // status 0 = 网络不通 / 后端没启动
    if (error.status === 0) return '无法连接服务器，我的音乐暂时无法同步（请确认后端已启动）';
    if (error.status === 401) return '登录状态已过期，请重新登录';
    return error.message;
  }
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export const useLibrary = create<LibraryState>((set, get) => {
  /**
   * 只在已登录且 token 存在时发起请求。
   * 返回 null 表示当前不可写（未登录），调用方应保持本地状态不变。
   */
  const guard = (): string | null => {
    const { username } = get();
    if (!username) return null;
    const token = store.getToken();
    return token || null;
  };

  return {
    username: null,
    loading: false,
    error: '',
    liked: [],
    collected: [],
    recent: store.getGuestRecent(),
    playlists: [],

    loadFor: async (username) => {
      if (!username) {
        // 未登录时「最近播放」按设备保留在本地，其余数据清空
        set({ username: null, liked: [], collected: [], recent: store.getGuestRecent(), playlists: [], error: '', loading: false });
        return;
      }

      const token = store.getToken();
      if (!token) {
        // 有账号名但没有 token（异常状态）：按未登录处理，避免误以为数据丢了
        set({ username, liked: [], collected: [], recent: [], playlists: [], loading: false });
        return;
      }

      // 先清空旧账号的数据，避免切换账号时短暂看到上一个人的内容
      set({ username, loading: true, error: '', liked: [], collected: [], recent: [], playlists: [] });

      try {
        const data = await meApi.library(token);
        // 期间又切了账号就丢弃这次结果
        if (get().username !== username) return;
        set({
          liked: data.liked,
          collected: data.collected,
          recent: data.recent,
          playlists: data.playlists,
          loading: false,
        });
      } catch (error) {
        if (get().username !== username) return;
        set({ loading: false, error: describe(error) });
      }
    },

    toggleLike: async (songId) => {
      const token = guard();
      const { liked } = get();
      const isLiked = liked.includes(songId);
      const next = isLiked ? liked.filter((id) => id !== songId) : [songId, ...liked];

      if (!token) {
        // 未登录：只改内存，不落盘（界面会引导登录）
        set({ liked: next });
        return;
      }

      // 乐观更新：先改界面，失败再回滚
      set({ liked: next });
      try {
        const result = await meApi.toggleLike(token, songId);
        // 以服务端结果为准，防止快速连点造成状态漂移
        const current = get().liked;
        const aligned = result.liked
          ? [songId, ...current.filter((id) => id !== songId)]
          : current.filter((id) => id !== songId);
        set({ liked: aligned, error: '' });
      } catch (error) {
        set({ liked, error: describe(error) });
      }
    },

    toggleCollect: async (playlistId) => {
      const token = guard();
      const { collected } = get();
      const next = collected.includes(playlistId)
        ? collected.filter((id) => id !== playlistId)
        : [playlistId, ...collected];

      if (!token) {
        set({ collected: next });
        return;
      }

      set({ collected: next });
      try {
        const result = await meApi.toggleCollect(token, playlistId);
        const current = get().collected;
        const aligned = result.collected
          ? [playlistId, ...current.filter((id) => id !== playlistId)]
          : current.filter((id) => id !== playlistId);
        set({ collected: aligned, error: '' });
      } catch (error) {
        set({ collected, error: describe(error) });
      }
    },

    addRecent: async (songId) => {
      const { recent } = get();
      const next = [songId, ...recent.filter((id) => id !== songId)].slice(0, RECENT_LIMIT);
      set({ recent: next });

      const token = guard();
      if (!token) {
        // 未登录：最近播放按设备存本地
        store.saveGuestRecent(next);
        return;
      }
      try {
        await meApi.addRecent(token, songId);
      } catch (error) {
        // 最近播放失败不打扰用户（播放本身不该被同步问题打断），只记录提示
        set({ error: describe(error) });
      }
    },

    recordPlay: (song) => {
      const token = guard();
      // 统计是账号级数据，未登录不上报
      if (!token) return;
      void meApi
        .recordPlay(token, {
          songId: song.id,
          title: song.name,
          artist: song.artist,
          duration: Math.round(song.duration || 0),
        })
        .catch(() => {
          // 统计上报失败不该影响播放，静默忽略
        });
    },

    clearRecent: async () => {
      const previous = get().recent;
      set({ recent: [] });

      const token = guard();
      if (!token) {
        store.saveGuestRecent([]);
        return;
      }
      try {
        await meApi.clearRecent(token);
        set({ error: '' });
      } catch (error) {
        set({ recent: previous, error: describe(error) });
      }
    },

    createPlaylist: async (title, desc = '') => {
      const name = title.trim().slice(0, TITLE_LIMIT);
      const token = guard();
      if (!name || !token) return null;

      try {
        const playlist = await meApi.createPlaylist(token, name, desc.trim());
        set({ playlists: [playlist, ...get().playlists], error: '' });
        return playlist;
      } catch (error) {
        set({ error: describe(error) });
        return null;
      }
    },

    updatePlaylist: async (playlistId, patch) => {
      const token = guard();
      if (!token) return;
      const previous = get().playlists;

      // 乐观更新
      const next = previous.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              ...patch,
              title: (patch.title ?? playlist.title).trim().slice(0, TITLE_LIMIT) || playlist.title,
              desc: patch.desc !== undefined ? patch.desc.trim() : playlist.desc,
              updatedAt: Date.now(),
            }
          : playlist,
      );
      set({ playlists: next });

      try {
        const updated = await meApi.updatePlaylist(token, playlistId, patch);
        set({ playlists: get().playlists.map((p) => (p.id === playlistId ? updated : p)), error: '' });
      } catch (error) {
        set({ playlists: previous, error: describe(error) });
      }
    },

    deletePlaylist: async (playlistId) => {
      const token = guard();
      const previous = get().playlists;
      set({ playlists: previous.filter((playlist) => playlist.id !== playlistId) });
      if (!token) return;

      try {
        await meApi.deletePlaylist(token, playlistId);
        set({ error: '' });
      } catch (error) {
        set({ playlists: previous, error: describe(error) });
      }
    },

    addSongToPlaylist: async (playlistId, songId) => {
      const target = get().playlists.find((playlist) => playlist.id === playlistId);
      if (!target || target.songIds.includes(songId)) return false;

      const token = guard();
      if (!token) return false;
      const previous = get().playlists;

      // 乐观更新：新加的歌排在最前（与后端 added_at DESC 一致）
      set({
        playlists: previous.map((playlist) =>
          playlist.id === playlistId
            ? { ...playlist, songIds: [songId, ...playlist.songIds], updatedAt: Date.now() }
            : playlist,
        ),
      });

      try {
        const result = await meApi.addSongToPlaylist(token, playlistId, songId);
        set({ error: '' });
        return result.added;
      } catch (error) {
        set({ playlists: previous, error: describe(error) });
        return false;
      }
    },

    removeSongFromPlaylist: async (playlistId, songId) => {
      const token = guard();
      const previous = get().playlists;
      set({
        playlists: previous.map((playlist) =>
          playlist.id === playlistId
            ? { ...playlist, songIds: playlist.songIds.filter((id) => id !== songId), updatedAt: Date.now() }
            : playlist,
        ),
      });
      if (!token) return;

      try {
        await meApi.removeSongFromPlaylist(token, playlistId, songId);
        set({ error: '' });
      } catch (error) {
        set({ playlists: previous, error: describe(error) });
      }
    },
  };
});
