import SongList from '../components/SongList';
import Empty from '../components/Empty';
import { useSongMap } from '../store/catalog';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { PlayIcon } from '../components/Icons';

export default function Recent() {
  const user = useAuth((s) => s.user);
  const recent = useLibrary((s) => s.recent);
  const clearRecent = useLibrary((s) => s.clearRecent);
  const playQueue = usePlayer((s) => s.playQueue);
  const songMap = useSongMap();

  const songs = recent
    .map((id) => songMap[id])
    .filter((song): song is NonNullable<typeof song> => Boolean(song));

  return (
    <div className="page">
      <header className="section-head">
        <h3 className="section-title">最近播放</h3>
        <div className="section-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!songs.length}
            onClick={() => playQueue(songs, 0)}
          >
            <PlayIcon size={14} />
            播放全部
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!songs.length}
            onClick={() => void clearRecent()}
          >
            清空记录
          </button>
        </div>
      </header>

      <p className="page-tip">
        {user ? `已同步到账号「${user.nickname}」` : '当前为设备记录，登录后可同步到账号'}
      </p>

      {songs.length ? (
        <SongList songs={songs} context={songs} />
      ) : (
        <Empty title="还没有播放记录" desc="去首页播放几首歌吧" />
      )}
    </div>
  );
}
