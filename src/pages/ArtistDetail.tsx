import { Link, useParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
import Empty from '../components/Empty';
import { useSongs } from '../store/catalog';
import { usePlayer } from '../store/player';
import { PlayIcon } from '../components/Icons';

export default function ArtistDetail() {
  const { name = '' } = useParams();
  const artistName = decodeURIComponent(name);
  const playQueue = usePlayer((s) => s.playQueue);
  const catalog = useSongs();
  const songs = catalog.filter((song) => song.artist === artistName || song.artist.includes(artistName));

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

  const albums = [...new Set(songs.map((song) => song.album))];

  return (
    <div className="page">
      <header className="artist-head">
        <Cover src={songs[0].cover} name={artistName} size={150} rounded className="artist-head-cover" />
        <div className="artist-head-info">
          <span className="detail-tag">歌手</span>
          <h2 className="detail-title">{artistName}</h2>
          <p className="detail-desc">
            共 {songs.length} 首歌曲 · {albums.length} 张专辑
          </p>
          <p className="detail-tags">
            {albums.slice(0, 4).map((album) => (
              <span className="tag" key={album}>
                {album}
              </span>
            ))}
          </p>
          <div className="detail-actions">
            <button type="button" className="btn btn-primary" onClick={() => playQueue(songs, 0)}>
              <PlayIcon size={15} />
              播放全部
            </button>
          </div>
        </div>
      </header>

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
