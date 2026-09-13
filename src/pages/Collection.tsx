import PlaylistCard from '../components/PlaylistCard';
import Empty from '../components/Empty';
import { useFeaturedPlaylistItems } from '../store/featuredPlaylists';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';

export default function Collection() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);
  const collected = useLibrary((s) => s.collected);
  const toggleCollect = useLibrary((s) => s.toggleCollect);
  const featured = useFeaturedPlaylistItems();
  const playlists = featured.filter((playlist) => collected.includes(playlist.id));

  if (!user) {
    return (
      <Empty
        icon="🔒"
        title="登录后查看我的收藏"
        desc="收藏的歌单会跟随账号同步，换设备也在"
        action={
          <button type="button" className="btn btn-primary" onClick={() => openModal('登录后即可收藏歌单')}>
            立即登录
          </button>
        }
      />
    );
  }

  return (
    <div className="page">
      <header className="section-head">
        <h3 className="section-title">我的收藏</h3>
        <span className="section-sub">{playlists.length} 个歌单</span>
      </header>

      {playlists.length ? (
        <div className="playlist-grid">
          {playlists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              onRemove={() => toggleCollect(playlist.id)}
            />
          ))}
        </div>
      ) : (
        <Empty title="还没有收藏任何歌单" desc="去首页逛逛，把喜欢的歌单收藏起来" />
      )}
    </div>
  );
}
