import type { User, UserPlaylist } from '../types';

export interface StoredUser {
  username: string;
  password: string;
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

const DB_KEY = 'qqmusic.db.v1';
const SESSION_KEY = 'qqmusic.session.v1';

export type LibraryPatch = Partial<Pick<StoredUser, 'liked' | 'collected' | 'recent' | 'playlists'>>;

function emptyDb(): Db {
  return { users: {} };
}

function readDb(): Db {
  try {
    const raw = window.localStorage.getItem(DB_KEY);
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
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* 忽略隐私模式等导致的写入失败 */
  }
}

function toPublicUser(u: StoredUser): User {
  return { username: u.username, nickname: u.nickname, createdAt: u.createdAt };
}

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,16}$/;

/** 模拟后端的账号服务（数据落在 localStorage） */
export const authApi = {
  async register(username: string, password: string, nickname: string): Promise<User> {
    await delay(520);
    const name = username.trim();
    if (!USERNAME_RE.test(name)) throw new Error('账号需为 2-16 位中文、字母、数字或下划线');
    if (password.length < 6) throw new Error('密码长度不能少于 6 位');
    const db = readDb();
    if (db.users[name]) throw new Error('该账号已被注册，请直接登录');
    const record: StoredUser = {
      username: name,
      password,
      nickname: nickname.trim() || name,
      createdAt: Date.now(),
      liked: [],
      collected: [],
      recent: [],
      playlists: [],
    };
    db.users[name] = record;
    writeDb(db);
    return toPublicUser(record);
  },

  async login(username: string, password: string): Promise<User> {
    await delay(420);
    const db = readDb();
    const record = db.users[username.trim()];
    if (!record) throw new Error('账号不存在，请先注册');
    if (record.password !== password) throw new Error('密码错误，请重新输入');
    return toPublicUser(record);
  },
};

export const store = {
  getSession(): User | null {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  setSession(user: User | null): void {
    try {
      if (user) window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* 忽略 */
    }
  },
  getLibrary(username: string): LibraryPatch {
    const record = readDb().users[username];
    if (!record) return { liked: [], collected: [], recent: [], playlists: [] };
    return {
      liked: record.liked ?? [],
      collected: record.collected ?? [],
      recent: record.recent ?? [],
      playlists: record.playlists ?? [],
    };
  },
  saveLibrary(username: string, patch: LibraryPatch): void {
    const db = readDb();
    const record = db.users[username];
    if (!record) return;
    db.users[username] = { ...record, ...patch };
    writeDb(db);
  },
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
  getSearchHistory(): string[] {    try {
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
};
