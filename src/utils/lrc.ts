export interface LyricLine {
  time: number;
  text: string;
}

/** 解析 LRC 文本，返回按时间排序的歌词行 */
export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
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
    for (const time of stamps) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
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
