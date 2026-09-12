import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { config } from './config.js';
import { query, queryOne } from './db.js';

const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,16}$/;

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

/** 首次启动时如果没有账号，自动创建一个管理员，便于直接验收 */
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
    'admin',
  ]);
  return { username, password };
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

export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.auth?.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    return next();
  });
}
