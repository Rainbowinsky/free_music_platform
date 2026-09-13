import { create } from 'zustand';
import type { PlayMode, Song } from '../types';
import { store } from '../lib/db';
import { useLibrary } from './library';
import { indexOfSong, insertAfterCurrent, moveInQueue } from '../utils/queue';

/** 全局唯一的 audio 元素，路由切换时不中断播放 */
const audio: HTMLAudioElement = new Audio();
audio.preload = 'auto';
audio.volume = store.getVolume();

/** 上次关闭页面时的播放现场（可能为 null） */
const restored = store.getPlayer();
const restoredPos = store.getPlayerPos();

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
  /**
   * 「下一首播放」：把歌曲插到当前曲目之后。
   * 队列里已有该曲时先摘出来再插，避免出现两条；返回 false 表示它正在播放、无需处理。
   */
  playNext: (song: Song) => boolean;
  /** 拖动排序：把队列中 from 位置的曲目移到 to 位置 */
  moveItem: (from: number, to: number) => void;
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
/** 上次把播放进度写盘的时间戳（毫秒），用于节流 */
let lastPosSave = 0;
/** 当前歌曲累计「真正听到」的秒数，用来判断是否够得上算一次播放 */
let playedSeconds = 0;
/** 本次播放是否已上报过（同一首歌只上报一次） */
let playReported = false;
/** 上一次 timeupdate 的进度，用于算增量 */
let lastTimePos = 0;

/**
 * 算「听够多少秒才算一次播放」。
 * 采用业界常见的 30 秒或半首歌取较小值，并给一个 5 秒下限，
 * 这样快速切歌不会把统计刷高，短音频也不会永远统计不到。
 */
function playThreshold(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 30;
  return Math.max(5, Math.min(30, duration * 0.5));
}

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
    // 上一首的进度存档立刻作废，避免下次启动时错位到新歌上
    store.clearPlayerPos();
    lastPosSave = 0;
    // 换歌后重新累计收听时长，新歌还没听够就不该算一次播放
    playedSeconds = 0;
    playReported = false;
    lastTimePos = 0;
    set({
      current: song,
      progress: 0,
      duration: song.duration || 0,
    });
    // 最近播放是后台同步，失败不该打断播放
    void useLibrary.getState().addRecent(song.id);
    if (autoplay) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => set({ isPlaying: false }));
    }
  };

  /** 把当前进度写盘（带曲目 ID，恢复时校验对得上才采用） */
  const savePos = () => {
    const song = get().current;
    if (!song) return;
    const pos = audio.currentTime;
    if (!Number.isFinite(pos) || pos <= 0) return;
    store.savePlayerPos({ songId: song.id, progress: pos });
  };

  audio.addEventListener('timeupdate', () => {
    if (seeking) return;
    const pos = audio.currentTime;
    set({ progress: pos });

    // 累计真实收听时长：只认正常播放的小增量，跳转产生的大跳不计入
    const delta = pos - lastTimePos;
    lastTimePos = pos;
    if (delta > 0 && delta < 2) playedSeconds += delta;

    // 听够阈值就上报一次播放（同一首歌只上报一次）
    if (!playReported) {
      const song = get().current;
      if (song && playedSeconds >= playThreshold(song.duration || audio.duration || 0)) {
        playReported = true;
        useLibrary.getState().recordPlay(song);
      }
    }

    // 进度每 4 秒落一次盘即可，恢复精度够用又不会频繁写 localStorage
    const now = Date.now();
    if (now - lastPosSave > 4000) {
      lastPosSave = now;
      const song = get().current;
      if (song && Number.isFinite(pos) && pos > 0) store.savePlayerPos({ songId: song.id, progress: pos });
    }

    // 同步系统媒体面板的进度（锁屏 / 媒体键弹窗显示）
    updatePositionState();
    // 临近结尾：提前拉取下一首音源，消除切歌时的加载空窗
    if (Number.isFinite(audio.duration) && audio.duration - pos <= PRELOAD_AHEAD_S) ensurePreload();
  });
  audio.addEventListener('seeked', () => {
    seeking = false;
    // 跳转后重置增量基准，否则这次大跳会被算成"听了很久"
    lastTimePos = audio.currentTime;
    set({ progress: audio.currentTime });
  });
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration });
  });
  audio.addEventListener('play', () => {
    set({ isPlaying: true });
    syncPlaybackState('playing');
  });
  audio.addEventListener('pause', () => {
    set({ isPlaying: false });
    syncPlaybackState('paused');
    // 暂停是"用户可能马上关页面"的时刻，这里强制落一次盘
    savePos();
  });
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration });
  });
  audio.addEventListener('ended', () => get().next(true));
  audio.addEventListener('error', () => set({ isPlaying: false }));

  return {
    queue: restored?.queue ?? [],
    index: restored?.index ?? -1,
    current: restored ? restored.queue[restored.index] ?? null : null,
    isPlaying: false,
    progress: 0,
    duration: restored ? restored.queue[restored.index]?.duration || 0 : 0,
    volume: audio.volume,
    muted: audio.muted,
    mode: restored?.mode ?? 'loop',
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
      // 落盘的清理交给下面的 subscribe（队列变空即删键），避免这里删完又被写回
      set({ queue: [], index: -1, current: null, isPlaying: false, progress: 0, duration: 0, lyricsOpen: false });
    },

    playNext: (song) => {
      const { queue, current } = get();
      // 正在播的就是它，没有"插队"的意义
      if (current && current.id === song.id) return false;
      const nextQueue = insertAfterCurrent(queue, current?.id, song);
      set({ queue: nextQueue, index: indexOfSong(nextQueue, current?.id) });
      return true;
    },

    moveItem: (from, to) => {
      const { queue, index, current } = get();
      if (from === to) return;
      const nextQueue = moveInQueue(queue, from, to);
      if (nextQueue === queue) return;
      // 当前播放曲目的下标跟着一起挪（按 id 重算，避免算错导致进度条串台）
      const nextIndex = current ? indexOfSong(nextQueue, current.id) : index;
      set({ queue: nextQueue, index: nextIndex });
    },
  };
});

/* ── MediaSession：系统媒体键 / 锁屏控制面板 ── */

const mediaSession = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
/** 媒体键快进 / 快退的步长（秒） */
const MEDIA_SEEK_STEP = 10;

/** 相对路径封面 → MediaSession 需要的绝对地址 */
function artworkOf(song: Song): MediaImage[] {
  if (!song.cover) return [];
  try {
    return [{ src: new URL(song.cover, window.location.href).href, sizes: '512x512' }];
  } catch {
    return [];
  }
}

/** 当前曲目同步到系统媒体面板（锁屏 / 媒体键弹窗能看到歌名、歌手、封面） */
function syncMediaSession(song: Song | null): void {
  if (!mediaSession) return;
  try {
    if (!song) {
      mediaSession.metadata = null;
      mediaSession.playbackState = 'none';
      return;
    }
    if ('MediaMetadata' in window) {
      mediaSession.metadata = new MediaMetadata({
        title: song.name,
        artist: song.artist,
        album: song.album,
        artwork: artworkOf(song),
      });
    }
    mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
  } catch {
    /* 个别浏览器实现不完整，忽略 */
  }
}

/** 只同步播放 / 暂停状态（metadata 由 syncMediaSession 负责） */
function syncPlaybackState(state: MediaSessionPlaybackState): void {
  if (!mediaSession) return;
  try {
    mediaSession.playbackState = state;
  } catch {
    /* ignore */
  }
}

/** 把当前进度报给系统面板，锁屏进度条才会动 */
function updatePositionState(): void {
  if (!mediaSession || typeof mediaSession.setPositionState !== 'function') return;
  try {
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    mediaSession.setPositionState({
      duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.currentTime, duration),
    });
  } catch {
    /* ignore */
  }
}

if (mediaSession) {
  const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      mediaSession.setActionHandler(action, handler);
    } catch {
      /* 不支持的动作直接忽略 */
    }
  };
  setHandler('play', () => void audio.play());
  setHandler('pause', () => audio.pause());
  setHandler('previoustrack', () => usePlayer.getState().prev());
  setHandler('nexttrack', () => usePlayer.getState().next());
  setHandler('seekbackward', (details) => {
    const { progress } = usePlayer.getState();
    usePlayer.getState().seek(Math.max(0, progress - (details.seekOffset || MEDIA_SEEK_STEP)));
  });
  setHandler('seekforward', (details) => {
    const { progress } = usePlayer.getState();
    usePlayer.getState().seek(progress + (details.seekOffset || MEDIA_SEEK_STEP));
  });
  setHandler('seekto', (details) => {
    if (typeof details.seekTime === 'number') usePlayer.getState().seek(details.seekTime);
  });
}

/* ── 预加载下一首 ── */

/** 还剩多少秒时开始预热下一首 */
const PRELOAD_AHEAD_S = 20;
let preloader: HTMLAudioElement | null = null;
/** 预热器里正在加载的音源，避免重复赋值打断已有请求 */
let preloadedSrc = '';

/**
 * 预测「自然播放」时的下一首：
 *   单曲循环还是本曲（无需预热）；随机不可预测；顺序播到队尾会停止（没有下一首）。
 */
function predictNext(): Song | null {
  const { queue, index, mode } = usePlayer.getState();
  if (!queue.length || mode === 'single' || mode === 'random') return null;
  if (index < 0 || index >= queue.length - 1) return null;
  return queue[index + 1] ?? null;
}

/** 预热下一首的音源（走 HTTP 缓存），真正切歌时浏览器直接命中缓存，零等待 */
function ensurePreload(): void {
  const src = predictNext()?.src || '';
  if (!src || src === preloadedSrc) return;
  preloadedSrc = src;
  if (!preloader) {
    preloader = new Audio();
    preloader.preload = 'auto';
    preloader.muted = true;
  }
  preloader.src = src;
}

/** 清掉预热缓存（队列清空、无下一首时） */
function dropPreload(): void {
  if (preloader) {
    preloader.pause();
    preloader.removeAttribute('src');
  }
  preloadedSrc = '';
}

/* ── 持久化 ── */

// 队列结构（队列 / 当前下标 / 播放模式）变化时写盘；队列清空则把键整个删掉，
// 否则会留下一个空壳，既没意义又容易和"上次真的播过歌"混淆。
usePlayer.subscribe((state, prev) => {
  if (state.queue !== prev.queue || state.index !== prev.index || state.mode !== prev.mode) {
    if (!state.queue.length) store.clearPlayer();
    else store.savePlayer({ queue: state.queue, index: state.index, mode: state.mode });
  }
});

// 关页面/切到后台时补一次进度，避免丢失最后几秒
window.addEventListener('pagehide', () => {
  const { current } = usePlayer.getState();
  if (!current) return;
  const pos = audio.currentTime;
  if (Number.isFinite(pos) && pos > 0) store.savePlayerPos({ songId: current.id, progress: pos });
});

// 当前曲目变化：同步系统媒体面板，并按新队列预热下一首（清空则丢掉预热缓存）
usePlayer.subscribe((state, prev) => {
  if (state.current !== prev.current) {
    syncMediaSession(state.current);
    if (state.current) ensurePreload();
    else dropPreload();
  }
});

// 刷新页面还原播放现场后也同步一次，锁屏/媒体键面板立刻能看到当前曲目
syncMediaSession(usePlayer.getState().current);

/**
 * 还原上次的播放现场：把音源挂回 audio 并定位到上次的进度。
 * 刻意不自动播放 —— 浏览器会拦截自动播放，而且用户打开页面未必想立刻出声。
 */
if (restored && restored.queue.length) {
  const song = restored.queue[restored.index];
  if (song?.src) {
    audio.src = song.src;
    const resumeAt = restoredPos && restoredPos.songId === song.id ? restoredPos.progress : 0;
    if (resumeAt > 0) {
      const applyResume = () => {
        // 进度超过时长（例如换了音源）就放弃，避免跳到末尾
        if (Number.isFinite(audio.duration) && audio.duration > 0 && resumeAt >= audio.duration - 1) return;
        try {
          audio.currentTime = resumeAt;
        } catch {
          return;
        }
        usePlayer.setState({ progress: resumeAt });
      };
      if (audio.readyState >= 1) applyResume();
      else audio.addEventListener('loadedmetadata', applyResume, { once: true });
    }
  }
}

export const playModeLabel: Record<PlayMode, string> = {
  loop: '列表循环',
  single: '单曲循环',
  random: '随机播放',
};
