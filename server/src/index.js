/**
 * 曲库学习项目后端
 *   - 账号与角色（JWT + bcrypt，第一个注册的账号自动成为管理员）
 *   - 曲库 API（歌曲/歌手/专辑/统计）
 *   - 管理端：在线搜歌入库、本地上传自动归档、曲库管理
 *   - 媒体文件仍然全部存放在本地 public/{music,covers,lyrics}
 */
import express from 'express';
import cors from 'cors';

import { config, ensureMediaDirs, PROJECT_ROOT } from './config.js';
import { initSchema, ping } from './db.js';
import {
  adminRequired,
  authRequired,
  ensureSeedAdmin,
  findUserById,
  loginUser,
  registerUser,
} from './auth.js';
import libraryRoutes from './routes/library.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 媒体文件同时由后端提供，方便独立调试
app.use('/music', express.static(config.media.music));
app.use('/covers', express.static(config.media.covers));
app.use('/lyrics', express.static(config.media.lyrics));
app.use(express.static(`${PROJECT_ROOT}/public`, { index: false, fallthrough: true }));

app.get('/api/health', async (_req, res) => {
  try {
    const version = await ping();
    res.json({ ok: true, mysql: version, database: config.db.database, agent: config.agent.enabled });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ── 鉴权
app.post('/api/auth/register', async (req, res, next) => {
  try {
    res.json(await registerUser(req.body || {}));
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    res.json(await loginUser(req.body || {}));
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const user = await findUserById(req.auth.sub);
  if (!user) return res.status(404).json({ error: '账号不存在' });
  return res.json({ user });
});

// ── 业务路由
app.use('/api/library', libraryRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: `接口不存在: ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error('[server]', error);
  res.status(status).json({ error: error.message || '服务器内部错误' });
});

async function bootstrap() {
  ensureMediaDirs();
  const tables = await initSchema();
  const seeded = await ensureSeedAdmin();
  const version = await ping();

  app.listen(config.port, () => {
    console.log(`✅ 曲库后端已启动 http://127.0.0.1:${config.port}`);
    console.log(`   MySQL ${version} · 库 ${config.db.database} · 建表 ${tables} 张`);
    console.log(`   媒体目录 ${config.media.music}`);
    console.log(`   模型裁决 ${config.agent.enabled ? `已启用（${config.agent.model}）` : '未配置 Key，使用纯规则'}`);
    if (seeded) console.log(`   已创建初始管理员：${seeded.username} / ${seeded.password}（请及时修改）`);
  });
}

// 兜底：单个请求出错（例如取消/超时打断 fetch）不应该把整个服务带下线
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason instanceof Error ? reason.stack || reason.message : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[server] uncaughtException:', error?.stack || error?.message || error);
});

bootstrap().catch((error) => {
  console.error('后端启动失败：', error.message);
  process.exit(1);
});

export default app;
