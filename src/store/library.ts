import { create } from 'zustand';
import type { UserPlaylist } from '../types';
import { store } from '../lib/db';

const RECENT_LIMIT = 100;
const TITLE_LIMIT = 30;

interface LibraryState {
  /** 当前登录账号，null 表示未登录 */
  username: string | null;
  liked: string[];
  collected: string[];
  recent: string[];
  /** 我创建的歌单 */
  playlists: UserPlaylist[];
  /** 切换账号时载入该账号的“我的音乐”数据 */
  loadFor: (username: string | null) => void;
  toggleLike: (songId: string) => void;
  toggleCollect: (playlistId: string) => void;
  addRecent: (songId: string) => void;
  clearRecent: () => void;
  createPlaylist: (title: string, desc?: string) => UserPlaylist | null;
  updatePlaylist: (playlistId: string, patch: Partial<Pick<UserPlaylist, 'title' | 'desc' | 'cover'>>) => void;
  deletePlaylist: (playlistId: string) => void;
  addSongToPlaylist: (playlistId: string, songId: string) => boolean;
  removeSongFromPlaylist: (playlistId: string, songId: string) => void;
}

function newId(): string {
  return `my-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const useLibrary = create<LibraryState>((set, get) => {
  const persist = (patch: { liked?: string[]; collected?: string[]; recent?: string[]; playlists?: UserPlaylist[] }) => {
    const { username } = get();
    if (!username) return;
    store.saveLibrary(username, patch);
  };

  return {
    username: null,
    liked: [],
    collected: [],
    recent: store.getGuestRecent(),
    playlists: [],

    loadFor: (username) => {
      if (!username) {
        // 未登录时“最近播放”按设备保留，其它数据清空
        set({ username: null, liked: [], collected: [], recent: store.getGuestRecent(), playlists: [] });
        return;
      }
      const data = store.getLibrary(username);
      set({
        username,
        liked: data.liked ?? [],
        collected: data.collected ?? [],
        recent: data.recent ?? [],
        playlists: data.playlists ?? [],
      });
    },

    toggleLike: (songId) => {
      const { liked } = get();
      const next = liked.includes(songId) ? liked.filter((id) => id !== songId) : [songId, ...liked];
      set({ liked: next });
      persist({ liked: next });
    },

    toggleCollect: (playlistId) => {
      const { collected } = get();
      const next = collected.includes(playlistId)
        ? collected.filter((id) => id !== playlistId)
        : [playlistId, ...collected];
      set({ collected: next });
      persist({ collected: next });
    },

    addRecent: (songId) => {
      const { recent, username } = get();
      const next = [songId, ...recent.filter((id) => id !== songId)].slice(0, RECENT_LIMIT);
      set({ recent: next });
      if (username) persist({ recent: next });
      else store.saveGuestRecent(next);
    },

    clearRecent: () => {
      set({ recent: [] });
      const { username } = get();
      if (username) persist({ recent: [] });
      else store.saveGuestRecent([]);
    },

    createPlaylist: (title, desc = '') => {
      const name = title.trim().slice(0, TITLE_LIMIT);
      if (!name || !get().username) return null;
      const now = Date.now();
      const playlist: UserPlaylist = {
        id: newId(),
        title: name,
        desc: desc.trim(),
        cover: '',
        songIds: [],
        createdAt: now,
        updatedAt: now,
      };
      const next = [playlist, ...get().playlists];
      set({ playlists: next });
      persist({ playlists: next });
      return playlist;
    },

    updatePlaylist: (playlistId, patch) => {
      const next = get().playlists.map((playlist) =>
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
      persist({ playlists: next });
    },

    deletePlaylist: (playlistId) => {
      const next = get().playlists.filter((playlist) => playlist.id !== playlistId);
      set({ playlists: next });
      persist({ playlists: next });
    },

    addSongToPlaylist: (playlistId, songId) => {
      const target = get().playlists.find((playlist) => playlist.id === playlistId);
      if (!target || target.songIds.includes(songId)) return false;
      const next = get().playlists.map((playlist) =>
        playlist.id === playlistId
          ? { ...playlist, songIds: [songId, ...playlist.songIds], updatedAt: Date.now() }
          : playlist,
      );
      set({ playlists: next });
      persist({ playlists: next });
      return true;
    },

    removeSongFromPlaylist: (playlistId, songId) => {
      const next = get().playlists.map((playlist) =>
        playlist.id === playlistId
          ? { ...playlist, songIds: playlist.songIds.filter((id) => id !== songId), updatedAt: Date.now() }
          : playlist,
      );
      set({ playlists: next });
      persist({ playlists: next });
    },
  };
});
