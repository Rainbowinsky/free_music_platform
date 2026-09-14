import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
import Empty from '../components/Empty';
import { SongListSkeleton } from '../components/Skeleton';
import { useSongs } from '../store/catalog';
import { usePlayer } from '../store/player';
import { toSongs, type ApiSong } from '../lib/song';
import { belongsToArtist } from '../utils/artist';
import type { Song } from '../types';
import { PlayIcon } from '../components/Icons';

/** GET /api/library/artists/:id（id 位置同时接受数字主键与歌手名）的返回结构 */
interface ArtistPayload {
  artist: { id: number; name: string; cover: string };
  albums: { id: number; name: string; cover: string; year: string }[];
  songs: ApiSong[];
}

export default function ArtistDetail() {
  const { name = '' } = useParams();
  const artistName = decodeURIComponent(name);
  const playQueue = usePlayer((s) => s.playQueue);
  const catalog = useSongs();

  const [data, setData] = useState<ArtistPayload | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * 直接调用后端已就绪的歌手详情接口（按名字查询，后端会走 name / name_key 匹配）。
   * 之前这里为了拿一张歌手头像去拉全量歌手列表，再在前端 find，
   * 既多传了整张表、又拿不到专辑与曲目，属实浪费。
   */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/library/artists/${encodeURIComponent(artistName)}`)
      .then((res) => (res.ok ? (res.json() as Promise<ArtistPayload>) : null))
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artistName]);

  /**
   * 后端曲库优先；接口不可用（或该歌手只存在于静态兜底曲库）时退回本地过滤。
   * 匹配只认「主歌手」，与后端 findOrCreateArtist 的口径一致 ——
   * 这样「周杰伦/阿信」这样的合唱曲目只会出现在周杰伦页，不会同时挂到阿信页。
   */
  const songs: Song[] = useMemo(() => {
    const fromApi = toSongs(data?.songs);
    if (fromApi.length) return fromApi;
    return catalog.filter((song) => belongsToArtist(song.artist, artistName));
  }, [data, catalog, artistName]);

  const albums = data?.albums ?? [];
  const cover = data?.artist?.cover || songs[0]?.cover || '';

  if (loading && !songs.length) {
    return (
      <div className="page">
        <header className="section-head">
          <h3 className="section-title">{artistName}</h3>
          <span className="section-sub">正在加载…</span>
        </header>
        <SongListSkeleton rows={6} />
      </div>
    );
  }

  if (!songs.length) {
    return (
      <Empty
        title={`没有找到歌手“${artistName}”`}
        desc="可能拼写有误，回歌手列表看看吧"
        action={
          <Link className="btn btn-primary" to="/artists">
            全部歌手
          </Link>
        }
      />
    );
  }

  return (
    <div className="page">
      <header className="artist-head">
        <Cover src={cover} name={artistName} size={150} rounded className="artist-head-cover" />
        <div className="artist-head-info">
          <span className="detail-tag">歌手</span>
          <h2 className="detail-title">{artistName}</h2>
          <p className="detail-desc">
            共 {songs.length} 首歌曲{albums.length ? ` · ${albums.length} 张专辑` : ''}
          </p>
          {albums.length ? (
            <p className="detail-tags">
              {albums.slice(0, 6).map((album) => (
                <Link className="tag tag-link" key={album.id} to={`/album/${album.id}`}>
                  {album.name}
                </Link>
              ))}
            </p>
          ) : null}
          <div className="detail-actions">
            <button type="button" className="btn btn-primary" onClick={() => playQueue(songs, 0)}>
              <PlayIcon size={15} />
              播放全部
            </button>
          </div>
        </div>
      </header>

      {albums.length ? (
        <section className="section">
          <header className="section-head">
            <h3 className="section-title">专辑</h3>
            <span className="section-sub">{albums.length} 张</span>
          </header>
          <div className="album-grid">
            {albums.map((album) => (
              <Link className="album-card" key={album.id} to={`/album/${album.id}`}>
                <Cover src={album.cover} name={album.name} size={132} radius={10} />
                <p className="artist-name">{album.name}</p>
                <p className="artist-count">{album.year || '年份未知'}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">热门歌曲</h3>
          <span className="section-sub">{songs.length} 首</span>
        </header>
        <SongList songs={songs} context={songs} />
      </section>
    </div>
  );
}
