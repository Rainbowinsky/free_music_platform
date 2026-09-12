import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Cover from '../components/Cover';
import { useSongs } from '../store/catalog';
import { gradientOf } from '../utils/format';

export default function Artists() {
  const songs = useSongs();
  const artists = useMemo(() => {
    const map = new Map<string, { name: string; cover: string; count: number }>();
    for (const song of songs) {
      const name = song.artist;
      const exist = map.get(name);
      if (exist) exist.count += 1;
      else map.set(name, { name, cover: song.cover, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [songs]);

  return (
    <div className="page">
      <header className="section-head">
        <h3 className="section-title">热门歌手</h3>
        <span className="section-sub">{artists.length} 位歌手</span>
      </header>

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
    </div>
  );
}
