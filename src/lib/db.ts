import type { PlayMode, Song, User, UserPlaylist } from '../types';

/**
 * 数据层
 *
 * 账号体系（2026-09 改造）：
 *   主站与曲库管理台共用后端同一张 `users` 表（MySQL + bcrypt + JWT），
 *   也就是「root 能登主站也能登管理台（角色允许时）」。
 *   本文件里的 authApi 只是后端 /api/auth/* 的薄封装，不再自建 localStorage 账号库。
 *
 * 「我的音乐」（2026-09 再改造）：
 *   喜欢 / 收藏 / 自建歌单 / 最近播放已全部搬到后端 users 关联表，
 *   通过 meApi 访问 /api/me/*（见下方 meApi 与 store/library.ts）。
 *   换浏览器、清缓存都不会再丢数据。
 *
 * 仍然留在浏览器本地的数据（这些属于设备偏好，不需要跨设备同步）：
 *   - 搜索历史、音量
 *   - 游客（未登录）的最近播放
 *   - 播放器现场（队列 / 当前曲目 / 播放模式 / 播放进度），见下方 PLAYER_KEY
 *   - 旧版 qqmusic.db.v1 遗留数据：只在首次登录时被读取一次，用于迁移到后端，
 *     迁移完成后不再写入（见 store/migrate.ts）
 */

/** 旧的本地账号库键名，仅用于数据迁移与提示 */
const LEGACY_DB_KEY = 'qqmusic.db.v1';
const SESSION_KEY = 'qqmusic.session.v1';
/**
 * 播放器现场分两个键存：
 *   - PLAYER_KEY 存队列结构（大对象），只在队列/索引/模式变化时写；
 *   - PLAYER_POS_KEY 只存一个进度数字（小对象），每几秒写一次。
 * 拆开是为了避免每次 timeupdate 都把整个队列 JSON.stringify 一遍。
 */
const PLAYER_KEY = 'qqmusic.player.v1';
const PLAYER_POS_KEY = 'qqmusic.player.pos.v1';

/** 队列最多持久化这么多首，避免极端情况下撑爆 localStorage */
const MAX_PERSISTED_QUEUE = 500;

export interface PersistedPlayer {
  queue: Song[];
  index: number;
  mode: PlayMode;
}

export interface PersistedPosition {
  songId: string;
  progress: number;
}

export interface StoredUser {
  username: string;
  password?: string;
  nickname: string;
  createdAt: number;
  liked: string[];
  collected: string[];
  recent: string[];
  /** 用户创建的歌单 */
  playlists: UserPlaylist[];
}

export interface Db {
  users: Record<string, StoredUser>;
}

export type LibraryPatch = Partial<Pick<StoredUser, 'liked' | 'collected' | 'recent' | 'playlists'>>;

function emptyDb(): Db {
  return { users: {} };
}

function readDb(): Db {
  try {
    const raw = window.localStorage.getItem(LEGACY_DB_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as Db;
    if (!parsed || typeof parsed !== 'object' || !parsed.users) return emptyDb();
    return parsed;
  } catch {
    return emptyDb();
  }
}

function writeDb(db: Db): void {
  try {
    window.localStorage.setItem(LEGACY_DB_KEY, JSON.stringify(db));
  } catch {
    /* 忽略隐私模式等导致的写入失败 */
  }
}

function toPublicUser(u: StoredUser): User {
  return { username: u.username, nickname: u.nickname, createdAt: u.createdAt, role: 'user' };
}

/** 会话：后端返回的 JWT + 用户信息 */
interface Session {
  token: string;
  user: User;
}

export interface AuthResult {
  user: User;
  token: string;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 统一的 /api/auth/* 调用：代理未生效或后端未启动时给出可读提示 */
async function callAuth<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('无法连接服务器，请确认后端已启动（npm run server）', 0);
  }
  const text = await res.text();
  let data: { error?: string } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    // 5xx 且没有结构化错误，多半是反向代理把后端挂了的表现
    const message =
      data?.error ||
      (res.status >= 500 ? '服务器暂时不可用，请确认后端已启动（npm run server）' : `操作失败（${res.status}）`);
    throw new AuthError(message, res.status);
  }
  return data as T;
}

/** 账号服务：直接对接后端 /api/auth/* */
export const authApi = {
  async register(username: string, password: string, nickname: string): Promise<AuthResult> {
    // 主站注册走 register-user：与管理台共用账号表，但一律 user 角色
    return callAuth<AuthResult>('/api/auth/register-user', { username: username.trim(), password, nickname });
  },

  async login(username: string, password: string): Promise<AuthResult> {
    return callAuth<AuthResult>('/api/auth/login', { username: username.trim(), password });
  },

  /** 用本地 JWT 换回最新的用户信息（刷新页面后校验登录态是否仍有效） */
  async me(token: string): Promise<User> {
    let res: Response;
    try {
      res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new AuthError('无法连接服务器', 0);
    }
    if (!res.ok) {
      const text = await res.text();
      let message = '登录状态已过期，请重新登录';
      try {
        message = (JSON.parse(text) as { error?: string })?.error || message;
      } catch {
        /* 保持默认文案 */
      }
      throw new AuthError(message, res.status);
    }
    const data = (await res.json()) as { user: User };
    return data.user;
  },
};

/* ─────────────── 我的音乐：/api/me/* 的薄封装 ─────────────── */

export class MeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 从后端返回的对象还原成前端 UserPlaylist（字段名与类型对齐） */
function toPlaylist(raw: {
  id: string;
  title: string;
  desc?: string;
  cover?: string;
  songIds?: string[];
  createdAt?: number;
  updatedAt?: number;
}): UserPlaylist {
  const now = Date.now();
  return {
    id: String(raw.id),
    title: raw.title,
    desc: raw.desc ?? '',
    cover: raw.cover ?? '',
    songIds: raw.songIds ?? [],
    createdAt: Number(raw.createdAt ?? now),
    updatedAt: Number(raw.updatedAt ?? now),
  };
}

/**
 * 统一的 /api/me/* 调用。
 * token 通过 Bearer 头带上，401 表示登录态失效，0 表示网络不通。
 */
async function callMe<T>(path: string, token: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new MeError('无法连接服务器', 0);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ||
      (res.status >= 500 ? '服务器暂时不可用' : `操作失败（${res.status}）`);
    throw new MeError(message, res.status);
  }
  return data as T;
}

export interface LibrarySnapshot {
  liked: string[];
  collected: string[];
  /** 收藏的专辑 id（albums.id 的字符串形式） */
  collectedAlbums: string[];
  recent: string[];
  playlists: UserPlaylist[];
}

/** 「我的音乐」服务：全部需要登录，数据存在后端 users 关联表里 */
export const meApi = {
  async library(token: string): Promise<LibrarySnapshot> {
    const data = await callMe<{
      liked?: string[];
      collected?: string[];
      collectedAlbums?: string[];
      recent?: string[];
      playlists?: Parameters<typeof toPlaylist>[0][];
    }>('/api/me/library', token);
    return {
      liked: data.liked ?? [],
      collected: data.collected ?? [],
      collectedAlbums: data.collectedAlbums ?? [],
      recent: data.recent ?? [],
      playlists: (data.playlists ?? []).map(toPlaylist),
    };
  },

  async toggleLike(token: string, songId: string): Promise<{ liked: boolean }> {
    return callMe<{ liked: boolean }>(`/api/me/likes/${encodeURIComponent(songId)}`, token, { method: 'POST' });
  },

  async toggleCollect(token: string, playlistId: string): Promise<{ collected: boolean }> {
    return callMe<{ collected: boolean }>(`/api/me/collected/${encodeURIComponent(playlistId)}`, token, {
      method: 'POST',
    });
  },

  /** 切换专辑收藏（与收藏歌单同一套交互） */
  async toggleCollectAlbum(token: string, albumId: string): Promise<{ collected: boolean }> {
    return callMe<{ collected: boolean }>(`/api/me/albums/${encodeURIComponent(albumId)}`, token, {
      method: 'POST',
    });
  },

  async addRecent(token: string, songId: string): Promise<void> {
    await callMe('/api/me/recent', token, { method: 'POST', body: { songId } });
  },

  async clearRecent(token: string): Promise<void> {
    await callMe('/api/me/recent', token, { method: 'DELETE' });
  },

  async createPlaylist(token: string, title: string, desc = ''): Promise<UserPlaylist> {
    const data = await callMe<{ playlist: Parameters<typeof toPlaylist>[0] }>('/api/me/playlists', token, {
      method: 'POST',
      body: { title, desc },
    });
    return toPlaylist(data.playlist);
  },

  async updatePlaylist(
    token: string,
    playlistId: string,
    patch: { title?: string; desc?: string; cover?: string },
  ): Promise<UserPlaylist> {
    const data = await callMe<{ playlist: Parameters<typeof toPlaylist>[0] }>(
      `/api/me/playlists/${encodeURIComponent(playlistId)}`,
      token,
      { method: 'PATCH', body: patch },
    );
    return toPlaylist(data.playlist);
  },

  async deletePlaylist(token: string, playlistId: string): Promise<void> {
    await callMe(`/api/me/playlists/${encodeURIComponent(playlistId)}`, token, { method: 'DELETE' });
  },

  async addSongToPlaylist(token: string, playlistId: string, songId: string): Promise<{ added: boolean }> {
    return callMe<{ added: boolean }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/songs`, token, {
      method: 'POST',
      body: { songId },
    });
  },

  async removeSongFromPlaylist(token: string, playlistId: string, songId: string): Promise<void> {
    await callMe(
      `/api/me/playlists/${encodeURIComponent(playlistId)}/songs/${encodeURIComponent(songId)}`,
      token,
      { method: 'DELETE' },
    );
  },

  /** 批量从歌单移除（多选删除）；返回实际删掉的条数 */
  async removeSongsFromPlaylist(token: string, playlistId: string, songIds: string[]): Promise<{ removed: number }> {
    return callMe<{ removed: number }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/songs/remove`, token, {
      method: 'POST',
      body: { songIds },
    });
  },

  /**
   * 修改自己的密码。
   * 只走「已登录 + 知道旧密码」这一条路径；邮件找回需要 SMTP，与项目定位不符。
   */
  async changePassword(token: string, oldPassword: string, newPassword: string): Promise<void> {
    await callMe('/api/me/password', token, { method: 'POST', body: { oldPassword, newPassword } });
  },

  /** 上报一次播放（前端累计听够阈值后才调用，避免快速切歌把统计刷高） */
  async recordPlay(
    token: string,
    payload: { songId: string; title: string; artist: string; duration: number },
  ): Promise<void> {
    await callMe('/api/me/plays', token, { method: 'POST', body: payload });
  },

  /** 听歌统计聚合 */
  async stats(token: string, days = 14): Promise<PlayStats> {
    return callMe<PlayStats>(`/api/me/stats?days=${days}`, token);
  },
};
/** 听歌统计的返回结构（与后端 /api/me/stats 对齐） */
export interface PlayStats {
  overview: {
    totalPlays: number;
    totalSeconds: number;
    distinctSongs: number;
    distinctArtists: number;
    firstPlayedAt: number | null;
  };
  topArtists: { artist: string; plays: number; seconds: number }[];
  topSongs: { songId: string; title: string; artist: string; plays: number }[];
  byHour: { hour: number; plays: number }[];
  byDay: { date: string; plays: number }[];
  days: number;
}

export const store = {
  getSession(): Session | null {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Session;
      if (!parsed?.token || !parsed?.user) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  /**
   * 旧版会话（localStorage 自建账号时代）只有 { username, nickname, createdAt }，
   * 没有 token。这里识别出来并清掉，避免用户以为自己还登录着。
   * 返回旧用户名，便于调用方给出「请用原账号重新注册/登录」的提示。
   */
  takeLegacySession(): string | null {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { token?: string; username?: string };
      if (parsed?.token) return null; // 已经是新版会话
      const username = parsed?.username || '';
      window.localStorage.removeItem(SESSION_KEY);
      return username || null;
    } catch {
      return null;
    }
  },
  setSession(session: Session | null): void {
    try {
      if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* 忽略 */
    }
  },
  getToken(): string {
    return store.getSession()?.token || '';
  },

  /* ── 旧版本地账号库：只用于迁移与兼容提示 ── */

  /** 旧库里是否存在某个账号（用于提示「请重设密码」而非「账号不存在」） */
  hasLegacyUser(username: string): boolean {
    return Boolean(readDb().users[username.trim()]);
  },
  /** 旧库里是否还有任何账号数据（用于在登录界面给出一次性提示） */
  hasLegacyAccounts(): boolean {
    return Object.keys(readDb().users).length > 0;
  },
  /** 读取旧库中某账号的「我的音乐」数据，注册同名新账号时继承过来 */
  getLegacyLibrary(username: string): LibraryPatch {
    const record = readDb().users[username.trim()];
    if (!record) return {};
    return {
      liked: record.liked ?? [],
      collected: record.collected ?? [],
      recent: record.recent ?? [],
      playlists: record.playlists ?? [],
    };
  },
  /**
   * 从旧库里删除账号记录（含明文密码）。
   * 迁移到后端后旧密码不再有意义，留着只是安全隐患。
   */
  dropLegacyUser(username: string): void {
    const db = readDb();
    const record = db.users[username.trim()];
    if (!record) return;
    delete db.users[username.trim()];
    writeDb(db);
  },
  /** 把所有旧账号都清掉（含明文密码），只保留「我的音乐」数据时请勿调用 */
  dropAllLegacyUsers(): void {
    const db = readDb();
    for (const name of Object.keys(db.users)) {
      delete db.users[name].password;
    }
    writeDb(db);
  },

  /* 说明：「我的音乐」（喜欢/收藏/歌单/最近播放）已迁到后端 /api/me/*，
   * 这里只保留旧库的读取能力（getLegacyLibrary）供一次性迁移使用。
   * 注意不要删掉旧库的写入能力之前留下的数据 —— 用户可能还没登录过。 */

  /** 未登录时的最近播放（按设备保存） */
  getGuestRecent(): string[] {
    try {
      const raw = window.localStorage.getItem('qqmusic.recent.guest');
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  saveGuestRecent(ids: string[]): void {
    try {
      window.localStorage.setItem('qqmusic.recent.guest', JSON.stringify(ids));
    } catch {
      /* 忽略 */
    }
  },
  getSearchHistory(): string[] {
    try {
      const raw = window.localStorage.getItem('qqmusic.search.history');
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    } catch {
      return [];
    }
  },
  pushSearchHistory(keyword: string): string[] {
    const list = [keyword, ...store.getSearchHistory().filter((k) => k !== keyword)].slice(0, 10);
    try {
      window.localStorage.setItem('qqmusic.search.history', JSON.stringify(list));
    } catch {
      /* 忽略 */
    }
    return list;
  },
  clearSearchHistory(): void {
    try {
      window.localStorage.removeItem('qqmusic.search.history');
    } catch {
      /* 忽略 */
    }
  },
  getVolume(): number {
    const raw = window.localStorage.getItem('qqmusic.volume');
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.7;
  },
  setVolume(v: number): void {
    try {
      window.localStorage.setItem('qqmusic.volume', String(v));
    } catch {
      /* 忽略 */
    }
  },

  /** 歌词页是否显示中文译文（默认开） */
  getShowTranslation(): boolean {
    try {
      return window.localStorage.getItem('qqmusic.lyrics.translation') !== '0';
    } catch {
      return true;
    }
  },
  setShowTranslation(v: boolean): void {
    try {
      window.localStorage.setItem('qqmusic.lyrics.translation', v ? '1' : '0');
    } catch {
      /* 忽略 */
    }
  },

  /* ── 播放器现场：刷新页面后恢复队列与进度 ── */

  /**
   * 读取上次的播放队列。
   * 存的是完整 Song 对象（而不是只存 id 再去曲库里查），因为恢复时机早于曲库加载，
   * 且用户可能播放过已从曲库下架的歌曲。
   */
  getPlayer(): PersistedPlayer | null {
    try {
      const raw = window.localStorage.getItem(PLAYER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedPlayer>;
      if (!Array.isArray(parsed?.queue)) return null;
      // 逐条校验，避免旧版本残留结构或手工改坏的数据把播放器带崩
      const queue = parsed.queue.filter(
        (item): item is Song =>
          !!item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.src === 'string',
      );
      if (!queue.length) return null;
      const mode: PlayMode = parsed.mode === 'single' || parsed.mode === 'random' ? parsed.mode : 'loop';
      const index = Number(parsed.index);
      return {
        queue: queue.slice(0, MAX_PERSISTED_QUEUE),
        index: Number.isInteger(index) && index >= 0 && index < queue.length ? index : 0,
        mode,
      };
    } catch {
      return null;
    }
  },
  savePlayer(state: PersistedPlayer): void {
    try {
      window.localStorage.setItem(
        PLAYER_KEY,
        JSON.stringify({ ...state, queue: state.queue.slice(0, MAX_PERSISTED_QUEUE) }),
      );
    } catch {
      /* 队列过大或隐私模式：放弃持久化，不影响播放 */
    }
  },
  clearPlayer(): void {
    try {
      window.localStorage.removeItem(PLAYER_KEY);
      window.localStorage.removeItem(PLAYER_POS_KEY);
    } catch {
      /* 忽略 */
    }
  },
  /** 读取上次的播放进度（带 songId，只有对得上当前曲目才采用） */
  getPlayerPos(): PersistedPosition | null {
    try {
      const raw = window.localStorage.getItem(PLAYER_POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedPosition>;
      const progress = Number(parsed?.progress);
      if (!parsed?.songId || !Number.isFinite(progress) || progress <= 0) return null;
      return { songId: parsed.songId, progress };
    } catch {
      return null;
    }
  },
  savePlayerPos(pos: PersistedPosition): void {
    try {
      window.localStorage.setItem(PLAYER_POS_KEY, JSON.stringify(pos));
    } catch {
      /* 忽略 */
    }
  },
  clearPlayerPos(): void {
    try {
      window.localStorage.removeItem(PLAYER_POS_KEY);
    } catch {
      /* 忽略 */
    }
  },
};

export { toPublicUser };
