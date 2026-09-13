export interface LyricLine {
  time: number;
  text: string;
  /** 该句的译文（中文）。没有译文时为空 */
  translation?: string;
}

/**
 * 字符系统判定
 *
 * 只用「假名 / 汉字 / 拉丁」三类足够区分原文与译文：
 * 日文原文必含假名，英文原文必含拉丁字母，而中文译文是纯汉字。
 */
const KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const LATIN = /[A-Za-z]/;

type Script = 'kana' | 'han' | 'latin' | 'other';

function scriptOf(text: string): Script {
  if (KANA.test(text)) return 'kana';
  if (HAN.test(text)) return 'han';
  if (LATIN.test(text)) return 'latin';
  return 'other';
}

/** 去掉行尾括号里的内容。格式 A 的译文就写在括号里，判语言时要先排除掉 */
function stripTrailingParen(text: string): string {
  return text.replace(/\s*[（(][^（()）]*[)）]\s*$/, '').trim();
}

/**
 * 判断整首歌的「主体语言」。
 *
 * 只有主体语言不是中文时，才可能存在中文译文 ——
 * 中文歌里的汉字就是原文，绝不能被当成译文（否则整首歌的歌词会被拆错）。
 *
 * 注意：统计时必须用**去掉括号后**的文本。否则《Baby》这类
 * `You know you love me (你知道你爱我)` 会因括号里全是汉字而被误判成中文歌，
 * 结果整首歌的译文识别直接失效。
 */
function detectPrimary(entries: { text: string }[]): Script {
  let kana = 0;
  let han = 0;
  let latin = 0;
  for (const entry of entries) {
    const script = scriptOf(stripTrailingParen(entry.text));
    if (script === 'kana') kana += 1;
    else if (script === 'han') han += 1;
    else if (script === 'latin') latin += 1;
  }
  if (kana > 0) return 'kana';
  // 汉字与拉丁字母数量接近 → 大概率是「英文原文 + 中文译文」
  if (han > 0 && latin > 0 && latin >= han * 0.6) return 'latin';
  return han > 0 ? 'han' : 'latin';
}

/** 把 LRC 文本切成 {时间, 文本}，保持文件内顺序（同时间戳的行相对顺序不变） */
function parseEntries(raw: string): { time: number; text: string }[] {
  const entries: { time: number; text: string }[] = [];
  const timeRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const row of raw.split('\n')) {
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    timeRe.lastIndex = 0;
    while ((match = timeRe.exec(row))) {
      const min = Number(match[1]);
      const sec = Number(match[2]);
      const ms = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
      stamps.push(min * 60 + sec + ms / 1000);
    }
    if (!stamps.length) continue;
    const text = row.replace(timeRe, '').trim();
    if (!text) continue;
    for (const time of stamps) entries.push({ time, text });
  }
  // sort 是稳定的，所以同一时间戳的先后顺序与文件一致（格式 B 的配对依赖这一点）
  return entries.sort((a, b) => a.time - b.time);
}

/**
 * 找出行尾最外层括号的范围。
 *
 * 用反向配对而不是正则，是因为译文本身可能带括号，例如
 * `Yeahh, yeah, yeah (oh I am all gone) (好吧，好吧，好吧（噢我完全放手了）)`
 * —— 正则无法处理嵌套。这里只认与收尾括号同种的那一对，
 * 另一种（中文全角 / 英文半角）直接忽略，因为正文里混用很常见。
 */
function findTrailingParen(text: string): { start: number; inner: string } | null {
  let end = text.length - 1;
  while (end >= 0 && /\s/.test(text[end])) end -= 1;
  if (end < 0) return null;

  const close = text[end];
  const open = close === ')' ? '(' : close === '）' ? '（' : null;
  if (!open) return null;

  let depth = 0;
  for (let i = end; i >= 0; i -= 1) {
    if (text[i] === close) depth += 1;
    else if (text[i] === open) {
      depth -= 1;
      if (depth === 0) return { start: i, inner: text.slice(i + 1, end) };
    }
  }
  return null;
}

/**
 * 格式 A：译文内联在同一行的括号里（网易云 lrc 接口常见）。
 * 只有「括号内是纯汉字」且「括号外含假名或拉丁字母」才拆，
 * 避免把中文歌里的 `晴天 (钢琴版)` 之类误判成译文。
 */
function splitInline(text: string): { text: string; translation?: string } {
  const found = findTrailingParen(text);
  if (!found) return { text };
  const inner = found.inner.trim();
  const outer = text.slice(0, found.start).trim();
  if (!inner || !outer) return { text };
  if (scriptOf(inner) !== 'han') return { text };
  const outerScript = scriptOf(outer);
  if (outerScript !== 'kana' && outerScript !== 'latin') return { text };
  return { text: outer, translation: inner };
}

/**
 * 格式 B：译文单独占一行，且与「下一句原文」共用同一个时间戳。
 *
 * 这是本仓库里那首日文歌的实际情况，形如：
 *   [00:24.08] 私は私 貴方は貴方と          ← 原文
 *   [00:32.82] 我是我 你也只是你            ← 这句是**上一句**的译文
 *   [00:32.82] 昨夜言ってたそんな気もするわ  ← 新原文
 * 即译文被错误地打上了下一句的时间戳，这里把它归位到对应原文上。
 */
function mergeShiftedPairs(
  entries: { time: number; text: string }[],
  isTranslation: (text: string) => boolean,
): LyricLine[] {
  const out: LyricLine[] = [];
  /** 等待配译文的原文 */
  let pending: { time: number; text: string } | null = null;
  const flush = () => {
    if (pending) {
      out.push({ time: pending.time, text: pending.text });
      pending = null;
    }
  };

  for (let i = 0; i < entries.length; i += 1) {
    const cur = entries[i];
    const next = entries[i + 1];
    const nextSameStamp = Boolean(next) && Math.abs(next.time - cur.time) < 0.001;

    if (isTranslation(cur.text)) {
      // 情况一（最常见）：与「下一句原文」共用时间戳
      if (nextSameStamp && next && !isTranslation(next.text)) {
        if (pending) {
          out.push({ time: pending.time, text: pending.text, translation: cur.text });
        } else {
          // 没有可配对的原文（例如开头就是译文）：原样保留，不丢内容
          out.push({ time: cur.time, text: cur.text });
        }
        pending = next;
        i += 1; // next 已被消费
        continue;
      }
      // 情况二：整首歌最后一句是译文，它后面已经没有原文了。
      // 不做这个兜底的话，末句译文会掉成一条独立的"正文"行。
      if (i === entries.length - 1 && pending) {
        out.push({ time: pending.time, text: pending.text, translation: cur.text });
        pending = null;
        continue;
      }
    }

    flush();
    pending = cur;
  }

  flush();
  return out;
}

/**
 * 解析 LRC 文本，返回按时间排序的歌词行。
 * 若歌词带中文译文，会自动归并到对应行的 `translation` 字段上。
 */
export function parseLrc(raw: string): LyricLine[] {
  const entries = parseEntries(raw);
  if (!entries.length) return [];

  const primary = detectPrimary(entries);
  // 中文歌：汉字即原文，不存在译文
  if (primary === 'han') return entries.map((entry) => ({ time: entry.time, text: entry.text }));

  // 格式 A：内联括号译文。要求至少拆出 3 句，否则视为误判
  const inlined = entries.map((entry) => ({ time: entry.time, ...splitInline(entry.text) }));
  if (inlined.filter((entry) => entry.translation).length >= 3) {
    return inlined.map((entry) => ({ time: entry.time, text: entry.text, translation: entry.translation }));
  }

  // 格式 B：译文与下一句原文共用时间戳
  return mergeShiftedPairs(entries, (text) => scriptOf(text) === 'han');
}

/** 这组歌词是否含任意一句译文（用于决定要不要显示「翻译」开关） */
export function hasTranslation(lines: LyricLine[]): boolean {
  return lines.some((line) => Boolean(line.translation));
}

/** 找到当前时间对应的歌词行下标 */
export function activeLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (!lines.length) return -1;
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= currentTime + 0.15) index = i;
    else break;
  }
  return index;
}
