import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'qqmusic.theme';

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia('(prefers-color-scheme: dark)');
}

export function readStoredTheme(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
  } catch {
    return 'system';
  }
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return mediaQuery()?.matches ? 'dark' : 'light';
  return mode;
}

/** 把主题写到 <html data-theme>，CSS 变量据此切换 */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  return resolved;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  init: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: 'system',
  resolved: 'light',

  init: () => {
    const mode = readStoredTheme();
    set({ mode, resolved: applyTheme(mode) });
    // 跟随系统时，系统主题变化要实时同步
    mediaQuery()?.addEventListener('change', () => {
      if (get().mode === 'system') set({ resolved: applyTheme('system') });
    });
  },

  setMode: (mode) => {
    try {
      window.localStorage.setItem(KEY, mode);
    } catch {
      /* 忽略隐私模式写入失败 */
    }
    set({ mode, resolved: applyTheme(mode) });
  },
}));
