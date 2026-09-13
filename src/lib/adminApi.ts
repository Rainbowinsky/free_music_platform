/**
 * 曲库管理端 API 客户端
 * 通过 Vite 代理走同源 /api，避免额外配置 CORS
 */
const TOKEN_KEY = 'qqmusic.admin.token';
const USER_KEY = 'qqmusic.admin.user';

export type Role = 'superadmin' | 'admin' | 'user';

export interface AdminUser {
  id: number;
  username: string;
  nickname: string;
  role: Role;
  createdAt?: string;
  lastLoginAt?: string | null;
}

/** 角色展示标签与语气 */
export const ROLE_META: Record<Role, { text: string; tone: string }> = {
  superadmin: { text: '超级管理员', tone: 'is-danger' },
  admin: { text: '管理员', tone: 'is-ok' },
  user: { text: '普通用户', tone: 'is-muted' },
};

export interface Candidate {
  server: string;
  id: string;
  name: string;
  artist: string;
  album?: string;
  durationSec?: number;
  sizeMB?: number | null;
  full?: boolean;
  reachable?: boolean;
  confidence: number;
  score: number;
  flags: string[];
  isOriginal: boolean;
  coverUrl?: string;
  picUrl?: string;
  agentVerdict?: string;
  agentReason?: string;
  lrcUrl?: string;
  /** 音源是否真的能取到全曲；false 表示条目存在但取不到音频（仅线索） */
  audioAvailable?: boolean | null;
  /** 是否可作为入库来源 */
  importable?: boolean;
  duplicate?: { id: number; title: string; artist: string; album: string; playable: boolean } | null;
}

export interface SearchResult {
  query: string;
  searchId?: string;
  target: { title: string; artist: string };
  parsedBy: string;
  agentApplied: boolean;
  agentEnabled: boolean;
  /** 模型未参与时的说明（例如超时已退回规则判定） */
  agentNote?: string;
  /** 是否已经过模型裁决 */
  judged?: boolean;
  /** 是否还有第二阶段（模型裁决）在等 */
  judgePending?: boolean;
  total: number;
  candidates: Candidate[];
  duplicate: { id: number; title: string; artist: string; album: string; playable: boolean } | null;
}

export interface AdminSong {
  id: number;
  title: string;
  artist: string;
  artistText: string;
  album: string;
  duration: number;
  src: string;
  cover: string;
  lrc: string;
  source: string;
  sourceId: string;
  playable: boolean;
  externalUrl: string;
  fileSize: number;
  createdAt: string;
}

export interface AdminArtist {
  id: number;
  name: string;
  cover: string;
  songCount: number;
  albumCount: number;
  createdAt?: string;
}

export interface AdminAlbum {
  id: number;
  name: string;
  artistId: number | null;
  artistName: string;
  cover: string;
  year: string;
  songCount: number;
  createdAt?: string;
}

export interface AdminFeaturedPlaylist {
  id: string;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  creator: string;
  playCount: number;
  sortOrder: number;
  visible: boolean;
  songIds: string[];
  createdAt?: string;
}

export interface ImportTask {
  id: string;
  action: string;
  target: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  step: string;
  progress: number;
  message: string;
  songId: number | null;
}

export interface LibraryStats {
  songs: number;
  playable: number;
  metaOnly: number;
  artists: number;
  albums: number;
  totalBytes: number;
}

export interface AgentStatus {
  enabled: boolean;
  ok?: boolean;
  model: string;
  models?: string[];
  modelAvailable?: boolean;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const adminAuth = {
  getToken(): string {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  },
  getUser(): AdminUser | null {
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  },
  setUser(user: AdminUser): void {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  setToken(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  },
};

export const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const token = adminAuth.getToken();
  const res = await fetch(path, {
    method: options.method || (options.body || options.form ? 'POST' : 'GET'),
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.form ? options.form : options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error || `请求失败（${res.status}）`;
    if (res.status === 401) adminAuth.clear();
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ user: AdminUser; token: string }>('/api/auth/login', { body: { username, password } }),

  register: (username: string, password: string, nickname: string) =>
    request<{ user: AdminUser; token: string }>('/api/auth/register', { body: { username, password, nickname } }),

  me: () => request<{ user: AdminUser }>('/api/auth/me'),

  agentStatus: () => request<AgentStatus>('/api/admin/agent/status'),

  search: (query: string, searchId: string, signal?: AbortSignal) =>
    request<SearchResult>('/api/admin/search', { body: { query, searchId }, signal }),

  /** 显式取消搜索：不依赖连接断开，反向代理下也能生效 */
  cancelSearch: (searchId: string) =>
    request<{ cancelled: boolean; message?: string }>('/api/admin/search/cancel', { body: { searchId } }),

  /** 第二阶段：模型裁决（候选先返回，这里再补齐判定） */
  judge: (searchId: string, signal?: AbortSignal) =>
    request<{ searchId: string; judged: boolean; candidates: Candidate[]; agentApplied: boolean; agentNote: string }>(
      '/api/admin/judge',
      { body: { searchId }, signal },
    ),

  importCandidate: (payload: { server: string; id: string; target: { title: string; artist: string } }) =>
    request<{ taskId: string }>('/api/admin/import', { body: payload }),

  task: (id: string) => request<{ task: ImportTask }>(`/api/admin/tasks/${id}`),

  tasks: () => request<{ items: ImportTask[] }>('/api/admin/tasks'),

  upload: (payload: {
    audio: File;
    lyrics?: File | null;
    cover?: File | null;
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
  }) => {
    const form = new FormData();
    form.append('audio', payload.audio);
    if (payload.lyrics) form.append('lyrics', payload.lyrics);
    if (payload.cover) form.append('cover', payload.cover);
    for (const key of ['title', 'artist', 'album', 'year'] as const) {
      const value = payload[key]?.trim();
      if (value) form.append(key, value);
    }
    return request<{
      status: string;
      message: string;
      upgraded?: boolean;
      song?: AdminSong;
      matched?: { id: string; album: string; source: string } | null;
      tags?: Record<string, unknown>;
    }>('/api/admin/upload', { form });
  },

  artists: (keyword = '') => request<{ items: AdminArtist[] }>(`/api/admin/artists${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),

  updateArtist: (id: number, payload: { name: string }) =>
    request<{ artist: AdminArtist }>(`/api/admin/artists/${id}`, { method: 'PATCH', body: payload }),

  uploadArtistCover: (id: number, file: File) => {
    const form = new FormData();
    form.append('cover', file);
    return request<{ cover: string }>(`/api/admin/artists/${id}/cover`, { form });
  },

  albums: (keyword = '') => request<{ items: AdminAlbum[] }>(`/api/admin/albums${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),

  updateAlbum: (id: number, payload: { name: string; year?: string }) =>
    request<{ album: AdminAlbum }>(`/api/admin/albums/${id}`, { method: 'PATCH', body: payload }),

  uploadAlbumCover: (id: number, file: File) => {
    const form = new FormData();
    form.append('cover', file);
    return request<{ cover: string }>(`/api/admin/albums/${id}/cover`, { form });
  },

  featuredPlaylists: () => request<{ items: AdminFeaturedPlaylist[] }>('/api/admin/featured-playlists'),

  createFeaturedPlaylist: (payload: Partial<Pick<AdminFeaturedPlaylist, 'title' | 'description' | 'creator' | 'tags' | 'playCount' | 'sortOrder' | 'visible'>>) =>
    request<{ playlist: AdminFeaturedPlaylist }>('/api/admin/featured-playlists', { body: payload }),

  updateFeaturedPlaylist: (id: string, payload: Partial<Pick<AdminFeaturedPlaylist, 'title' | 'description' | 'creator' | 'tags' | 'playCount' | 'sortOrder' | 'visible'>>) =>
    request<{ playlist: AdminFeaturedPlaylist }>(`/api/admin/featured-playlists/${id}`, { method: 'PATCH', body: payload }),

  deleteFeaturedPlaylist: (id: string) => request<{ ok: boolean }>(`/api/admin/featured-playlists/${id}`, { method: 'DELETE' }),

  uploadFeaturedCover: (id: string, file: File) => {
    const form = new FormData();
    form.append('cover', file);
    return request<{ cover: string }>(`/api/admin/featured-playlists/${id}/cover`, { form });
  },

  replaceFeaturedPlaylistSongs: (id: string, songIds: string[]) =>
    request<{ playlist: AdminFeaturedPlaylist }>(`/api/admin/featured-playlists/${id}/songs`, { method: 'PUT', body: { songIds } }),

  songs: (params: { keyword?: string; playable?: string; page?: number; size?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set('keyword', params.keyword);
    if (params.playable) qs.set('playable', params.playable);
    qs.set('page', String(params.page || 1));
    qs.set('size', String(params.size || 20));
    return request<{ total: number; page: number; size: number; items: AdminSong[] }>(`/api/admin/songs?${qs}`);
  },

  updateSong: (id: number, patch: Partial<Pick<AdminSong, 'title' | 'artist' | 'album' | 'externalUrl' | 'playable'>>) =>
    request<{ song: AdminSong }>(`/api/admin/songs/${id}`, { method: 'PATCH', body: patch }),

  deleteSong: (id: number) => request<{ ok: boolean; deletedFiles: string[] }>(`/api/admin/songs/${id}`, { method: 'DELETE' }),

  metadataOnly: (payload: { title: string; artist?: string; album?: string; externalUrl?: string }) =>
    request<{ status?: string; message?: string; song: AdminSong }>('/api/admin/metadata-only', { body: payload }),

  stats: () => request<LibraryStats>('/api/library/stats'),

  /* 账号管理 */
  users: () =>
    request<{ items: AdminUser[]; currentId: number; currentRole: Role; canGrantAdmin: boolean }>('/api/admin/users'),

  createUser: (payload: { username: string; password: string; nickname?: string; role?: Role }) =>
    request<{ user: AdminUser }>('/api/admin/users', { body: payload }),

  updateUser: (id: number, patch: { nickname?: string; role?: Role }) =>
    request<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: 'PATCH', body: patch }),

  resetPassword: (id: number, password: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}/password`, { body: { password } }),

  deleteUser: (id: number) => request<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
};

export const formatSize = (bytes: number): string => {
  if (!bytes) return '0 MB';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDuration = (seconds: number): string => {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const SOURCE_LABEL: Record<string, string> = {
  netease: '网易云',
  kugou: '酷狗',
  tencent: 'QQ音乐',
  local: '本地上传',
  manual: '手工录入',
};

/** 候选封面经后端代理转发，避免源站图片直连被拦 */
export const coverProxy = (url?: string): string =>
  url ? `/api/admin/cover?url=${encodeURIComponent(url)}` : '';

export const VERDICT_LABEL: Record<string, { text: string; tone: string }> = {
  original: { text: '原版', tone: 'ok' },
  variant: { text: '变体版本', tone: 'warn' },
  cover: { text: '翻唱/非原版', tone: 'bad' },
  unknown: { text: '无法确认', tone: 'muted' },
};
