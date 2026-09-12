import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { config } from './config.js';
import { query, queryOne } from './db.js';

const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,16}$/;

/**
 * 三级角色
 *   superadmin 超级管理员：可给任何人（含管理员）授予/撤销管理员权限
 *   admin      管理员：可进管理台，管理曲库与普通用户
 *   user       普通用户：主站注册的默认角色
 *
 * 护栏（在 routes/admin.js 中强制）：
 *   - 只有 superadmin 能授予/撤销 admin 权限
 *   - superadmin 不能被降级或删除（自身与同级都不行）
 *   - 系统始终保留至少一个 superadmin
 *   - 不能取消自己的权限 / 删除当前登录账号
 */
export const ROLE = { SUPERADMIN: 'superadmin', ADMIN: 'admin', USER: 'user' };

/** admin 与 superadmin 都能进管理台 */
export const isAdminRole = (role) => role === ROLE.ADMIN || role === ROLE.SUPERADMIN;

/** 角色等级，用于比较权限高低 */
const RANK = { user: 0, admin: 1, superadmin: 2 };
export const roleRank = (role) => RANK[role] ?? -1;

/**
 * 统一收敛前端传来的角色值，避免非法值写库。
 * 默认落到 user（最小权限）。
 */
export const normalizeRole = (role) => (Object.values(ROLE).includes(role) ? role : ROLE.USER);

const publicUser = (row) => ({
  id: row.id,
  username: row.username,
  nickname: row.nickname,
  role: row.role,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at ?? null,
});

export function signToken(row) {
  return jwt.sign({ sub: row.id, username: row.username, role: row.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export async function registerUser({ username, password, nickname }) {
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) throw Object.assign(new Error('账号需为 2-16 位中文、字母、数字或下划线'), { status: 400 });
  if (String(password || '').length < 6) throw Object.assign(new Error('密码长度不能少于 6 位'), { status: 400 });

  const exists = await queryOne('SELECT id FROM users WHERE username = ?', [name]);
  if (exists) throw Object.assign(new Error('该账号已被注册'), { status: 409 });

  // 学习项目：第一个注册的账号自动成为管理员
  const [{ total }] = await query('SELECT COUNT(*) AS total FROM users');
  const role = Number(total) === 0 ? 'admin' : 'user';

  const hash = await bcrypt.hash(String(password), 10);
  const res = await query('INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)', [
    name,
    hash,
    String(nickname || '').trim() || name,
    role,
  ]);
  const row = await queryOne('SELECT * FROM users WHERE id = ?', [res.insertId]);
  return { user: publicUser(row), token: signToken(row), isFirstAdmin: role === 'admin' };
}

/**
 * 主站（音乐站）注册：与 /api/admin 的账号管理共用同一张 users 表，
 * 但**不允许**通过主站注册拿到管理员权限——管理员只能由已有管理员在管理台创建。
 * 这与 registerUser() 的「第一个注册即管理员」是刻意区分的两条路径：
 *   管理台首次部署 → registerUser() 负责种出第一个管理员；
 *   主站开放注册   → registerEndUser() 一律 user 角色。
 */
export async function registerEndUser({ username, password, nickname }) {
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) throw Object.assign(new Error('账号需为 2-16 位中文、字母、数字或下划线'), { status: 400 });
  if (String(password || '').length < 6) throw Object.assign(new Error('密码长度不能少于 6 位'), { status: 400 });

  const exists = await queryOne('SELECT id FROM users WHERE username = ?', [name]);
  if (exists) throw Object.assign(new Error('该账号已被注册，请直接登录'), { status: 409 });

  const hash = await bcrypt.hash(String(password), 10);
  const res = await query('INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)', [
    name,
    hash,
    String(nickname || '').trim() || name,
    'user',
  ]);
  const row = await queryOne('SELECT * FROM users WHERE id = ?', [res.insertId]);
  return { user: publicUser(row), token: signToken(row) };
}

export async function loginUser({ username, password }) {
  const row = await queryOne('SELECT * FROM users WHERE username = ?', [String(username || '').trim()]);
  if (!row) throw Object.assign(new Error('账号不存在，请先注册'), { status: 401 });
  const ok = await bcrypt.compare(String(password || ''), row.password_hash);
  if (!ok) throw Object.assign(new Error('密码错误，请重新输入'), { status: 401 });
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);
  row.last_login_at = new Date();
  return { user: publicUser(row), token: signToken(row) };
}

export async function findUserById(id) {
  const row = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
  return row ? publicUser(row) : null;
}

/** 首次启动时如果没有账号，自动创建一个超级管理员，便于直接验收 */
export async function ensureSeedAdmin() {
  const [{ total }] = await query('SELECT COUNT(*) AS total FROM users');
  if (Number(total) > 0) return null;
  const username = 'admin';
  const password = 'admin123456';
  const hash = await bcrypt.hash(password, 10);
  await query('INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)', [
    username,
    hash,
    '管理员',
    ROLE.SUPERADMIN,
  ]);
  return { username, password };
}

/**
 * 确保存在一个超级管理员账号。
 * 用于把已有的库升级到三级角色体系：如果库里还没有 superadmin，
 * 就把最早创建的 admin 提为 superadmin（保证系统始终有人能授予权限）。
 */
export async function ensureSuperAdmin() {
  const [{ total }] = await query('SELECT COUNT(*) AS total FROM users WHERE role = ?', [ROLE.SUPERADMIN]);
  if (Number(total) > 0) return null;
  const seed = await queryOne("SELECT id, username FROM users WHERE role = ? ORDER BY id LIMIT 1", [ROLE.ADMIN]);
  if (!seed) return null;
  await query('UPDATE users SET role = ? WHERE id = ?', [ROLE.SUPERADMIN, seed.id]);
  return { id: seed.id, username: seed.username };
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.auth = jwt.verify(token, config.jwt.secret);
    return next();
  } catch {
    return res.status(401).json({ error: '登录状态已过期，请重新登录' });
  }
}

/** 管理员及以上（admin / superadmin） */
export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!isAdminRole(req.auth?.role)) return res.status(403).json({ error: '需要管理员权限' });
    return next();
  });
}

/** 仅超级管理员 */
export function superAdminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.auth?.role !== ROLE.SUPERADMIN) return res.status(403).json({ error: '需要超级管理员权限' });
    return next();
  });
}
