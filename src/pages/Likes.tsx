import { Link } from 'react-router-dom';
import SongList from '../components/SongList';
import Empty from '../components/Empty';
import { useSongMap } from '../store/catalog';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { PlayIcon } from '../components/Icons';

export default function Likes() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);
  const liked = useLibrary((s) => s.liked);
  const playQueue = usePlayer((s) => s.playQueue);
  const songMap = useSongMap();

  if (!user) {
    return (
      <Empty
        icon="🔒"
        title="登录后查看我喜欢的音乐"
        desc="收藏的歌曲会跟随账号保存在本地"
        action={
          <button type="button" className="btn btn-primary" onClick={() => openModal('登录后即可收藏喜欢的音乐')}>
            立即登录
          </button>
        }
      />
    );
  }

  const songs = liked.map((id) => songMap[id]).filter((song): song is NonNullable<typeof song> => Boolean(song));

  return (
    <div className="page">
      <header className="likes-head">
        <div className="likes-info">
          <span className="likes-badge">我喜欢的音乐</span>
          <h2 className="likes-title">{user.nickname}</h2>
          <p className="likes-desc">共 {songs.length} 首歌曲 · 数据保存在本地浏览器</p>
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!songs.length}
              onClick={() => playQueue(songs, 0)}
            >
              <PlayIcon size={15} />
              播放全部
            </button>
            <Link className="btn btn-outline" to="/">
              去发现音乐
            </Link>
          </div>
        </div>
      </header>

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">歌曲列表</h3>
          <span className="section-sub">{songs.length} 首</span>
        </header>
        {songs.length ? (
          <SongList songs={songs} context={songs} />
        ) : (
          <Empty title="还没有喜欢的歌曲" desc="点击歌曲右侧的心形图标，把喜欢的歌收进来" />
        )}
      </section>
    </div>
  );
}
