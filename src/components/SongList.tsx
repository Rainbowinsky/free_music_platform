import { Link } from 'react-router-dom';
import type { Song } from '../types';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useRequireLogin } from '../hooks/useRequireLogin';
import { formatTime } from '../utils/format';
import { primaryArtist } from '../utils/artist';
import Cover from './Cover';
import { CloseIcon, HeartFilledIcon, HeartIcon, PauseIcon, PlayIcon, PlayNextIcon, PlusIcon } from './Icons';

interface SongListProps {
  songs: Song[];
  showAlbum?: boolean;
  showIndex?: boolean;
  showCover?: boolean;
  /** 播放时提供给播放器的上下文列表，默认使用 songs */
  context?: Song[];
  compact?: boolean;
  emptyText?: string;
  /** 传入后在每行显示“从歌单移除”按钮（我创建的歌单）；异步写入由调用方处理 */
  onRemoveSong?: (song: Song) => void | Promise<void>;
  /** 多选模式：行首出现复选列，单击整行 = 勾选/取消（此时不再触发播放） */
  selectable?: boolean;
  /** 已勾选的歌曲 id（仅在 selectable 时生效） */
  selectedIds?: string[];
  onToggleSelect?: (songId: string) => void;
  /** 表头全选框；不传则不渲染全选 */
  onToggleSelectAll?: (checked: boolean) => void;
}

export default function SongList({
  songs,
  showAlbum = true,
  showIndex = true,
  showCover = true,
  context,
  compact = false,
  emptyText = '这里还没有歌曲',
  onRemoveSong,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: SongListProps) {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playQueue = usePlayer((s) => s.playQueue);
  const toggle = usePlayer((s) => s.toggle);
  const playNext = usePlayer((s) => s.playNext);
  const liked = useLibrary((s) => s.liked);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const openAdd = useUi((s) => s.openAddToPlaylist);
  const toast = useUi((s) => s.toast);
  const guard = useRequireLogin();
  const list = context ?? songs;

  if (!songs.length) return <div className="songlist-empty">{emptyText}</div>;

  const selected = new Set(selectedIds ?? []);
  const allSelected = selectable && songs.every((song) => selected.has(song.id));

  const playAt = (song: Song) => {
    // 只有元数据、没有音源的曲目（例如独家版权曲目）不做播放，给出提示与官方入口
    if (song.playable === false || !song.src) {
      toast(`《${song.name}》暂无可用音源${song.externalUrl ? '，可点击「官方收听」跳转' : ''}`);
      return;
    }
    if (current?.id === song.id) {
      toggle();
      return;
    }
    const indexInList = list.findIndex((item) => item.id === song.id);
    playQueue(list, indexInList < 0 ? 0 : indexInList);
  };

  return (
    <div
      className={`songlist ${compact ? 'is-compact' : ''} ${showAlbum ? '' : 'no-album'} ${
        showCover ? '' : 'no-cover'
      } ${selectable ? 'is-selectable' : ''}`}
    >
      <div className="songlist-head">
        {selectable ? (
          <span className="col-check">
            <input
              type="checkbox"
              className="song-check"
              checked={allSelected}
              aria-label={allSelected ? '取消全选' : '全选'}
              onChange={(event) => onToggleSelectAll?.(event.target.checked)}
            />
          </span>
        ) : null}
        {showIndex ? <span className="col-index">#</span> : <span className="col-index" />}
        <span className="col-title">音乐标题</span>
        <span className="col-artist">歌手</span>
        {showAlbum ? <span className="col-album">专辑</span> : null}
        <span className="col-duration">时长</span>
      </div>

      {songs.map((song, index) => {
        const active = current?.id === song.id;
        const isLiked = liked.includes(song.id);
        const isSelected = selected.has(song.id);
        // 全站统一用「主歌手」做归属与跳转，与后端 findOrCreateArtist 的口径一致
        const artist = primaryArtist(song.artist);
        return (
          <div
            key={`${song.id}-${index}`}
            className={`song-row ${active ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`}
            onClick={selectable ? () => onToggleSelect?.(song.id) : undefined}
            onDoubleClick={selectable ? undefined : () => playAt(song)}
          >
            {selectable ? (
              <span className="col-check">
                <input
                  type="checkbox"
                  className="song-check"
                  checked={isSelected}
                  // 整行的 onClick 也会切换选中，这里拦掉冒泡，避免一次点击切两下
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onToggleSelect?.(song.id)}
                />
              </span>
            ) : null}

            <span className="col-index">
              {showIndex ? (
                <>
                  {active && isPlaying ? (
                    <span className="eq" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span className="song-no">{String(index + 1).padStart(2, '0')}</span>
                  )}
                </>
              ) : null}
              <button
                type="button"
                className="song-play"
                aria-label="播放"
                onClick={(event) => {
                  // 多选模式下整行会切换勾选，播放按钮不能把它一起带上
                  event.stopPropagation();
                  playAt(song);
                }}
              >
                {active && isPlaying ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
              </button>
            </span>

            <span className="col-title">
              {showCover ? (
                <Cover src={song.cover} name={song.name} size={40} radius={6} className="song-cover" />
              ) : null}
              <Link className="song-name" to={`/artist/${encodeURIComponent(artist)}`} title={song.name}>
                {song.name}
              </Link>
              {song.playable === false ? (
                <span className="song-badge" title="库中只有元数据，暂无可用音源">
                  无音源
                </span>
              ) : null}
              {song.playable === false && song.externalUrl ? (
                <a
                  className="song-external"
                  href={song.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  官方收听
                </a>
              ) : null}
            </span>

            <span className="col-artist">
              <Link to={`/artist/${encodeURIComponent(artist)}`} className="song-artist">
                {song.artist}
              </Link>
            </span>

            {showAlbum ? (
              <span className="col-album">
                {/* 只有后端曲库的曲目带专辑主键；静态兜底数据没有，退回纯文本 */}
                {song.albumId ? (
                  <Link className="song-album" to={`/album/${song.albumId}`}>
                    {song.album}
                  </Link>
                ) : (
                  song.album
                )}
              </span>
            ) : null}

            <span className="col-duration">
              <button
                type="button"
                className="song-next"
                title="下一首播放"
                aria-label="下一首播放"
                onClick={(event) => {
                  event.stopPropagation();
                  // 没有音源的曲目插进队列也放不出来，直接给出提示
                  if (song.playable === false || !song.src) {
                    toast(`《${song.name}》暂无可用音源`);
                    return;
                  }
                  if (playNext(song)) toast(`《${song.name}》已设为下一首播放`);
                  else toast(`《${song.name}》正在播放中`);
                }}
              >
                <PlayNextIcon size={16} />
              </button>
              <button
                type="button"
                className="song-add"
                title="添加到歌单"
                aria-label="添加到歌单"
                onClick={(event) => {
                  event.stopPropagation();
                  guard(() => openAdd(song.id), '登录后即可创建、收藏歌单');
                }}
              >
                <PlusIcon size={16} />
              </button>
              {onRemoveSong ? (
                <button
                  type="button"
                  className="song-remove"
                  title="从歌单中移除"
                  aria-label="从歌单中移除"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onRemoveSong(song);
                  }}
                >
                  <CloseIcon size={14} />
                </button>
              ) : null}
              <button
                type="button"
                className={`song-like ${isLiked ? 'is-liked' : ''}`}
                aria-label={isLiked ? '取消喜欢' : '喜欢'}
                onClick={(event) => {
                  event.stopPropagation();
                  guard(() => toggleLike(song.id), '登录后即可收藏喜欢的音乐');
                }}
              >
                {isLiked ? <HeartFilledIcon size={16} /> : <HeartIcon size={16} />}
              </button>
              <span className="duration-text">{formatTime(song.duration)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
