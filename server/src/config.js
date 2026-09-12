import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

/**
 * 读取 server/.env.local（不存在也不报错）。
 * 该文件已被 .gitignore 忽略，用于放本机的数据库口令与模型 Key。
 */
function loadEnvFile() {
  const file = path.join(SERVER_ROOT, '.env.local');
  const out = {};
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* 没有配置文件时全部走默认值 */
  }
  return out;
}

const env = { ...loadEnvFile(), ...process.env };
const pick = (key, fallback) => (env[key] !== undefined && env[key] !== '' ? env[key] : fallback);

export const config = {
  port: Number(pick('PORT', 4000)),

  db: {
    host: pick('DB_HOST', '127.0.0.1'),
    port: Number(pick('DB_PORT', 3306)),
    user: pick('DB_USER', 'root'),
    password: pick('DB_PASSWORD', '123456'),
    database: pick('DB_NAME', 'qqmusic'),
    connectionLimit: 8,
  },

  jwt: {
    secret: pick('JWT_SECRET', 'qqmusic-dev-secret-please-change'),
    expiresIn: pick('JWT_EXPIRES_IN', '7d'),
  },

  /** 实体归一化 / 版本裁决用的模型（未配置 Key 时自动降级为纯规则） */
  agent: {
    apiKey: pick('DEEPSEEK_API_KEY', ''),
    baseUrl: pick('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    model: pick('DEEPSEEK_MODEL', 'deepseek-chat'),
    enabled: Boolean(pick('DEEPSEEK_API_KEY', '')),
    /** 单次模型调用的超时：超时即退回规则打分，不让推理模型拖死整个搜索 */
    timeoutMs: Number(pick('DEEPSEEK_TIMEOUT_MS', 20000)),
  },

  /** 曲库静态资源目录：与前端 public/ 保持一致 */
  media: {
    music: path.join(PROJECT_ROOT, 'public', 'music'),
    covers: path.join(PROJECT_ROOT, 'public', 'covers'),
    lyrics: path.join(PROJECT_ROOT, 'public', 'lyrics'),
  },

  /** 入库判定阈值 */
  rules: {
    /** 小于该体积视为试听片段，不算全曲 */
    minFullBytes: 2_500_000,
    /** 候选召回上限 */
    maxCandidates: 6,
    /** 参与音频校验的候选上限 */
    maxVerify: 4,
  },

  /** 音源优先级：网易云为主力，酷狗/QQ音乐仅用于"发现条目与补元数据" */
  sources: {
    priority: ['netease', 'kugou', 'tencent'],
  },
};

export function ensureMediaDirs() {
  for (const dir of Object.values(config.media)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
