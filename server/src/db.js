import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'local',
});

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(32) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    nickname VARCHAR(32) NOT NULL,
    role ENUM('superadmin','admin','user') NOT NULL DEFAULT 'user',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账号与角色'`,

  `CREATE TABLE IF NOT EXISTS artists (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL COMMENT '展示名',
    name_key VARCHAR(128) NOT NULL COMMENT '归一化名，用于去重',
    cover VARCHAR(255) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_name_key (name_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='歌手'`,

  `CREATE TABLE IF NOT EXISTS albums (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    name_key VARCHAR(200) NOT NULL,
    artist_id BIGINT UNSIGNED NULL,
    cover VARCHAR(255) NOT NULL DEFAULT '',
    year VARCHAR(8) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_album (artist_id, name_key),
    KEY idx_artist (artist_id),
    CONSTRAINT fk_album_artist FOREIGN KEY (artist_id) REFERENCES artists (id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='专辑'`,

  `CREATE TABLE IF NOT EXISTS songs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    title_key VARCHAR(200) NOT NULL COMMENT '归一化标题，用于去重',
    artist_id BIGINT UNSIGNED NULL,
    album_id BIGINT UNSIGNED NULL,
    artist_text VARCHAR(200) NOT NULL DEFAULT '' COMMENT '完整歌手串（含合唱）',
    duration INT NOT NULL DEFAULT 0 COMMENT '秒',
    src VARCHAR(255) NOT NULL DEFAULT '' COMMENT '音频地址，如 /music/xxx.mp3',
    cover VARCHAR(255) NOT NULL DEFAULT '',
    lrc VARCHAR(255) NOT NULL DEFAULT '',
    source VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'netease / kugou / local',
    source_id VARCHAR(64) NOT NULL DEFAULT '' COMMENT '来源侧 ID，与 source 组成唯一键',
    playable TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否有可播放音源',
    external_url VARCHAR(255) NOT NULL DEFAULT '' COMMENT '合规外链（无音源时跳官方平台）',
    file_size INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '音频字节数',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_source (source, source_id),
    KEY idx_title_key (title_key),
    KEY idx_artist (artist_id),
    KEY idx_album (album_id),
    KEY idx_playable (playable),
    CONSTRAINT fk_song_artist FOREIGN KEY (artist_id) REFERENCES artists (id) ON DELETE SET NULL,
    CONSTRAINT fk_song_album FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='曲库'`,

  `CREATE TABLE IF NOT EXISTS featured_playlists (
    id VARCHAR(64) NOT NULL COMMENT '前端可路由的歌单 ID',
    title VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    cover VARCHAR(255) NOT NULL DEFAULT '',
    tags JSON NULL,
    creator VARCHAR(80) NOT NULL DEFAULT 'Free音乐官方',
    play_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_featured_visible_sort (visible, sort_order, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='首页推荐歌单'`,

  `CREATE TABLE IF NOT EXISTS featured_playlist_songs (
    playlist_id VARCHAR(64) NOT NULL,
    song_id VARCHAR(64) NOT NULL COMMENT '歌曲来源侧 ID，与前端 Song.id 一致',
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, song_id),
    KEY idx_featured_song_order (playlist_id, position),
    CONSTRAINT fk_featured_playlist FOREIGN KEY (playlist_id) REFERENCES featured_playlists (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='首页推荐歌单歌曲'`,

  `CREATE TABLE IF NOT EXISTS import_tasks (
    id CHAR(36) NOT NULL,
    action VARCHAR(24) NOT NULL DEFAULT 'import' COMMENT 'import / upload',
    target VARCHAR(200) NOT NULL DEFAULT '',
    status ENUM('pending','running','success','failed','skipped') NOT NULL DEFAULT 'pending',
    step VARCHAR(64) NOT NULL DEFAULT '',
    progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
    message VARCHAR(500) NOT NULL DEFAULT '',
    song_id BIGINT UNSIGNED NULL,
    payload JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='入库任务'`,

  /* ── 「我的音乐」：登录用户的私有数据 ──
   * 注意 song_id 用的是**前端 Song.id**（网易云的 sourceId 字符串，如 "1357375695"），
   * 不是 songs 表的自增主键。原因是前端历史「喜欢」记录就是按这个 id 存的，
   * 而且静态兜底曲库里的歌可能还没入库（没有 songs.id）。
   * 因此这里刻意**不加** songs 外键，避免歌曲被管理台删除时连带清掉用户数据。
   */
  `CREATE TABLE IF NOT EXISTS user_songs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    song_id VARCHAR(64) NOT NULL COMMENT '前端 Song.id（来源侧 ID）',
    kind ENUM('like','recent') NOT NULL DEFAULT 'like',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_song_kind (user_id, song_id, kind),
    KEY idx_user_kind_created (user_id, kind, created_at),
    CONSTRAINT fk_usersong_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户喜欢/最近播放'`,

  `CREATE TABLE IF NOT EXISTS user_playlists (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(60) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    cover VARCHAR(255) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user (user_id),
    CONSTRAINT fk_upl_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户自建歌单'`,

  `CREATE TABLE IF NOT EXISTS user_playlist_songs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    playlist_id BIGINT UNSIGNED NOT NULL,
    song_id VARCHAR(64) NOT NULL COMMENT '前端 Song.id',
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_playlist_song (playlist_id, song_id),
    KEY idx_playlist_added (playlist_id, added_at),
    CONSTRAINT fk_ups_playlist FOREIGN KEY (playlist_id) REFERENCES user_playlists (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='歌单内的歌曲'`,

  `CREATE TABLE IF NOT EXISTS user_collected_playlists (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    playlist_id VARCHAR(64) NOT NULL COMMENT '官方歌单 id（前端静态数据里的字符串）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_playlist (user_id, playlist_id),
    KEY idx_user_created (user_id, created_at),
    CONSTRAINT fk_ucp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户收藏的官方歌单'`,

  /*
   * 播放埋点：每「真正听完一段」记一行，用于听歌统计。
   *
   * 为什么不复用 user_songs(kind='recent')？因为那是「最近播放列表」，
   * 走的是先删后插 + 只保留 100 条，**播放次数和播放时间全部丢失**，
   * 统计不出「最常听的歌手」这类聚合结果。
   *
   * 这里刻意把 title/artist/duration **反范式**存下来，而不是靠 song_id 关联 songs 表：
   *   1. song_id 是前端 Song.id（来源侧 ID），静态兜底曲库里的歌根本没入库；
   *   2. 管理台删歌时不能连带把历史统计删掉——统计是"发生过的事实"。
   * 代价是歌名改了历史记录不会跟着变，对统计而言可以接受。
   */
  `CREATE TABLE IF NOT EXISTS play_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    song_id VARCHAR(64) NOT NULL COMMENT '前端 Song.id（来源侧 ID）',
    title VARCHAR(255) NOT NULL DEFAULT '',
    artist VARCHAR(255) NOT NULL DEFAULT '',
    duration INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '秒，用于累计时长',
    played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pe_user_time (user_id, played_at),
    KEY idx_pe_user_artist (user_id, artist),
    KEY idx_pe_user_song (user_id, song_id),
    CONSTRAINT fk_playevent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='播放埋点（听歌统计用）'`,
];

/** 建库 + 建表（幂等，可重复执行） */
/** 增量迁移：老库补字段用，重复执行不会报错 */
const COLUMN_MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL COMMENT '最后登录时间'`,
  // 三级角色：超级管理员 > 管理员 > 普通用户
  // 老库的 role 是 ENUM('admin','user')，扩枚举不能靠 CREATE TABLE IF NOT EXISTS
  `ALTER TABLE users MODIFY COLUMN role ENUM('superadmin','admin','user') NOT NULL DEFAULT 'user'`,
];

export async function initSchema() {
  const root = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: false,
  });
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.end();

  for (const sql of TABLES) await pool.query(sql);
  for (const sql of COLUMN_MIGRATIONS) {
    try {
      await pool.query(sql);
    } catch (error) {
      // 字段已存在 / 枚举值已是最新时忽略
      if (error.code !== 'ER_DUP_FIELDNAME' && error.code !== 'ER_INVALID_USE_OF_NULL') throw error;
    }
  }
  return TABLES.length;
}

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function ping() {
  const row = await queryOne('SELECT VERSION() AS version');
  return row?.version ?? 'unknown';
}
