import { Link } from 'react-router-dom';
import type { Playlist } from '../types';
import { playlistSongs } from '../data/playlists';
import { useSongMap } from '../store/catalog';
import { usePlayer } from '../store/player';
import { formatCount } from '../utils/format';
import { HeadphonesIcon, PlayIcon, TrashIcon } from './Icons';
import Cover from './Cover';

interface PlaylistCardProps {
  playlist: Playlist;
  onRemove?: () => void;
}

export default function PlaylistCard({ playlist, onRemove }: PlaylistCardProps) {
  const playQueue = usePlayer((s) => s.playQueue);
  const songMap = useSongMap();
  const songs = playlistSongs(playlist, songMap);

  return (
    <Link to={`/playlist/${playlist.id}`} className="playlist-card">
      <div className="playlist-cover">
        <Cover src={playlist.cover} name={playlist.title} size={180} radius={10} className="playlist-cover-img" />
        <button
          type="button"
          className="playlist-play"
          aria-label={`播放 ${playlist.title}`}
          onClick={(event) => {
            event.preventDefault();
            if (songs.length) playQueue(songs, 0);
          }}
        >
          <PlayIcon size={22} />
        </button>
        <span className="playlist-count">
          <HeadphonesIcon size={14} />
          {formatCount(playlist.playCount)}
        </span>
      </div>
      <p className="playlist-title" title={playlist.title}>
        {playlist.title}
      </p>
      <p className="playlist-meta">
        <span>{playlist.creator}</span>
        <span className="dot">·</span>
        <span>{playlist.tags[0]}</span>
      </p>
      {onRemove ? (
        <button
          type="button"
          className="playlist-remove"
          aria-label="取消收藏"
          onClick={(event) => {
            event.preventDefault();
            onRemove();
          }}
        >
          <TrashIcon size={15} />
          取消收藏
        </button>
      ) : null}
    </Link>
  );
}
