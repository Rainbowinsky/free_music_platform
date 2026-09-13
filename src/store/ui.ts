import { create } from 'zustand';
import { store } from '../lib/db';

export interface Toast {
  id: number;
  text: string;
}

type PlaylistModalState = { mode: 'create' } | { mode: 'edit'; playlistId: string } | null;

interface UiState {
  toasts: Toast[];
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
  /** 正在“添加到歌单”的歌曲 */
  addSongId: string | null;
  openAddToPlaylist: (songId: string) => void;
  closeAddToPlaylist: () => void;
  /** 新建 / 编辑歌单弹窗 */
  playlistModal: PlaylistModalState;
  openPlaylistModal: (mode: 'create' | 'edit', playlistId?: string) => void;
  closePlaylistModal: () => void;
  /** 歌词是否显示中文译文（设备级偏好，落 localStorage） */
  showTranslation: boolean;
  toggleTranslation: () => void;
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  toast: (text) => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { id, text }] }));
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
    }, 2200);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),

  addSongId: null,
  openAddToPlaylist: (songId) => set({ addSongId: songId }),
  closeAddToPlaylist: () => set({ addSongId: null }),

  playlistModal: null,
  openPlaylistModal: (mode, playlistId) =>
    set({ playlistModal: mode === 'edit' && playlistId ? { mode, playlistId } : { mode: 'create' } }),
  closePlaylistModal: () => set({ playlistModal: null }),

  showTranslation: store.getShowTranslation(),
  toggleTranslation: () => {
    const next = !get().showTranslation;
    store.setShowTranslation(next);
    set({ showTranslation: next });
  },
}));
