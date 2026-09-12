export interface Song {
  id: string;
  name: string;
  artist: string;
  album: string;
  cover: string;
  src: string;
  lrc?: string;
  /** 时长（秒） */
  duration: number;
  /** 是否有可播放音源；false 表示只有元数据（例如独家版权曲目），应在界面上标注并引导外部收听 */
  playable?: boolean;
  /** 无音源时的合规跳转链接 */
  externalUrl?: string;
}

export interface Playlist {
  id: string;
  title: string;
  cover: string;
  desc: string;
  tags: string[];
  playCount: number;
  creator: string;
  songIds: string[];
}

/** 用户自己创建的歌单 */
export interface UserPlaylist {
  id: string;
  title: string;
  desc: string;
  /** 自定义封面，为空时使用第一首歌的封面 */
  cover: string;
  songIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface User {
  /** users 表主键，管理台用它判定"是否是自己" */
  id?: number;
  username: string;
  nickname: string;
  createdAt: number | string;
  /**
   * 与后端 users 表一致的三级角色：
   *   superadmin 超级管理员（可授予/撤销管理员）
   *   admin      管理员
   *   user       普通用户（主站注册一律是这个）
   */
  role?: 'superadmin' | 'admin' | 'user';
  /** 最后一次登录时间 */
  lastLoginAt?: string | null;
}

/** 播放模式：列表循环 / 单曲循环 / 随机播放 */
export type PlayMode = 'loop' | 'single' | 'random';
