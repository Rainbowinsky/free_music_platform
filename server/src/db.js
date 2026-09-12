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
    role ENUM('admin','user') NOT NULL DEFAULT 'user',
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
];

/** 建库 + 建表（幂等，可重复执行） */
/** 增量迁移：老库补字段用，重复执行不会报错 */
const COLUMN_MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL COMMENT '最后登录时间'`,
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
      if (error.code !== 'ER_DUP_FIELDNAME') throw error; // 字段已存在则忽略
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
