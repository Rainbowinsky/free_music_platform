import { create } from 'zustand';

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
}

let toastId = 0;

export const useUi = create<UiState>((set) => ({
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
}));
