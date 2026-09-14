import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Banner from '../components/Banner';
import PlaylistCard from '../components/PlaylistCard';
import SongList from '../components/SongList';
import AlbumCard from '../components/AlbumCard';
import Cover from '../components/Cover';
import { playlistSongs } from '../data/playlists';
import { useFeaturedPlaylistItems } from '../store/featuredPlaylists';
import { useCatalogLoading, useSongs, useSongMap } from '../store/catalog';
import { SongListSkeleton } from '../components/Skeleton';
import { usePlayer } from '../store/player';
import { PlayIcon } from '../components/Icons';
import { fetchAlbums } from '../lib/album';
import { formatCount } from '../utils/format';
import type { Album } from '../types';

export default function Home() {
  const playQueue = usePlayer((s) => s.playQueue);
  const catalog = useSongs();
  const songMap = useSongMap();
  const loading = useCatalogLoading();
  const playlists = useFeaturedPlaylistItems();
  // 接口按入库时间倒序返回，所以前 10 首就是"最新入库"（含管理台新下载的歌）
  const latest = catalog.slice(0, 10);
  // 推荐歌单由管理台维护，排行榜区域直接取排序靠前的三个，避免依赖旧的静态歌单 ID。
  const ranks = playlists.slice(0, 3);

  /**
   * 首页推荐位里的「热门专辑」。
   * 拿不到就整块不渲染 —— 首页是首屏，宁可少一块也不要摆个加载失败的空壳。
   */
  const [hotAlbums, setHotAlbums] = useState<Album[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchAlbums({ sort: 'hot', size: 6 })
      .then((result) => {
        if (!cancelled) setHotAlbums(result.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page home">
      <Banner />

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">推荐歌单</h3>
          <Link className="section-more" to="/ranking">
            查看排行榜 ›
          </Link>
        </header>
        <div className="playlist-grid">
          {playlists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      </section>

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">最新音乐</h3>
          {!loading ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => playQueue(latest, 0)}>
              <PlayIcon size={14} />
              播放全部
            </button>
          ) : null}
        </header>
        {loading ? <SongListSkeleton rows={10} /> : <SongList songs={latest} />}
      </section>

      {hotAlbums.length ? (
        <section className="section">
          <header className="section-head">
            <h3 className="section-title">热门专辑</h3>
            <Link className="section-more" to="/albums">
              全部专辑 ›
            </Link>
          </header>
          <div className="album-grid">
            {hotAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">排行榜</h3>
        </header>
        <div className="rank-grid">
          {ranks.map((playlist) => {
            const songs = playlistSongs(playlist, songMap);
            return (
              <div className="rank-card" key={playlist.id}>
                <div className="rank-head">
                  <Cover src={playlist.cover} name={playlist.title} size={72} radius={10} />
                  <div className="rank-info">
                    <Link className="rank-title" to={`/playlist/${playlist.id}`}>
                      {playlist.title}
                    </Link>
                    <p className="rank-desc">{playlist.desc}</p>
                    <p className="rank-count">{formatCount(playlist.playCount)} 次播放</p>
                  </div>
                </div>
                <ol className="rank-list">
                  {songs.slice(0, 4).map((song, index) => (
                    <li key={song.id} className="rank-item" onClick={() => playQueue(songs, index)}>
                      <span className={`rank-no rank-no-${index + 1}`}>{index + 1}</span>
                      <span className="rank-song">{song.name}</span>
                      <span className="rank-artist">{song.artist}</span>
                    </li>
                  ))}
                </ol>
                <button type="button" className="rank-play" onClick={() => playQueue(songs, 0)}>
                  <PlayIcon size={14} />
                  播放
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
