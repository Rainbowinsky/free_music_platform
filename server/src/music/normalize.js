/**
 * 实体归一化与候选裁决
 *
 * 这里的规则是把 .probe/probe-v2.mjs 验证过的逻辑产品化：
 * 实测发现"能不能下到"不是瓶颈，"能不能判定为正确的那个版本"才是
 * （久石譲/久石让、米津玄師/米津玄师、冯沁苑(买辣椒也用券) 这类需要归一化，
 *   而混音版/改大调翻自版 这类必须被识别出来）。
 */

/** 去掉括注内容，保留主标题 */
export const stripBrackets = (s = '') => s.replace(/[（(\[【][^）)\]】]*[）)\]】]/g, '').trim();

/** 标题归一化：去括注、小写、去空白与标点（英文标题不会被空格截断） */
export const titleKey = (s = '') =>
  stripBrackets(s)
    .toLowerCase()
    .replace(/[\s·・.,，、_\-'"!?！？:：]/g, '');

/** 歌手归一化：去括注、繁简异体字纠偏、去空白标点 */
const VARIANT = {
  譲: '让', 讓: '让', 師: '师', 澤: '泽', 學: '学', 藥: '药', 龍: '龙', 陳: '陈',
  張: '张', 劉: '刘', 鄧: '邓', 傑: '杰', 倫: '伦', 國: '国', 華: '华', 樂: '乐',
};
export const simplify = (s = '') => s.replace(/[譲讓師澤學藥龍陳張劉鄧傑倫國華樂]/g, (c) => VARIANT[c] || c);

export const artistKey = (s = '') =>
  simplify(stripBrackets(s))
    .toLowerCase()
    .replace(/[\s·・.,，、_\-()（）'"]/g, '');

export const artistFullKey = (s = '') =>
  simplify(s)
    .toLowerCase()
    .replace(/[\s·・.,，、_\-()（）'"]/g, '');

/** 歌手是否匹配：精确 / 主名相等 / 互为包含（处理 "冯沁苑(买辣椒也用券)" 这类） */
export function artistMatches(artists = [], target = '') {
  const tk = artistKey(target);
  if (!tk) return false;
  return artists.some((a) => {
    const full = artistFullKey(a);
    const primary = artistKey(a);
    if (!primary && !full) return false;
    if (primary === tk || full === tk) return true;
    if (tk.length >= 2 && full.includes(tk)) return true;
    if (primary.length >= 2 && tk.includes(primary)) return true;
    return false;
  });
}

/** 版本修饰词：命中即视为"非原版" */
export const MODIFIER =
  /(伴奏|纯音乐|钢琴曲|吉他曲|治愈|翻唱|翻自|cover|remix|混音|dj|抖音|铃声|片段|女声|男声|童声|合唱|串烧|新版|重制|重置|修复|demo|试听|加速|慢速|大调|小调|改编|填词|朗诵|lofi|instrumental|karaoke)/i;

/** 标题是否为"原版"（不含修饰词） */
export function isOriginalTitle(name = '', targetTitle = '') {
  if (titleKey(name) !== titleKey(targetTitle)) return false;
  return !MODIFIER.test(name);
}

/** 评分：分数越高越可信；同时产出可读的标记，用于管理端展示 */
export function scoreCandidate(
  { name, artists = [], album = '', durationSec = 0, sizeBytes = 0, source = '', audioAvailable },
  target,
) {
  const flags = [];
  let score = 0;

  if (titleKey(name) === titleKey(target.title)) score += 40;
  else if (titleKey(name).includes(titleKey(target.title))) {
    score += 10;
    flags.push('标题不精确');
  } else {
    flags.push('标题不匹配');
    score -= 40;
  }

  if (isOriginalTitle(name, target.title)) score += 20;
  else if (MODIFIER.test(name)) {
    score -= 60;
    flags.push(`非原版（${(MODIFIER.exec(name) || [''])[0]}）`);
  }

  if (artistMatches(artists, target.artist)) score += 30;
  else if (artists.length) {
    score -= 40;
    flags.push('歌手不匹配');
  } else {
    flags.push('歌手信息缺失');
  }

  if (album) score += 10;
  else flags.push('无专辑信息');

  if (durationSec) {
    const ref = Number(target.refSec || 0);
    if (durationSec < 60) {
      score -= 40;
      flags.push(`时长过短 ${durationSec}s`);
    } else if (ref && Math.abs(durationSec - ref) > Math.max(50, ref * 0.3)) {
      score -= 25;
      flags.push(`时长偏差大 ${durationSec}s（参考 ${ref}s）`);
    } else {
      score += 10;
    }
  }

  if (sizeBytes) {
    if (sizeBytes >= 2_500_000) score += 15;
    else {
      score -= 30;
      flags.push(`仅试听 ${(sizeBytes / 1048576).toFixed(2)}MB`);
    }
  }

  if (source === 'netease') score += 5; // 网易云音源成功率最高

  // 条目存在但音源取不到（实测酷狗/QQ音乐的中转解析不通）：只能当线索，不能当可入库原版
  if (audioAvailable === false) {
    score -= 45;
    flags.push('音源不可用，仅线索');
  }

  const confidence = Math.max(0, Math.min(100, Math.round(((score + 60) / 200) * 100)));
  return { score, confidence, flags };
}

/** 曲库去重键 */
export const dedupKey = (title, artist) => `${titleKey(title)}|${artistKey(artist)}`;

/** 简易中文/英文分词式关键词提取，用于"周杰伦 晴天"这类自由输入 */
export function splitQuery(raw = '') {
  const text = raw.replace(/[《》""'']/g, ' ').trim();
  const m = /^(.+?)[\s\-—/]+(.+)$/.exec(text);
  if (!m) return { title: text, artist: '' };
  return { title: m[1].trim(), artist: m[2].trim() };
}
