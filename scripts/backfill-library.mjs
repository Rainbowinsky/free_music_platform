/**
 * 把前端静态曲库（src/data/songs.ts 的 20 首）回填进 MySQL，
 * 让数据库成为唯一数据源，前端切到接口后不会丢歌。
 *
 * 用法：node scripts/backfill-library.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool, initSchema } from '../server/src/db.js';
import { findDuplicate, persistSong } from '../server/src/music/importer.js';

const ROOT = path.resolve('.');
const songsTs = await fs.readFile(path.join(ROOT, 'src', 'data', 'songs.ts'), 'utf8');

// 解析生成的 songs.ts：取 SONGS 数组那一段（注意类型标注 Song[] 里也有中括号）
const anchor = songsTs.indexOf('SONGS: Song[] = [');
const eq = songsTs.indexOf('= [', anchor);
const jsonStart = eq + 2;
const jsonEnd = songsTs.indexOf('\n];', jsonStart);
if (anchor < 0 || eq < 0 || jsonEnd < 0) throw new Error('无法解析 src/data/songs.ts');
const songs = JSON.parse(songsTs.slice(jsonStart, jsonEnd + 2));

await initSchema();

let created = 0;
let skipped = 0;
let missingFile = 0;

for (const song of songs) {
  const dup = await findDuplicate(song.name, song.artist);
  if (dup) {
    skipped += 1;
    console.log(`⏭  已在库：《${song.name}》- ${song.artist}`);
    continue;
  }

  const file = path.join(ROOT, 'public', 'music', `${song.id}.mp3`);
  const exists = await fs
    .stat(file)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    missingFile += 1;
    console.log(`⚠️  音频缺失，跳过：《${song.name}》- ${song.artist}（${file}）`);
    continue;
  }

  await persistSong({
    source: 'netease',
    sourceId: String(song.id),
    title: song.name,
    artist: song.artist,
    album: song.album || '未知专辑',
    durationSec: song.duration || 0,
    audioBuffer: Buffer.alloc(0), // 文件已存在，不重复下载
    coverBuffer: null,
    coverExt: 'jpg',
    lyricsText: '',
    externalUrl: '',
    playable: true,
    filePath: `/music/${song.id}.mp3`,
    coverPath: song.cover || '',
    lrcPath: song.lrc || '',
  });
  created += 1;
  console.log(`✅ 回填：《${song.name}》- ${song.artist}《${song.album}》`);
}

const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM songs');
console.log(`\n完成：新增 ${created} 首，跳过 ${skipped} 首（已在库），音频缺失 ${missingFile} 首`);
console.log(`当前曲库共 ${total} 首`);
await pool.end();
