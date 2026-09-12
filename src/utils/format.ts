/** 秒 -> mm:ss */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 播放量之类的数字格式化：12345 -> 1.2万 */
export function formatCount(count: number): string {
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}亿`;
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  return String(count);
}

/** 封面缺失时用歌曲名首字生成占位文案 */
export function coverInitial(name: string): string {
  return (name || '?').trim().charAt(0);
}

const PALETTE = [
  ['#31c27c', '#1f9e63'],
  ['#4a90e2', '#3a6fb0'],
  ['#f5a623', '#e08a10'],
  ['#e56a6a', '#c04b4b'],
  ['#9b6be0', '#7448b5'],
  ['#3fc1c9', '#2a9aa1'],
];

/** 根据字符串稳定生成一个渐变色，用于图片缺失时的占位 */
export function gradientOf(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  const [from, to] = PALETTE[hash % PALETTE.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}
