import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('public');
const META = 'https://api.qijieya.cn/meting/';
const NET = 'https://music.163.com';

const WANTED = [
  ['海阔天空', 'Beyond'],
  ['起风了', '买辣椒也用券'],
  ['稻香', '周杰伦'],
  ['晴天', '周杰伦'],
  ['告白气球', '周杰伦'],
  ['七里香', '周杰伦'],
  ['夜曲', '周杰伦'],
  ['平凡之路', '朴树'],
  ['演员', '薛之谦'],
  ['成都', '赵雷'],
  ['光年之外', '邓紫棋'],
  ['泡沫', '邓紫棋'],
  ['消愁', '毛不易'],
  ['小幸运', '田馥甄'],
  ['后来', '刘若英'],
  ['十年', '陈奕迅'],
  ['红玫瑰', '陈奕迅'],
  ['光辉岁月', 'Beyond'],
  ['夜空中最亮的星', '逃跑计划'],
  ['大鱼', '周深'],
  ['体面', '于文文'],
  ['追光者', '岑宁儿'],
  ['少年', '梦然'],
  ['句号', '邓紫棋'],
  ['说散就散', '袁娅维'],
  ['传奇', '王菲'],
  ['浮夸', '陈奕迅'],
  ['突然好想你', '五月天'],
  ['倔强', '五月天'],
  ['曾经的你', '许巍'],
  ['蓝莲花', '许巍'],
  ['斑马斑马', '宋冬野'],
  ['董小姐', '宋冬野'],
];

const BAD = /(伴奏|纯音乐|钢琴|吉他|治愈|翻唱|cover|remix|dj|抖音|铃声|片段|remix|女声|男声|童声|合唱|串烧|新版|重制|demo|试听)/i;
const TARGET = Number(process.argv[2] || 14);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeJsonString(raw) {
  try { return JSON.parse(`"${raw}"`); } catch { return raw; }
}

function parseSearch(text) {
  const out = [];
  const re = /\{"name":"(.*?)","artist":"(.*?)","url":"(.*?)","pic":"(.*?)","lrc":"(.*?)"\}/g;
  let m;
  while ((m = re.exec(text))) {
    const idMatch = /id=([^&"]+)/.exec(m[3]);
    out.push({
      name: decodeJsonString(m[1]),
      artist: decodeJsonString(m[2]),
      url: m[3].replace(/\\\//g, '/'),
      pic: m[4].replace(/\\\//g, '/'),
      lrc: m[5].replace(/\\\//g, '/'),
      id: idMatch ? idMatch[1] : '',
    });
  }
  return out;
}

async function req(url, { ms = 25000, json = false, retries = 3 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } });
      if (json) {
        const text = await r.text();
        try { return JSON.parse(text); } catch { return null; }
      }
      return { status: r.status, ct: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(800 * attempt);
    } finally { clearTimeout(t); }
  }
  return null;
}

function normTitle(n) { return n.replace(/[\s(（\[【].*$/, '').trim(); }

await fs.mkdir(path.join(OUT, 'music'), { recursive: true });
await fs.mkdir(path.join(OUT, 'covers'), { recursive: true });
await fs.mkdir(path.join(OUT, 'lyrics'), { recursive: true });

const manifest = [];
const used = new Set();

for (const [title, artist] of WANTED) {
  if (manifest.length >= TARGET) break;
  let candidates = [];
  for (let attempt = 0; attempt < 3 && candidates.length === 0; attempt++) {
    try {
      const r = await req(`${META}?server=netease&type=search&id=${encodeURIComponent(`${title} ${artist}`)}`, { retries: 2 });
      candidates = parseSearch(r.buf.toString('utf8'));
    } catch { /* retry */ }
    if (candidates.length === 0) await sleep(1200);
  }
  const shortArtist = artist.replace(/\s/g, '');
  const ranked = candidates
    .map((c) => {
      let score = 0;
      if (normTitle(c.name) === title) score += 100;
      if (c.artist.replace(/\s/g, '').includes(shortArtist)) score += 50;
      if (BAD.test(c.name)) score -= 80;
      if (/(live|现场)/i.test(c.name)) score -= 20;
      return { ...c, score };
    })
    .filter((c) => c.score > 0 && !used.has(c.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (ranked.length === 0) { console.log(`MISS  ${title} - ${artist}`); await sleep(400); continue; }

  let got = false;
  for (const cand of ranked) {
    try {
      const audio = await req(`${META}?server=netease&type=url&id=${cand.id}&br=320`, { ms: 60000, retries: 1 });
      if (!audio || !audio.ct.includes('audio') || audio.buf.length < 2_500_000) {
        console.log(`  skip ${cand.name} - ${cand.artist} (${(audio ? audio.buf.length / 1048576 : 0).toFixed(2)}MB ${audio ? audio.ct : 'err'})`);
        await sleep(300);
        continue;
      }

      const detail = await req(`https://music.163.com/api/song/detail?ids=%5B${cand.id}%5D`, { json: true, retries: 2 });
      const info = detail && detail.songs && detail.songs[0];
      const albumName = (info && info.album && info.album.name) || '';
      const picUrl = (info && info.album && info.album.picUrl) || '';
      const durSec = info && info.duration ? Math.round(info.duration / 1000) : 0;
      const artistName = info && info.artists ? info.artists.map((a) => a.name).join('/') : cand.artist;

      let cover = '';
      if (picUrl) {
        try {
          const pic = await req(picUrl, { ms: 25000, retries: 2 });
          if (pic && pic.ct.includes('image') && pic.buf.length > 5000) {
            const ext = pic.ct.includes('png') ? 'png' : 'jpg';
            await fs.writeFile(path.join(OUT, 'covers', `${cand.id}.${ext}`), pic.buf);
            cover = `/covers/${cand.id}.${ext}`;
          }
        } catch { /* ignore */ }
      }

      let lrc = '';
      try {
        const lrcRes = await req(cand.lrc || `${META}?server=netease&type=lrc&id=${cand.id}`, { ms: 25000, retries: 2 });
        const lrcText = lrcRes && lrcRes.buf ? lrcRes.buf.toString('utf8') : '';
        const lines = lrcText.split('\n').filter((l) => /^\[\d{2}:\d{2}/.test(l));
        if (lines.length > 8) {
          await fs.writeFile(path.join(OUT, 'lyrics', `${cand.id}.lrc`), lrcText, 'utf8');
          lrc = `/lyrics/${cand.id}.lrc`;
        }
      } catch { /* ignore */ }

      await fs.writeFile(path.join(OUT, 'music', `${cand.id}.mp3`), audio.buf);
      used.add(cand.id);
      manifest.push({
        id: cand.id,
        name: info ? info.name : cand.name,
        artist: artistName,
        album: albumName,
        durationSec: durSec,
        cover,
        lrc,
        src: `/music/${cand.id}.mp3`,
        mb: +(audio.buf.length / 1048576).toFixed(2),
      });
      console.log(`OK    ${manifest[manifest.length - 1].name} - ${artistName} | ${albumName} | ${durSec}s | ${(audio.buf.length / 1048576).toFixed(2)}MB | cover=${!!cover} lrc=${!!lrc}`);
      got = true;
      break;
    } catch (e) {
      console.log(`  err ${cand.name}: ${e.message}`);
    }
    await sleep(300);
  }
  if (!got) console.log(`FAIL  ${title} - ${artist} (no playable source)`);
  await sleep(500);
}

await fs.writeFile(path.resolve('scripts', 'songs.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('TOTAL', manifest.length);
