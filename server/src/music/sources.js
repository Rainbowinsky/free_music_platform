/**
 * 音源适配层
 *
 * 实测结论（.probe/probe-*.mjs）：
 *  - netease：唯一稳定的全曲音源（VIP 也能取到全曲），主力
 *  - kugou / tencent：能搜到条目（含网易云缺失的曲目），但当前第三方中转解析不到音频，
 *    因此只用于「发现条目 + 补元数据」，音源不可用时不作为入库来源
 *  - kuwo：该中转未实现
 */
import { config } from '../config.js';

const METING = process.env.METING_BASE || 'https://api.qijieya.cn/meting/';
const NETEASE_API = 'https://music.163.com';
const UA = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 组合「超时」与「外部取消」两个信号，任一触发都会中止请求 */
function combineSignals(timeoutController, signal) {
  if (!signal) return timeoutController.signal;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeoutController.signal, signal]);
  return timeoutController.signal;
}

async function fetchWithTimeout(url, { ms = 20000, headers = {}, method = 'GET', signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method,
      headers: { ...UA, ...headers },
      signal: combineSignals(controller, signal),
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function request(url, { ms = 20000, json = false, retries = 2, method = 'GET', headers = {}, signal } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (signal?.aborted) return { ok: false, status: 0, ct: '', buf: Buffer.alloc(0), headers: null, error: 'aborted', aborted: true };
    try {
      const res = await fetchWithTimeout(url, { ms, method, headers, signal });
      const ct = res.headers.get('content-type') || '';
      if (json) {
        const text = await res.text();
        try {
          return { ok: res.ok, status: res.status, ct, data: JSON.parse(text), headers: res.headers };
        } catch {
          return { ok: res.ok, status: res.status, ct, data: null, headers: res.headers };
        }
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: res.ok, status: res.status, ct, buf, headers: res.headers };
    } catch (error) {
      // 外部取消：不再重试，直接返回
      if (signal?.aborted) return { ok: false, status: 0, ct: '', buf: Buffer.alloc(0), headers: null, error: 'aborted', aborted: true };
      if (attempt === retries) return { ok: false, status: 0, ct: '', buf: Buffer.alloc(0), headers: null, error: error.message };
      await sleep(500 * attempt);
    }
  }
  return null;
}

const decodeJsonString = (raw) => {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
};

/** 解析 meting 的搜索结果（它的返回是拼接的 JSON，picId 会超出 JS 精度，因此用正则取原始串） */
export function parseMetingList(text = '') {
  const out = [];
  const re = /\{"name":"(.*?)","artist":"(.*?)","url":"(.*?)","pic":"(.*?)","lrc":"(.*?)"\}/g;
  let m;
  while ((m = re.exec(text))) {
    const idMatch = /id=([^&"]+)/.exec(m[3]);
    out.push({
      name: decodeJsonString(m[1]),
      artist: decodeJsonString(m[2]),
      picUrl: m[4].replace(/\\\//g, '/'),
      lrcUrl: m[5].replace(/\\\//g, '/'),
      id: idMatch ? idMatch[1] : '',
    });
  }
  return out;
}

const audioUrl = (server, id, br = 320) => `${METING}?server=${server}&type=url&id=${encodeURIComponent(id)}&br=${br}`;
const lrcUrl = (server, id) => `${METING}?server=${server}&type=lrc&id=${encodeURIComponent(id)}`;

/** 第三方中转搜索 */
export async function searchSource(server, keyword, { signal } = {}) {
  const res = await request(`${METING}?server=${server}&type=search&id=${encodeURIComponent(keyword)}`, { retries: 2, signal });
  if (!res || !res.buf) return [];
  const list = parseMetingList(res.buf.toString('utf8'));
  return list.map((item) => ({ ...item, server }));
}

/** 网易云官方搜索接口：能拿到 fee / 时长 / 专辑名，用于更准的判定 */
export async function searchNeteaseOfficial(keyword, limit = 30, { signal } = {}) {
  const res = await request(
    `${NETEASE_API}/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=${limit}`,
    { json: true, retries: 2, signal },
  );
  const songs = res?.data?.result?.songs || [];
  return songs.map((s) => ({
    server: 'netease',
    id: String(s.id),
    name: s.name,
    artist: (s.artists || []).map((a) => a.name).join('/'),
    artists: (s.artists || []).map((a) => a.name),
    album: s.album?.name || '',
    durationSec: s.duration ? Math.round(s.duration / 1000) : 0,
    fee: s.fee,
  }));
}

/** 歌曲详情：专辑名、封面、时长 */
export async function neteaseDetail(id, { signal } = {}) {
  const res = await request(`${NETEASE_API}/api/song/detail?ids=%5B${id}%5D`, { json: true, retries: 2, signal });
  const info = res?.data?.songs?.[0];
  if (!info) return null;
  return {
    id: String(info.id),
    name: info.name,
    artists: (info.artists || []).map((a) => a.name),
    artist: (info.artists || []).map((a) => a.name).join('/'),
    album: info.album?.name || '',
    coverUrl: info.album?.picUrl || '',
    durationSec: info.duration ? Math.round(info.duration / 1000) : 0,
  };
}

/**
 * 探测音源体积（避免为了判断"是不是全曲"而把整首歌下下来）
 * 返回 { reachable, size, ct }：size 为 null 表示无法在下载前判断
 */
export async function probeAudio(server, id, br = 320, { signal } = {}) {
  const url = audioUrl(server, id, br);
  const head = await request(url, { method: 'HEAD', ms: 12000, retries: 1, signal });
  const headCt = head?.headers?.get('content-type') || '';
  const headLen = Number(head?.headers?.get('content-length') || 0);
  if (headCt.includes('audio') && headLen > 0) return { reachable: true, size: headLen, ct: headCt };

  const ranged = await request(url, { ms: 15000, retries: 1, headers: { Range: 'bytes=0-1' }, signal });
  const ct = ranged?.headers?.get('content-type') || '';
  const range = ranged?.headers?.get('content-range') || '';
  const total = /bytes\s+\d+-\d+\/(\d+)/i.exec(range);
  if (ct.includes('audio') && total) return { reachable: true, size: Number(total[1]), ct };
  if (ct.includes('audio') && ranged?.buf?.length) return { reachable: true, size: null, ct, partial: true };
  return { reachable: ct.includes('audio'), size: null, ct };
}

/** 下载音频 */
export async function fetchAudio(server, id, br = 320, { signal } = {}) {
  const res = await request(audioUrl(server, id, br), { ms: 90000, retries: 1, signal });
  const size = res?.buf?.length || 0;
  return { ok: Boolean(res?.ct?.includes('audio')) && size > 0, ct: res?.ct || '', buf: res?.buf || Buffer.alloc(0), size };
}

/** 下载歌词 */
export async function fetchLyrics(server, id, { signal } = {}) {
  const res = await request(lrcUrl(server, id), { ms: 25000, retries: 2, signal });
  const text = res?.buf ? res.buf.toString('utf8') : '';
  const lines = text.split('\n').filter((l) => /^\[\d{2}:\d{2}/.test(l)).length;
  return { ok: lines > 8, text, lines };
}

/** 下载图片 */
export async function fetchImage(url, { signal } = {}) {
  if (!url) return { ok: false, ct: '', buf: Buffer.alloc(0) };
  const res = await request(url, { ms: 25000, retries: 2, signal });
  const ct = res?.ct || '';
  const ok = ct.includes('image') && (res?.buf?.length || 0) > 5000;
  return { ok, ct, buf: res?.buf || Buffer.alloc(0) };
}

/** 合规外链：无音源时引导到官方平台 */
export function externalSearchUrl(title, artist = '') {
  return `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${title} ${artist}`.trim())}`;
}

export { METING, sleep };
