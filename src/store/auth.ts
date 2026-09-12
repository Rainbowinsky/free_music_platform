import { create } from 'zustand';
import type { User } from '../types';
import { authApi, AuthError, store } from '../lib/db';
import { migrateLegacyLibrary } from './migrate';
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
    // 账号体系切到后端后，旧版本地会话（无 token）不再有效。
    // 清掉它并提示「重新登录」，同时旧数据仍按 username 保留，重新注册同名账号即可继承。
    const legacyName = store.takeLegacySession();
    const session = store.getSession();
    if (session) {
      void useLibrary.getState().loadFor(session.user.username);
    } else {
      void useLibrary.getState().loadFor(null);
    }
    set({
      user: session?.user ?? null,
      booted: true,
      ...(legacyName
        ? {
            modalOpen: false,
            modalHint: `账号体系已升级：请用「${legacyName}」重新登录或注册，你的收藏与歌单会保留`,
          }
        : {}),
    });

    // 有本地会话就用 JWT 向后端确认一次：账号被删或 token 过期时自动登出
    if (session?.token) {
      authApi
        .me(session.token)
        .then((user) => {
          store.setSession({ token: session.token, user });
          set({ user });
        })
        .catch((error) => {
          // 网络不通不代表登录失效（例如后端没起），此时保留本地会话，避免误踢下线
          if (error instanceof AuthError && error.status === 0) return;
          store.setSession(null);
          void useLibrary.getState().loadFor(null);
          set({ user: null });
        });
    }
  },

  openModal: (hint = '') => set({ modalOpen: true, modalHint: hint }),
  closeModal: () => set({ modalOpen: false, modalHint: '' }),

  login: async (username, password) => {
    const { user, token } = await authApi.login(username, password);
    store.setSession({ token, user });
    // 先拉后端数据，再把旧版 localStorage 里的「我的音乐」补齐进去（只补空位，不覆盖）
    await useLibrary.getState().loadFor(user.username);
    await migrateLegacyLibrary(token, user.username);
    set({ user, modalOpen: false, modalHint: '' });
  },

  register: async (username, password, nickname) => {
    const { user, token } = await authApi.register(username, password, nickname);
    store.setSession({ token, user });
    // 注册同名账号时把旧版本地数据推到后端（喜欢 / 收藏 / 歌单 / 最近播放）
    await useLibrary.getState().loadFor(user.username);
    await migrateLegacyLibrary(token, user.username);
    // 旧记录里的明文密码已经没有意义，去掉它
    store.dropLegacyUser(user.username);
    set({ user, modalOpen: false, modalHint: '' });
  },

  logout: () => {
    store.setSession(null);
    void useLibrary.getState().loadFor(null);
    set({ user: null });
  },
}));
