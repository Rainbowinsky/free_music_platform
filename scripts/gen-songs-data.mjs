import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts', 'songs.json'), 'utf8'));

const FAKE_ARTIST = /(小爱|沈幼楚|小迷妹|街道办|周同学)/;
const keep = manifest.filter((s) => !FAKE_ARTIST.test(s.artist) && !/(深情版|原版|原唱|cover)/i.test(s.name));
const dropped = manifest.filter((s) => !keep.includes(s));

for (const s of dropped) {
  await fs.rm(path.join(ROOT, 'public', 'music', `${s.id}.mp3`), { force: true });
  if (s.cover) await fs.rm(path.join(ROOT, 'public', s.cover.replace(/^\//, '')), { force: true });
  if (s.lrc) await fs.rm(path.join(ROOT, 'public', s.lrc.replace(/^\//, '')), { force: true });
}

const songs = keep.map((s) => ({
  id: s.id,
  name: s.name,
  artist: s.artist,
  album: s.album || '未知专辑',
  cover: s.cover || '',
  src: s.src,
  lrc: s.lrc || undefined,
  duration: s.durationSec || 0,
}));

const header = `import type { Song } from '../types';

/**
 * 本地音乐库。
 * 音频/封面/歌词资源由 scripts 抓取后存放在 public/ 目录，
 * 页面刷新后即可离线播放，不依赖任何第三方接口。
 */
export const SONGS: Song[] = `;

const body = JSON.stringify(
  songs.map((s) => ({
    id: s.id,
    name: s.name,
    artist: s.artist,
    album: s.album,
    cover: s.cover,
    src: s.src,
    ...(s.lrc ? { lrc: s.lrc } : {}),
    duration: s.duration,
  })),
  null,
  2,
);

await fs.writeFile(path.join(ROOT, 'src', 'data', 'songs.ts'), `${header}${body};\n\nexport const SONG_MAP: Record<string, Song> = Object.fromEntries(SONGS.map((s) => [s.id, s]));\n`, 'utf8');

console.log(`kept ${songs.length}, dropped ${dropped.length} (${dropped.map((d) => d.name + '-' + d.artist).join(' | ')})`);
for (const s of songs) console.log(`${s.id}\t${s.name}\t${s.artist}\t${s.album}\t${s.duration}s`);
