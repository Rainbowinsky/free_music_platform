import { create } from 'zustand';
import type { User } from '../types';
import { authApi, store } from '../lib/db';
import { useLibrary } from './library';

interface AuthState {
  user: User | null;
  /** 登录弹窗是否打开 */
  modalOpen: boolean;
  /** 打开弹窗时的提示文案 */
  modalHint: string;
  booted: boolean;
  boot: () => void;
  openModal: (hint?: string) => void;
  closeModal: () => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  modalOpen: false,
  modalHint: '',
  booted: false,

  boot: () => {
    const session = store.getSession();
    useLibrary.getState().loadFor(session ? session.username : null);
    set({ user: session, booted: true });
  },

  openModal: (hint = '') => set({ modalOpen: true, modalHint: hint }),
  closeModal: () => set({ modalOpen: false, modalHint: '' }),

  login: async (username, password) => {
    const user = await authApi.login(username, password);
    store.setSession(user);
    useLibrary.getState().loadFor(user.username);
    set({ user, modalOpen: false, modalHint: '' });
  },

  register: async (username, password, nickname) => {
    const user = await authApi.register(username, password, nickname);
    store.setSession(user);
    useLibrary.getState().loadFor(user.username);
    set({ user, modalOpen: false, modalHint: '' });
  },

  logout: () => {
    store.setSession(null);
    useLibrary.getState().loadFor(null);
    set({ user: null });
  },
}));
