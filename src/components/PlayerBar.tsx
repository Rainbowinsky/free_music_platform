import Cover from './Cover';
import PlayerControls, { VolumeControl } from './PlayerControls';
import { HeartFilledIcon, HeartIcon, MusicNoteIcon } from './Icons';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useRequireLogin } from '../hooks/useRequireLogin';

export default function PlayerBar() {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const setLyricsOpen = usePlayer((s) => s.setLyricsOpen);

  const liked = useLibrary((s) => s.liked);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const guard = useRequireLogin();

  const isLiked = current ? liked.includes(current.id) : false;

  return (
    <footer className="player">
      <div className="player-inner">
        <div className="player-left">
          {current ? (
            <>
              {/* 点击卡片进入全屏歌词页 */}
              <button
                type="button"
                className="player-card"
                title="打开歌词页"
                aria-label={`打开 ${current.name} 的歌词页`}
                onClick={() => setLyricsOpen(true)}
              >
                <span className={`player-cover ${isPlaying ? 'is-playing' : ''}`}>
                  <Cover src={current.cover} name={current.name} size={52} radius={8} />
                  <span className="player-cover-ring" />
                </span>
                <span className="player-meta">
                  <span className="player-name" title={current.name}>
                    {current.name}
                  </span>
                  <span className="player-artist" title={current.artist}>
                    {current.artist}
                  </span>
                </span>
                <span className="player-card-hint">歌词</span>
              </button>

              <button
                type="button"
                className={`player-like ${isLiked ? 'is-liked' : ''}`}
                aria-label={isLiked ? '取消喜欢' : '喜欢'}
                onClick={() => guard(() => toggleLike(current.id), '登录后即可收藏喜欢的音乐')}
              >
                {isLiked ? <HeartFilledIcon size={19} /> : <HeartIcon size={19} />}
              </button>
            </>
          ) : (
            <div className="player-idle">
              <span className="player-idle-cover">
                <MusicNoteIcon size={24} />
              </span>
              <div className="player-meta">
                <span className="player-name">还没有播放歌曲</span>
                <span className="player-artist">从首页挑一首开始吧</span>
              </div>
            </div>
          )}
        </div>

        <div className="player-center">
          <PlayerControls />
        </div>

        <div className="player-right">
          <VolumeControl />
        </div>
      </div>
    </footer>
  );
}
