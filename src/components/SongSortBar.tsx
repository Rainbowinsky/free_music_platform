import type { Song } from '../types';

export type SongSortKey = 'default' | 'name' | 'artist' | 'album' | 'duration';

export interface SongSort {
  key: SongSortKey;
  desc: boolean;
}

export const DEFAULT_SONG_SORT: SongSort = { key: 'default', desc: false };

const OPTIONS: { key: SongSortKey; label: string }[] = [
  { key: 'default', label: '默认' },
  { key: 'name', label: '歌名' },
  { key: 'artist', label: '歌手' },
  { key: 'album', label: '专辑' },
  { key: 'duration', label: '时长' },
];

/** 中文按拼音、数字按大小排（例如「10」排在「2」后面） */
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/** 按指定维度排序；default 保持原始顺序（收藏顺序 / 歌单内顺序 / 最近播放倒序） */
export function sortSongs(songs: Song[], sort: SongSort): Song[] {
  if (sort.key === 'default') return songs;
  const { key, desc } = sort;
  const factor = desc ? -1 : 1;
  return [...songs].sort((a, b) => {
    if (key === 'duration') return (a.duration - b.duration) * factor;
    return collator.compare(a[key], b[key]) * factor;
  });
}

interface SongSortBarProps {
  value: SongSort;
  onChange: (sort: SongSort) => void;
}

/**
 * 列表排序工具条：默认 / 歌名 / 歌手 / 专辑 / 时长。
 * 点击已选中的维度切换升降序，点「默认」还原原始顺序。
 */
export default function SongSortBar({ value, onChange }: SongSortBarProps) {
  return (
    <div className="sortbar" role="group" aria-label="列表排序">
      {OPTIONS.map((option) => {
        const active = value.key === option.key;
        const toggled = active && option.key !== 'default';
        return (
          <button
            key={option.key}
            type="button"
            className={`sortbar-item ${active ? 'is-active' : ''}`}
            aria-pressed={toggled ? undefined : active}
            title={toggled ? (value.desc ? '当前降序，点击切换为升序' : '当前升序，点击切换为降序') : undefined}
            onClick={() =>
              onChange(
                option.key === 'default'
                  ? DEFAULT_SONG_SORT
                  : active
                    ? { key: option.key, desc: !value.desc }
                    : { key: option.key, desc: false },
              )
            }
          >
            {option.label}
            {toggled ? (
              <span className="sortbar-arrow" aria-hidden="true">
                {value.desc ? '↓' : '↑'}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
