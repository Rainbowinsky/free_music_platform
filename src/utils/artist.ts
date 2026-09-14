/**
 * 歌手归属的单一事实来源
 *
 * 背景：曲库里 `songs.artist_text` 存的是完整歌手串（可能是「周杰伦/阿信」这样的合唱），
 * 而后端 `importer.js` 的 `findOrCreateArtist()` 只取 `split('/')[0]` 去括号后入库，
 * 也就是说 **数据库里的 artist_id 与歌手页认的都是「主歌手」**。
 *
 * 于是前端也必须用同一套规则，否则会出现两类错：
 *   1. 列表里点「阿信」跳到阿信页，但阿信页按 `includes()` 匹配又把它算进自己的歌，
 *      同一首歌于是同时挂在周杰伦页和阿信页；
 *   2. `includes()` 还会误伤——搜「周杰伦」时 `artist.includes('杰伦')` 之类的短名会串台。
 *
 * 注意：后端的 `artistKey()` 还额外做了一次繁简异体字纠偏（`normalize.js` 的 VARIANT 表），
 * 那是入库去重的口径，前端不重复维护；页面匹配走「主歌手名精确匹配 + 去标点小写」这一层即可。
 */

/** 去掉中英文括号及其内容，与后端 normalize.js 的 stripBrackets 一致 */
const stripBrackets = (value: string): string => value.replace(/[（(\[【][^）)\]】]*[）)\]】]/g, '').trim();

/** 合唱分隔符：后端只按 '/' 切，这里保持一致，避免两端口径不同 */
const SEPARATOR = '/';

/** 完整歌手串 → 各位歌手（去空、去重、保持原顺序） */
export function splitArtists(artist: string): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const part of String(artist || '').split(SEPARATOR)) {
    const name = stripBrackets(part);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }
  return list;
}

/**
 * 主歌手：全站「这首歌属于谁」的唯一口径。
 * 与后端 `findOrCreateArtist()` 完全一致：取第一段 + 去括号。
 * 兜底：整串为空时退回原串（避免出现空歌手导致链接变成 /artist/）。
 */
export function primaryArtist(artist: string): string {
  const first = splitArtists(artist)[0];
  if (first) return first;
  return stripBrackets(String(artist || '')).trim();
}

/** 歌手名归一化键：小写 + 去空白与常见标点，用于匹配与分组 */
export function artistKeyOf(name: string): string {
  return stripBrackets(String(name || ''))
    .toLowerCase()
    .replace(/[\s·・.,，、_\-'"!?！？:：&+]/g, '');
}

/**
 * 歌曲是否归属于某个歌手页。
 * 只认主歌手，因此一首「周杰伦/阿信」合唱的歌只出现在周杰伦页——
 * 与数据库里只存一个 artist_id 的事实保持一致。
 */
export function belongsToArtist(songArtist: string, targetName: string): boolean {
  const target = artistKeyOf(targetName);
  if (!target) return false;
  return artistKeyOf(primaryArtist(songArtist)) === target;
}
