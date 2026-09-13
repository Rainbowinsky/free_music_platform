import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Cover from '../components/Cover';
import { ArtistGridSkeleton } from '../components/Skeleton';
import { useSongs } from '../store/catalog';
import { gradientOf } from '../utils/format';

interface ApiArtist {
  id: number;
  name: string;
  cover: string;
  songCount: number;
}

export default function Artists() {
  const songs = useSongs();
  const [apiArtists, setApiArtists] = useState<ApiArtist[] | null>(null);
  /** 歌手接口是否已返回（无论成功失败），用于决定是否继续显示骨架屏 */
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/library/artists')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: ApiArtist[] } | null) => {
        // 空数组也视为"接口已就绪"，避免清空曲库时回落到内置静态数据
        if (!cancelled && data?.items) setApiArtists(data.items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);
  const fallbackArtists = useMemo(() => {
    const map = new Map<string, { name: string; cover: string; count: number }>();
    for (const song of songs) {
      const name = song.artist;
      const exist = map.get(name);
      if (exist) exist.count += 1;
      else map.set(name, { name, cover: song.cover, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [songs]);
  const artists = apiArtists
    ? apiArtists.map((artist) => ({ name: artist.name, cover: artist.cover, count: artist.songCount }))
    : fallbackArtists;

  return (
    <div className="page">
      <header className="section-head">
        <h3 className="section-title">热门歌手</h3>
        {loaded ? <span className="section-sub">{artists.length} 位歌手</span> : null}
      </header>

      {!loaded ? (
        <ArtistGridSkeleton count={12} />
      ) : (
        <div className="artist-grid">
          {artists.map((artist) => (
            <Link key={artist.name} className="artist-card" to={`/artist/${encodeURIComponent(artist.name)}`}>
              <span className="artist-avatar" style={{ background: gradientOf(artist.name) }}>
                <Cover src={artist.cover} name={artist.name} size={132} rounded className="artist-avatar-img" />
              </span>
              <p className="artist-name">{artist.name}</p>
              <p className="artist-count">{artist.count} 首歌曲</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
