/**
 * DeepSeek 接入层
 *
 * 定位（依据探针数据）：只负责「规则做不好的那几件事」——
 *   1. 查询理解：把"周杰伦那首很火的关于妈妈的歌"变成 { title, artist }
 *   2. 实体归一化 / 版本裁决：久石譲·久石让、米津玄師·米津玄师、"大鱼 (唱片版)" 是否算原版
 *   3. 自动打标签（语种/年代/风格）
 * 不负责：编造不存在的音源、绕过版权。
 *
 * 未配置 Key 或调用失败时，全部自动降级为纯规则，不影响主链路。
 */
import { config } from '../config.js';

const TIMEOUT_MS = config.agent.timeoutMs;

export const agentEnabled = () => config.agent.enabled;

/** 从文本里抠出第一个 JSON 对象（推理模型有时把答案写在 reasoning_content 里） */
function extractJson(text = '') {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  return text.slice(start, end + 1);
}

/**
 * 调用模型。
 * 注意：deepseek-flash / deepseek-v4-pro 是推理模型，会先输出 reasoning_content，
 * 推理 token 也算在 max_tokens 里，预算不足时 content 会是空的 —— 这种情况自动放大预算重试。
 */
async function chat(messages, { json = true, temperature = 0, maxTokens = 3000, signal, deadline } = {}) {
  if (!config.agent.enabled) return null;
  if (signal?.aborted) return { aborted: true, error: 'aborted' };
  // deadline：整次裁决的总预算，避免"预算不足重试"把 20 秒超时变成 40 秒
  const budget = deadline ? Math.max(1000, deadline - Date.now()) : TIMEOUT_MS;
  if (deadline && budget <= 1000) return { error: '模型裁决超时（已达总预算）', timedOut: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const combined =
    signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  try {
    const res = await fetch(`${config.agent.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: combined,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.agent.apiKey}`,
      },
      body: JSON.stringify({
        model: config.agent.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const text = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    const data = JSON.parse(text);
    const choice = data.choices?.[0];
    const content = (choice?.message?.content ?? '').trim();
    const reasoning = choice?.message?.reasoning_content ?? '';

    // 推理吃光了预算：在总预算内放大预算重试一次
    if (!content && choice?.finish_reason === 'length' && maxTokens < 8000) {
      clearTimeout(timer);
      if (deadline && deadline - Date.now() < 3000) return { error: '模型推理超出预算', timedOut: true };
      return chat(messages, { json, temperature, maxTokens: Math.min(8000, maxTokens * 2), signal, deadline });
    }

    const payload = content || extractJson(reasoning);
    if (!json) return { content: payload, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens };
    if (!payload) return { error: '模型没有返回内容', finishReason: choice?.finish_reason };
    try {
      return {
        data: JSON.parse(payload.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()),
        usage: data.usage,
      };
    } catch {
      return { error: `返回不是合法 JSON: ${payload.slice(0, 200)}` };
    }
  } catch (error) {
    if (signal?.aborted) return { aborted: true, error: 'aborted' };
    // 超时（自己 abort）与网络错误都走这里：调用方会退回规则打分
    const timedOut = error.name === 'AbortError';
    return { error: timedOut ? `模型超时（>${TIMEOUT_MS}ms）` : error.message, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

/** 账号/模型可用性检查 */
export async function agentStatus() {
  if (!config.agent.enabled) {
    return { enabled: false, model: config.agent.model, message: '未配置 DEEPSEEK_API_KEY，裁决将使用纯规则' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${config.agent.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.agent.apiKey}` },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { enabled: true, ok: false, model: config.agent.model, message: `HTTP ${res.status}: ${text.slice(0, 160)}` };
    const data = JSON.parse(text);
    const models = (data.data || []).map((m) => m.id);
    return { enabled: true, ok: true, model: config.agent.model, models, modelAvailable: models.includes(config.agent.model) };
  } catch (error) {
    return { enabled: true, ok: false, model: config.agent.model, message: error.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 自由文本 → { title, artist } */
export async function parseQuery(raw, { signal } = {}) {
  const result = await chat(
    [
      {
        role: 'system',
        content:
          '你是音乐检索助手。把用户输入解析成 JSON：{"title": 歌名, "artist": 歌手, "confident": true|false}。' +
          '规则：用户可能用口语描述（如"周杰伦那首关于妈妈的歌"→{"title":"听妈妈的话","artist":"周杰伦"}）；' +
          '不确定时 title 保留用户原话、artist 留空，confident 置 false。只输出 JSON。',
      },
      { role: 'user', content: String(raw) },
    ],
    { signal, maxTokens: 1200 },
  );
  if (!result?.data) return null;
  return {
    title: String(result.data.title || '').trim(),
    artist: String(result.data.artist || '').trim(),
    confident: Boolean(result.data.confident),
  };
}

/**
 * 候选裁决：判断哪些是"目标歌曲的原版"
 * @returns {Promise<Array<{index:number, verdict:string, confidence:number, reason:string}>|null>}
 */
export async function adjudicate({ target, candidates, signal }) {
  if (!candidates.length) return null;
  // 整次裁决的总预算：单次调用与重试共享，避免最坏情况翻倍
  const deadline = Date.now() + TIMEOUT_MS;
  const list = candidates.slice(0, 6).map((c, i) => ({
    index: i,
    name: c.name,
    artist: c.artist,
    album: c.album || '',
    durationSec: c.durationSec || 0,
    sizeMB: c.sizeMB ?? null,
    source: c.source,
    audioAvailable: c.audioAvailable ?? null,
  }));
  const result = await chat(
    [
      {
        role: 'system',
        content:
          '你是音乐库管理员助手，负责在多个同名/翻唱结果里挑出"用户真正想要的那首歌"。\n' +
          '判定要点：\n' +
          '- 歌手别名与异体字要视为同一人（久石譲=久石让、米津玄師=米津玄师、"冯沁苑(买辣椒也用券)"=买辣椒也用券）\n' +
          '- 标题带「翻自/cover/混音/remix/钢琴版/伴奏/改大调」的是非原版；「唱片版/正式版」这类属于正式版本，可视为原版\n' +
          '- 时长明显偏短（<90s）多半是试听片段或剪辑版\n' +
          '- 专辑名与参考信息一致时可信度更高\n' +
          '- audioAvailable=false 表示该来源的音源实际取不到（条目存在但无法下载），此时 confidence 不得超过 40\n' +
          '- audioAvailable=null 表示未探测，不影响判断\n' +
          '输出 JSON：{"results":[{"index":0,"verdict":"original|variant|cover|unknown","confidence":0-100,"reason":"不超过20字的中文理由"}]}，' +
          'results 必须覆盖所有候选，只输出 JSON，不要输出多余文字。',
      },
      {
        role: 'user',
        content: JSON.stringify({ target, candidates: list }),
      },
    ],
    { maxTokens: 1600, signal, deadline },
  );
  // 失败时把 error/timedOut 透出去，调用方据此决定提示文案
  if (!result?.data?.results) return result ?? null;
  return result.data.results;
}

/** 自动打标签：语种 / 年代 / 风格（可选能力，失败不影响入库） */
export async function tagSong({ title, artist, album }) {
  const result = await chat([
    {
      role: 'system',
      content:
        '给歌曲打标签。输出 JSON：{"language":"华语|粤语|日语|英语|韩语|纯音乐|其他","era":"80年代|90年代|00年代|10年代|20年代|未知","styles":["流行","摇滚"]}。只输出 JSON。',
    },
    { role: 'user', content: JSON.stringify({ title, artist, album }) },
  ]);
  if (!result?.data) return null;
  return {
    language: String(result.data.language || '其他'),
    era: String(result.data.era || '未知'),
    styles: Array.isArray(result.data.styles) ? result.data.styles.slice(0, 4).map(String) : [],
  };
}
