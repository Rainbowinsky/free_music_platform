import { Link, useParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
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
import { HeartFilledIcon, HeartIcon, PlayIcon } from '../components/Icons';

export default function PlaylistDetail() {
  const { id = '' } = useParams();
  const userPlaylist = useLibrary((s) => s.playlists.find((item) => item.id === id));
  const featuredPlaylists = useFeaturedPlaylistItems();
  const staticPlaylist = featuredPlaylists.find((item) => item.id === id) || PLAYLIST_MAP[id];

  const playQueue = usePlayer((s) => s.playQueue);
  const user = useAuth((s) => s.user);
  const collected = useLibrary((s) => s.collected);
  const toggleCollect = useLibrary((s) => s.toggleCollect);
  const removeSong = useLibrary((s) => s.removeSongFromPlaylist);
  const openPlaylistModal = useUi((s) => s.openPlaylistModal);
  const toast = useUi((s) => s.toast);
  const guard = useRequireLogin();
  const songMap = useSongMap();

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
  const songs = userPlaylist
    ? userPlaylist.songIds.map((songId) => songMap[songId]).filter((song): song is NonNullable<typeof song> => Boolean(song))
    : playlistSongs(staticPlaylist!, songMap);

  const title = userPlaylist ? userPlaylist.title : staticPlaylist!.title;
  const desc = userPlaylist ? userPlaylist.desc : staticPlaylist!.desc;
  const cover = userPlaylist ? userPlaylist.cover || songs[0]?.cover || '' : staticPlaylist!.cover;
  const creator = userPlaylist ? user?.nickname ?? '我' : staticPlaylist!.creator;
  const tags = userPlaylist ? ['我创建的'] : staticPlaylist!.tags;
  const isCollected = staticPlaylist ? collected.includes(staticPlaylist.id) : false;

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
              共 {songs.length} 首
            </span>
          </p>
          <div className="detail-actions">
            <button type="button" className="btn btn-primary" disabled={!songs.length} onClick={() => playQueue(songs, 0)}>
              <PlayIcon size={15} />
              播放全部
            </button>

            {isOwn ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => openPlaylistModal('edit', id)}
                >
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
          <span className="section-sub">
            {songs.length} 首歌{isOwn ? ' · 悬停歌曲可移除' : ''}
          </span>
        </header>

        {isOwn && !songs.length ? (
          <Empty
            title="这个歌单还是空的"
            desc="去首页或任意歌单，点击歌曲右侧的 + 就能加进来"
            action={
              <Link className="btn btn-primary" to="/">
                去发现音乐
              </Link>
            }
          />
        ) : (
          <SongList
            songs={songs}
            context={songs}
            onRemoveSong={
              isOwn
                ? async (song) => {
                    await removeSong(id, song.id);
                    const failure = useLibrary.getState().error;
                    toast(failure || `已从「${title}」移除《${song.name}》`);
                  }
                : undefined
            }
          />
        )}
      </section>
    </div>
  );
}
