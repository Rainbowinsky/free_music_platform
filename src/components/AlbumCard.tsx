import { Link } from 'react-router-dom';
import type { Album } from '../types';
import { albumKind } from '../lib/album';
import { formatTotalDuration } from '../utils/format';
import { primaryArtist } from '../utils/artist';
import Cover from './Cover';
import { CloseIcon, PlayIcon } from './Icons';

interface AlbumCardProps {
  album: Album;
  /**
   * 传入后悬停封面出现播放按钮（播放整张专辑）。
   * 需要调用方自己拉曲目，所以这里只负责触发，不关心怎么取数据。
   */
  onPlay?: () => void;
  /** 正在拉曲目准备播放，按钮转成「准备中」并禁用，避免连点重复请求 */
  playLoading?: boolean;
  /** 传入后卡片右上角出现「取消收藏」（我的收藏页用） */
  onRemove?: () => void;
  /** 是否显示歌手名；歌手页里整页都是同一位歌手，重复显示没意义 */
  showArtist?: boolean;
}

/**
 * 专辑卡片。
 *
 * 歌手页、专辑库、搜索结果、我的收藏共用同一个卡片，
 * 否则同一个专辑在不同页面上「年份 / 曲目数 / 歌手名」的展示会不一致。
 * 结构上刻意不用「整卡包一个 Link」：卡里同时要有歌手链接和按钮，
 * a 套 a 是非法 HTML，浏览器会把内层链接拆出去。
 */
export default function AlbumCard({
  album,
  onPlay,
  playLoading = false,
  onRemove,
  showArtist = true,
}: AlbumCardProps) {
  const kind = albumKind(album.songCount);
  const artist = primaryArtist(album.artistName);
  const meta = [album.year ? `${album.year} 年` : '', `${album.songCount} 首`].filter(Boolean).join(' · ');

  return (
    <div className="album-card">
      <div className="album-card-media">
        <Link to={`/album/${album.id}`} className="album-card-cover" title={album.name}>
          {/* 尺寸交给 CSS 跟着网格列宽走，这里只给一个基准值（同时也是占位渐变的首字大小） */}
          <Cover src={album.cover} name={album.name} size={132} radius={10} />
        </Link>
        {onPlay ? (
          <button
            type="button"
            className="album-card-play"
            title={playLoading ? '正在准备曲目…' : '播放整张专辑'}
            aria-label={playLoading ? '正在准备曲目' : '播放整张专辑'}
            disabled={playLoading || !album.songCount}
            onClick={onPlay}
          >
            <PlayIcon size={16} />
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            className="album-card-remove"
            title="取消收藏"
            aria-label="取消收藏"
            onClick={onRemove}
          >
            <CloseIcon size={13} />
          </button>
        ) : null}
      </div>

      <Link className="album-card-name" to={`/album/${album.id}`} title={album.name}>
        {album.name}
      </Link>

      {showArtist && artist ? (
        <Link className="album-card-artist" to={`/artist/${encodeURIComponent(artist)}`} title={album.artistName}>
          {album.artistName}
        </Link>
      ) : null}

      <p className="album-card-meta">
        {kind ? <span className="album-card-kind">{kind}</span> : null}
        {meta}
      </p>

      {album.totalDuration ? (
        <p className="album-card-meta album-card-duration">{formatTotalDuration(album.totalDuration)}</p>
      ) : null}
    </div>
  );
}
