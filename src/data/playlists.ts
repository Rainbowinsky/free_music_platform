import type { Playlist, Song } from '../types';
import { SONGS } from './songs';

const cover = (id: string) => SONGS.find((s) => s.id === id)?.cover ?? '';

export const PLAYLISTS: Playlist[] = [
  {
    id: 'hot',
    title: '热歌榜 TOP100',
    cover: cover('1357375695'),
    desc: '每天更新，收录当下最热的华语单曲',
    tags: ['流行', '热歌'],
    playCount: 128_900_000,
    creator: 'QQ音乐官方',
    songIds: [
      '1357375695',
      '1330348068',
      '28815250',
      '449818741',
      '1293886117',
      '32507038',
      '569200213',
      '436514312',
    ],
  },
  {
    id: 'new',
    title: '新歌速递 · 本周精选',
    cover: cover('233931'),
    desc: '每周精选新上线单曲，第一时间听见',
    tags: ['新歌', '精选'],
    playCount: 36_400_000,
    creator: 'QQ音乐官方',
    songIds: ['233931', '449818741', '1293886117', '27808044', '569213220', '1330348068'],
  },
  {
    id: 'classic',
    title: '岁月留声机 · 华语经典',
    cover: cover('139357'),
    desc: '那些年循环过无数遍的旋律，值得再听一次',
    tags: ['经典', '怀旧'],
    playCount: 88_200_000,
    creator: '音乐研究所',
    songIds: ['139357', '1357375695', '233931', '27731176', '167876', '167882'],
  },
  {
    id: 'campus',
    title: '青春民谣 · 校园回忆',
    cover: cover('436514312'),
    desc: '吉他、晚风、还有回不去的夏天',
    tags: ['民谣', '校园'],
    playCount: 21_700_000,
    creator: '民谣小站',
    songIds: ['436514312', '28815250', '139357', '25706282', '27731176'],
  },
  {
    id: 'rock',
    title: '摇滚热血现场',
    cover: cover('386175'),
    desc: '把音量开到最大，让心跳跟着鼓点走',
    tags: ['摇滚', '热血'],
    playCount: 15_300_000,
    creator: 'Live House',
    songIds: ['386175', '385781', '1357375695', '25706282', '28815250'],
  },
  {
    id: 'healing',
    title: '深夜治愈电台',
    cover: cover('569200213'),
    desc: '一个人的夜里，让音乐替你说说话',
    tags: ['治愈', '深夜'],
    playCount: 43_100_000,
    creator: '晚安电台',
    songIds: ['569200213', '569213220', '167882', '167850', '436514312'],
  },
  {
    id: 'chinese',
    title: '国风 · 诗意华语',
    cover: cover('167850'),
    desc: '一曲古调，千年的风月都藏进旋律里',
    tags: ['国风', '华语'],
    playCount: 27_500_000,
    creator: '国风集',
    songIds: ['167850', '167882', '167876', '165340'],
  },
  {
    id: 'sweet',
    title: '恋爱心事 · 甜蜜情歌',
    cover: cover('165340'),
    desc: '心跳的频率，正好是这首歌的节拍',
    tags: ['情歌', '甜蜜'],
    playCount: 52_600_000,
    creator: '恋爱博物馆',
    songIds: ['165340', '449818741', '1293886117', '27731176', '233931'],
  },
];

export const PLAYLIST_MAP: Record<string, Playlist> = Object.fromEntries(
  PLAYLISTS.map((p) => [p.id, p]),
);

export function playlistSongs(playlist: Playlist, map: Record<string, Song> = {}): Song[] {
  return playlist.songIds
    .map((id) => map[id])
    .filter((song): song is Song => Boolean(song));
}
