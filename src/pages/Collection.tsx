import { useEffect, useState } from 'react';
import PlaylistCard from '../components/PlaylistCard';
import AlbumCard from '../components/AlbumCard';
import Empty from '../components/Empty';
import type { Album, Playlist } from '../types';
import { useFeaturedPlaylistItems } from '../store/featuredPlaylists';
import { PLAYLIST_MAP } from '../data/playlists';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { fetchAlbums } from '../lib/album';

export default function Collection() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);
  const collected = useLibrary((s) => s.collected);
  const toggleCollect = useLibrary((s) => s.toggleCollect);
  const collectedAlbums = useLibrary((s) => s.collectedAlbums);
  const toggleCollectAlbum = useLibrary((s) => s.toggleCollectAlbum);
  const featured = useFeaturedPlaylistItems();
  // 与首页/侧边栏同一数据源；id 在内置示例里也查一遍，避免历史收藏被漏掉
  const playlists = collected
    .map((id): Playlist | undefined => featured.find((p) => p.id === id) ?? PLAYLIST_MAP[id])
    .filter((playlist): playlist is Playlist => Boolean(playlist));

  /**
   * 收藏的专辑只存了 id，详情还得回专辑接口取。
   * 这里一次拉全量再按 id 过滤（当前曲库几十张的量级），
   * 比按 id 逐个请求好得多；库里专辑数超过接口上限时再考虑加按 id 批量查询。
   */
  const [albumIndex, setAlbumIndex] = useState<Album[]>([]);
  useEffect(() => {
    if (!collectedAlbums.length) {
      setAlbumIndex([]);
      return undefined;
    }
    let cancelled = false;
    fetchAlbums({ size: 120 })
      .then((result) => {
        if (!cancelled) setAlbumIndex(result.items);
      })
      .catch(() => {
        // 拿不到就只显示歌单部分，不挡住整页
      });
    return () => {
      cancelled = true;
    };
  }, [collectedAlbums]);

  /** 按收藏顺序排列（最近收藏的在前），与收藏歌单保持一致 */
  const albums = collectedAlbums
    .map((id) => albumIndex.find((album) => String(album.id) === id))
    .filter((album): album is Album => Boolean(album));

  if (!user) {
    return (
      <Empty
        icon="🔒"
        title="登录后查看我的收藏"
        desc="收藏的歌单与专辑都会跟随账号同步，换设备也在"
        action={
          <button type="button" className="btn btn-primary" onClick={() => openModal('登录后即可收藏歌单和专辑')}>
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
        <span className="section-sub">
          {playlists.length} 个歌单 · {collectedAlbums.length} 张专辑
        </span>
      </header>

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">收藏的歌单</h3>
          <span className="section-sub">{playlists.length} 个</span>
        </header>
        {playlists.length ? (
          <div className="playlist-grid">
            {playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} onRemove={() => toggleCollect(playlist.id)} />
            ))}
          </div>
        ) : (
          <Empty title="还没有收藏任何歌单" desc="去首页逛逛，把喜欢的歌单收藏起来" />
        )}
      </section>

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">收藏的专辑</h3>
          <span className="section-sub">{collectedAlbums.length} 张</span>
        </header>
        {collectedAlbums.length ? (
          albums.length ? (
            <div className="album-grid">
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onRemove={() => void toggleCollectAlbum(String(album.id))}
                />
              ))}
            </div>
          ) : (
            <p className="page-tip">专辑详情暂时取不到（请确认后端已启动），稍后刷新即可。</p>
          )
        ) : (
          <Empty title="还没有收藏任何专辑" desc="去专辑页逛逛，把喜欢的专辑收藏起来" />
        )}
      </section>
    </div>
  );
}
