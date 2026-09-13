import { Link } from 'react-router-dom';
import Cover from '../components/Cover';
import { playlistSongs } from '../data/playlists';
import { useFeaturedPlaylistItems } from '../store/featuredPlaylists';
import { useSongMap } from '../store/catalog';
import { usePlayer } from '../store/player';
import { playModeLabel } from '../store/player';
import { formatCount, formatTime } from '../utils/format';
import { PlayIcon } from '../components/Icons';

export default function Ranking() {
  const playQueue = usePlayer((s) => s.playQueue);
  const mode = usePlayer((s) => s.mode);
  const songMap = useSongMap();
  const playlists = useFeaturedPlaylistItems();

  return (
    <div className="page">
      <header className="section-head">
        <h3 className="section-title">排行榜</h3>
        <span className="section-sub">当前播放模式：{playModeLabel[mode]}</span>
      </header>

      <div className="ranking-list">
        {playlists.map((playlist) => {
          const songs = playlistSongs(playlist, songMap);
          return (
            <section className="ranking-card" key={playlist.id}>
              <div className="ranking-left">
                <Cover src={playlist.cover} name={playlist.title} size={140} radius={12} />
                <Link className="ranking-title" to={`/playlist/${playlist.id}`}>
                  {playlist.title}
                </Link>
                <p className="ranking-desc">{playlist.desc}</p>
                <p className="ranking-count">播放 {formatCount(playlist.playCount)}</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => playQueue(songs, 0)}>
                  <PlayIcon size={14} />
                  播放全部
                </button>
              </div>
              <ul className="ranking-songs">
                {songs.slice(0, 6).map((song, index) => (
                  <li key={song.id} className="ranking-row" onClick={() => playQueue(songs, index)}>
                    <span className={`rank-no ${index < 3 ? `rank-no-${index + 1}` : ''}`}>{index + 1}</span>
                    <span className="ranking-song-name">{song.name}</span>
                    <span className="ranking-song-artist">{song.artist}</span>
                    <span className="ranking-song-time">{formatTime(song.duration)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
