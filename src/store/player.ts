import { create } from 'zustand';
import type { PlayMode, Song } from '../types';
import { store } from '../lib/db';
import { useLibrary } from './library';

/** 全局唯一的 audio 元素，路由切换时不中断播放 */
const audio: HTMLAudioElement = new Audio();
audio.preload = 'auto';
audio.volume = store.getVolume();

interface PlayerState {
  queue: Song[];
  index: number;
  current: Song | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  mode: PlayMode;
  drawerOpen: boolean;
  /** 全屏歌词页是否展开 */
  lyricsOpen: boolean;

  playSong: (song: Song, list?: Song[]) => void;
  playQueue: (list: Song[], startIndex?: number) => void;
  toggle: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  cycleMode: () => void;
  setDrawer: (open: boolean) => void;
  setLyricsOpen: (open: boolean) => void;
  /** 开始拖动进度条：淡出并暂停，拖动期间完全无声 */
  beginScrub: () => void;
  /** 松手：定位完成后恢复播放 */
  endScrub: () => void;
  removeAt: (index: number) => void;
  clearQueue: () => void;
}

function sameSong(a: Song | null, b: Song | null): boolean {
  return !!a && !!b && a.id === b.id;
}

/**
 * 跳转去爆音：MP3 定位时浏览器会从目标帧之前几帧开始解码（预卷），
 * 并把已排入输出缓冲的旧音频播完，听感上就是“咔”声 + 极短的重复回声。
 * 这里用 45ms 淡出 → 定位 → 等 seeked 后再 90ms 淡入，把这段残响压在静音里。
 */
const FADE_STEP_MS = 16;
let fadeTimer: number | null = null;
/** 跳转进行中：期间忽略 timeupdate，避免进度条在定位完成前回跳 */
let seeking = false;
/** 是否正在拖动进度条，以及拖动前是否处于播放状态 */
let scrubbing = false;
let scrubWasPlaying = false;

function cancelFade(): void {
  if (fadeTimer !== null) {
    window.clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fadeVolume(target: number, duration: number, done?: () => void): void {
  cancelFade();
  const safeTarget = Math.min(1, Math.max(0, target));
  if (duration <= 0) {
    audio.volume = safeTarget;
    done?.();
    return;
  }
  const from = audio.volume;
  const steps = Math.max(1, Math.round(duration / FADE_STEP_MS));
  let step = 0;
  fadeTimer = window.setInterval(() => {
    step += 1;
    const k = Math.min(1, step / steps);
    audio.volume = Math.min(1, Math.max(0, from + (safeTarget - from) * k));
    if (k >= 1) {
      cancelFade();
      audio.volume = safeTarget;
      done?.();
    }
  }, FADE_STEP_MS);
}

export const usePlayer = create<PlayerState>((set, get) => {
  const apply = (song: Song, autoplay = true) => {
    // 切歌时取消进行中的淡入淡出，并把音量恢复到用户设定值
    cancelFade();
    audio.volume = get().volume;
    audio.src = song.src;
    audio.currentTime = 0;
    set({
      current: song,
      progress: 0,
      duration: song.duration || 0,
    });
    useLibrary.getState().addRecent(song.id);
    if (autoplay) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => set({ isPlaying: false }));
    }
  };

  audio.addEventListener('timeupdate', () => {
    if (seeking) return;
    set({ progress: audio.currentTime });
  });
  audio.addEventListener('seeked', () => {
    seeking = false;
    set({ progress: audio.currentTime });
  });
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration });
  });
  audio.addEventListener('play', () => set({ isPlaying: true }));
  audio.addEventListener('pause', () => set({ isPlaying: false }));
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration });
  });
  audio.addEventListener('ended', () => get().next(true));
  audio.addEventListener('error', () => set({ isPlaying: false }));

  return {
    queue: [],
    index: -1,
    current: null,
    isPlaying: false,
    progress: 0,
    duration: 0,
    volume: audio.volume,
    muted: audio.muted,
    mode: 'loop',
    drawerOpen: false,
    lyricsOpen: false,

    playSong: (song, list) => {
      const { current, queue } = get();
      if (sameSong(current, song)) {
        const a = audio.paused;
        if (a) void audio.play();
        else audio.pause();
        return;
      }
      const nextQueue = list && list.length ? list : queue.some((s) => s.id === song.id) ? queue : [song];
      const nextIndex = nextQueue.findIndex((s) => s.id === song.id);
      set({ queue: nextQueue, index: nextIndex < 0 ? 0 : nextIndex });
      apply(song);
    },

    playQueue: (list, startIndex = 0) => {
      if (!list.length) return;
      const safeIndex = Math.min(Math.max(0, startIndex), list.length - 1);
      set({ queue: [...list], index: safeIndex });
      apply(list[safeIndex]);
    },

    toggle: () => {
      const { current, queue } = get();
      if (!current) {
        if (queue.length) {
          set({ index: 0 });
          apply(queue[0]);
        }
        return;
      }
      if (audio.paused) void audio.play();
      else audio.pause();
    },

    next: (auto = false) => {
      const { queue, index, mode } = get();
      if (!queue.length) return;
      if (mode === 'single' && auto) {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      if (auto && mode === 'loop' && index === queue.length - 1) {
        // 顺序播放到列表末尾时停止
        audio.pause();
        set({ index: -1, isPlaying: false });
        return;
      }
      let nextIndex: number;
      if (mode === 'random' && queue.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * queue.length);
        } while (nextIndex === index);
      } else {
        nextIndex = (index + 1) % queue.length;
      }
      set({ index: nextIndex });
      apply(queue[nextIndex]);
    },

    prev: () => {
      const { queue, index } = get();
      if (!queue.length) return;
      if (audio.currentTime > 4) {
        audio.currentTime = 0;
        return;
      }
      const prevIndex = (index - 1 + queue.length) % queue.length;
      set({ index: prevIndex });
      apply(queue[prevIndex]);
    },

    seek: (time) => {
      const state = get();
      if (!state.current) return;
      const limit = audio.duration || state.duration || 0;
      const target = Math.min(Math.max(0, time), limit);
      set({ progress: target });

      const volume = state.volume;
      const jump = Math.abs(audio.currentTime - target);

      seeking = true;

      // 暂停中、或位置几乎没变：直接定位，不做音量起伏
      if (audio.paused || jump < 0.05) {
        cancelFade();
        audio.volume = volume;
        audio.currentTime = target;
        window.setTimeout(() => {
          seeking = false;
        }, 600);
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('seeked', finish);
        // 稍等一拍再淡入，把定位后的预卷残响一并压在静音里
        window.setTimeout(() => {
          if (audio.paused) audio.volume = volume;
          else fadeVolume(volume, 90);
        }, 40);
      };

      fadeVolume(0, 45, () => {
        audio.currentTime = target;
        audio.addEventListener('seeked', finish, { once: true });
        // 兜底：个别情况下 seeked 不触发
        window.setTimeout(finish, 260);
      });

      // 看门狗：无论中途发生什么，最终都恢复到用户音量
      window.setTimeout(() => {
        cancelFade();
        seeking = false;
        audio.volume = get().volume;
      }, 800);
    },

    setVolume: (volume) => {
      const v = Math.min(1, Math.max(0, volume));
      cancelFade();
      audio.volume = v;
      audio.muted = v === 0;
      store.setVolume(v);
      set({ volume: v, muted: audio.muted });
    },

    toggleMute: () => {
      audio.muted = !audio.muted;
      set({ muted: audio.muted });
    },

    cycleMode: () => {
      const order: PlayMode[] = ['loop', 'single', 'random'];
      const nextMode = order[(order.indexOf(get().mode) + 1) % order.length];
      set({ mode: nextMode });
    },

    setDrawer: (open) => set({ drawerOpen: open, ...(open ? { lyricsOpen: false } : {}) }),

    setLyricsOpen: (open) => set({ lyricsOpen: open, ...(open ? { drawerOpen: false } : {}) }),

    beginScrub: () => {
      if (scrubbing || !get().current) return;
      scrubbing = true;
      scrubWasPlaying = !audio.paused;
      if (!scrubWasPlaying) return;
      // 60ms 淡出后暂停：拖动期间不播声音，松手才切到目标进度
      fadeVolume(0, 60, () => {
        if (scrubbing && scrubWasPlaying && !audio.paused) audio.pause();
      });
    },

    endScrub: () => {
      if (!scrubbing) return;
      scrubbing = false;
      const wasPlaying = scrubWasPlaying;
      scrubWasPlaying = false;
      if (!wasPlaying) {
        cancelFade();
        audio.volume = get().volume;
        return;
      }
      if (!audio.paused) {
        // 淡出还没走完就松手（例如单击）：恢复音量，交给 seek 自己的淡出淡入处理
        cancelFade();
        audio.volume = get().volume;
        return;
      }
      // 拖动期间已暂停：等定位完成后再恢复播放并淡入
      let resumed = false;
      const resume = () => {
        if (resumed) return;
        resumed = true;
        audio.removeEventListener('seeked', resume);
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => fadeVolume(get().volume, 90)).catch(() => set({ isPlaying: false }));
        } else {
          fadeVolume(get().volume, 90);
        }
      };
      audio.addEventListener('seeked', resume, { once: true });
      window.setTimeout(resume, 320);
      window.setTimeout(() => {
        cancelFade();
        audio.volume = get().volume;
      }, 900);
    },

    removeAt: (target) => {
      const { queue, index } = get();
      if (target < 0 || target >= queue.length) return;
      const nextQueue = queue.filter((_, i) => i !== target);
      if (!nextQueue.length) {
        audio.pause();
        audio.removeAttribute('src');
        set({ queue: [], index: -1, current: null, isPlaying: false, progress: 0, duration: 0 });
        return;
      }
      if (target < index) {
        set({ queue: nextQueue, index: index - 1 });
        return;
      }
      if (target > index) {
        set({ queue: nextQueue });
        return;
      }
      // 删除的是当前播放歌曲
      const nextIndex = Math.min(index, nextQueue.length - 1);
      set({ queue: nextQueue, index: nextIndex });
      apply(nextQueue[nextIndex]);
    },

    clearQueue: () => {
      audio.pause();
      audio.removeAttribute('src');
      set({ queue: [], index: -1, current: null, isPlaying: false, progress: 0, duration: 0, lyricsOpen: false });
    },
  };
});

export const playModeLabel: Record<PlayMode, string> = {
  loop: '列表循环',
  single: '单曲循环',
  random: '随机播放',
};
