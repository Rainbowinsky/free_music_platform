import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
import SongSortBar, { DEFAULT_SONG_SORT, sortSongs, type SongSort } from '../components/SongSortBar';
import Empty from '../components/Empty';
import { PLAYLIST_MAP, playlistSongs } from '../data/playlists';
import { useFeaturedPlaylistItems } from '../store/featuredPlaylists';
import { useSongMap } from '../store/catalog';
import { usePlayer } from '../store/player';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useRequireLogin } from '../hooks/useRequireLogin';
import { formatCount } from '../utils/format';
import { CloseIcon, HeartFilledIcon, HeartIcon, PlayIcon, SearchIcon } from '../components/Icons';

/** 超过这个数量才值得提供页内搜索 */
const FILTER_THRESHOLD = 8;

export default function PlaylistDetail() {
  const { id = '' } = useParams();
  const userPlaylist = useLibrary((s) => s.playlists.find((item) => item.id === id));
  const featuredPlaylists = useFeaturedPlaylistItems();
  const staticPlaylist = featuredPlaylists.find((item) => item.id === id) || PLAYLIST_MAP[id];

  const playQueue = usePlayer((s) => s.playQueue);
  const user = useAuth((s) => s.user);
  const collected = useLibrary((s) => s.collected);
  const toggleCollect = useLibrary((s) => s.toggleCollect);
  const removeSongs = useLibrary((s) => s.removeSongsFromPlaylist);
  const openPlaylistModal = useUi((s) => s.openPlaylistModal);
  const toast = useUi((s) => s.toast);
  const guard = useRequireLogin();
  const songMap = useSongMap();
  const [sort, setSort] = useState<SongSort>(DEFAULT_SONG_SORT);
  const [filter, setFilter] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const baseSongs = useMemo(() => {
    if (userPlaylist) {
      return userPlaylist.songIds
        .map((songId) => songMap[songId])
        .filter((song): song is NonNullable<typeof song> => Boolean(song));
    }
    return staticPlaylist ? playlistSongs(staticPlaylist, songMap) : [];
  }, [userPlaylist, staticPlaylist, songMap]);

  /** 页内搜索 + 排序：先按关键词过滤，再按用户选的维度排序 */
  const songs = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    const matched = keyword
      ? baseSongs.filter((song) =>
          [song.name, song.artist, song.album].some((field) => field.toLowerCase().includes(keyword)),
        )
      : baseSongs;
    return sortSongs(matched, sort);
  }, [baseSongs, filter, sort]);

  if (!userPlaylist && !staticPlaylist) {
    return (
      <Empty
        title="歌单不存在或已被删除"
        desc="换一个歌单听听吧"
        action={
          <Link className="btn btn-primary" to="/">
            回到首页
          </Link>
        }
      />
    );
  }

  const isOwn = Boolean(userPlaylist);

  const title = userPlaylist ? userPlaylist.title : staticPlaylist!.title;
  const desc = userPlaylist ? userPlaylist.desc : staticPlaylist!.desc;
  const cover = userPlaylist ? userPlaylist.cover || songs[0]?.cover || '' : staticPlaylist!.cover;
  const creator = userPlaylist ? user?.nickname ?? '我' : staticPlaylist!.creator;
  const tags = userPlaylist ? ['我创建的'] : staticPlaylist!.tags;
  const isCollected = staticPlaylist ? collected.includes(staticPlaylist.id) : false;

  const toggleSelect = (songId: string) => {
    setSelected((prev) => (prev.includes(songId) ? prev.filter((item) => item !== songId) : [...prev, songId]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected([]);
  };

  /** 批量移除所选：失败时 store 会回滚，选中态保留让用户能直接重试 */
  const handleBatchRemove = async () => {
    if (!selected.length) return;
    const count = selected.length;
    await removeSongs(id, selected);
    const failure = useLibrary.getState().error;
    if (failure) {
      toast(failure);
      return;
    }
    toast(`已从「${title}」移除 ${count} 首`);
    exitSelectMode();
  };

  return (
    <div className="page playlist-detail">
      <header className="detail-head">
        <Cover src={cover} name={title} size={196} radius={14} className="detail-cover" />
        <div className="detail-info">
          <span className="detail-tag">{isOwn ? '我的歌单' : '歌单'}</span>
          <h2 className="detail-title">{title}</h2>
          <p className="detail-creator">
            <span className="avatar avatar-sm">{creator.slice(0, 1)}</span>
            {creator}
          </p>
          <p className="detail-desc">{desc || '这个歌单还没有简介'}</p>
          <p className="detail-tags">
            {tags.map((tag) => (
              <span className="tag" key={tag}>
                #{tag}
              </span>
            ))}
            <span className="detail-stat">
              {staticPlaylist ? `播放 ${formatCount(staticPlaylist.playCount)} · ` : ''}
              共 {baseSongs.length} 首
            </span>
          </p>
          <div className="detail-actions">
            <button type="button" className="btn btn-primary" disabled={!songs.length} onClick={() => playQueue(songs, 0)}>
              <PlayIcon size={15} />
              播放全部
            </button>

            {isOwn ? (
              <>
                <button type="button" className="btn btn-outline" onClick={() => openPlaylistModal('edit', id)}>
                  编辑歌单
                </button>
                <Link className="btn btn-outline" to="/">
                  去添加歌曲
                </Link>
              </>
            ) : (
              <button
                type="button"
                className={`btn btn-outline ${isCollected ? 'is-collected' : ''}`}
                onClick={() => guard(() => toggleCollect(id), '登录后即可收藏歌单')}
              >
                {isCollected ? <HeartFilledIcon size={15} /> : <HeartIcon size={15} />}
                {isCollected ? '已收藏' : '收藏'}
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">歌曲列表</h3>
          <div className="section-tools">
            {baseSongs.length > FILTER_THRESHOLD ? (
              <span className="list-filter">
                <SearchIcon size={14} className="list-filter-icon" />
                <input
                  value={filter}
                  placeholder="在歌单内搜索"
                  aria-label="在歌单内搜索"
                  onChange={(event) => setFilter(event.target.value)}
                />
                {filter ? (
                  <button
                    type="button"
                    className="list-filter-clear"
                    aria-label="清空搜索"
                    onClick={() => setFilter('')}
                  >
                    <CloseIcon size={12} />
                  </button>
                ) : null}
              </span>
            ) : null}
            {songs.length > 1 || filter ? <SongSortBar value={sort} onChange={setSort} /> : null}
            {isOwn && baseSongs.length ? (
              <button
                type="button"
                className={`btn btn-outline btn-sm ${selectMode ? 'is-collected' : ''}`}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              >
                {selectMode ? '完成' : '多选'}
              </button>
            ) : null}
            <span className="section-sub">
              {filter
                ? `筛出 ${songs.length} / ${baseSongs.length} 首`
                : `${songs.length} 首歌${isOwn && !selectMode ? ' · 悬停歌曲可移除' : ''}`}
            </span>
          </div>
        </header>

        {selectMode ? (
          <div className="batch-bar">
            <span className="batch-count">
              已选 <strong>{selected.length}</strong> 首
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setSelected(songs.map((song) => song.id))}
            >
              全选本页
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!selected.length}
              onClick={() => setSelected([])}
            >
              取消选择
            </button>
            <button
              type="button"
              className="btn btn-danger-outline btn-sm"
              disabled={!selected.length}
              onClick={() => void handleBatchRemove()}
            >
              移除所选
            </button>
            <span className="batch-hint">多选模式下单击整行即可勾选</span>
          </div>
        ) : null}

        {isOwn && !baseSongs.length ? (
          <Empty
            title="这个歌单还是空的"
            desc="去首页或任意歌单，点击歌曲右侧的 + 就能加进来"
            action={
              <Link className="btn btn-primary" to="/">
                去发现音乐
              </Link>
            }
          />
        ) : songs.length ? (
          <SongList
            songs={songs}
            context={songs}
            selectable={selectMode}
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={(checked) => setSelected(checked ? songs.map((song) => song.id) : [])}
            onRemoveSong={
              isOwn && !selectMode
                ? async (song) => {
                    await removeSongs(id, [song.id]);
                    const failure = useLibrary.getState().error;
                    toast(failure || `已从「${title}」移除《${song.name}》`);
                  }
                : undefined
            }
          />
        ) : (
          <Empty title={`歌单里没有匹配「${filter.trim()}」的歌曲`} desc="换个关键词，或清空搜索条件" />
        )}
      </section>
    </div>
  );
}
