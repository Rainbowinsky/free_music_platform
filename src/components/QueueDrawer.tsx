import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Cover from './Cover';
import { CloseIcon, TrashIcon } from './Icons';
import { usePlayer } from '../store/player';
import { activeLyricIndex } from '../utils/lrc';
import { useLyrics } from '../hooks/useLyrics';
import { formatTime } from '../utils/format';

type Tab = 'queue' | 'lyric';

export default function QueueDrawer() {
  const open = usePlayer((s) => s.drawerOpen);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const current = usePlayer((s) => s.current);
  const progress = usePlayer((s) => s.progress);
  const setDrawer = usePlayer((s) => s.setDrawer);
  const removeAt = usePlayer((s) => s.removeAt);
  const clearQueue = usePlayer((s) => s.clearQueue);
  const playQueue = usePlayer((s) => s.playQueue);
  const setLyricsOpen = usePlayer((s) => s.setLyricsOpen);

  const [tab, setTab] = useState<Tab>('queue');
  const { lines } = useLyrics(current?.lrc);
  const lyricRef = useRef<HTMLDivElement>(null);

  const activeIndex = useMemo(() => activeLyricIndex(lines, progress), [lines, progress]);

  useEffect(() => {
    if (tab !== 'lyric' || activeIndex < 0 || !open) return;
    const node = lyricRef.current?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, tab, open]);

  return (
    <aside className={`queue-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="queue-head">
        <div className="queue-tabs">
          <button
            type="button"
            className={`queue-tab ${tab === 'queue' ? 'is-active' : ''}`}
            onClick={() => setTab('queue')}
          >
            播放队列 <em>{queue.length}</em>
          </button>
          <button
            type="button"
            className={`queue-tab ${tab === 'lyric' ? 'is-active' : ''}`}
            onClick={() => setTab('lyric')}
          >
            歌词
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label="关闭" onClick={() => setDrawer(false)}>
          <CloseIcon size={16} />
        </button>
      </div>

      {tab === 'queue' ? (
        <>
          <div className="queue-body">
            {queue.length === 0 ? (
              <p className="queue-empty">播放队列是空的</p>
            ) : (
              queue.map((song, i) => (
                <div key={`${song.id}-${i}`} className={`queue-row ${i === index ? 'is-active' : ''}`}>
                  <button type="button" className="queue-play" onClick={() => playQueue(queue, i)}>
                    <Cover src={song.cover} name={song.name} size={38} radius={6} />
                  </button>
                  <div className="queue-info">
                    <Link className="queue-name" to={`/artist/${encodeURIComponent(song.artist.split('/')[0])}`}>
                      {song.name}
                    </Link>
                    <span className="queue-artist">{song.artist}</span>
                  </div>
                  <span className="queue-duration">{formatTime(song.duration)}</span>
                  <button type="button" className="queue-remove" aria-label="移除" onClick={() => removeAt(i)}>
                    <TrashIcon size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
          {queue.length ? (
            <div className="queue-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearQueue}>
                清空队列
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="lyric-body" ref={lyricRef}>
          <div className="lyric-head">
            {current ? (
              <p className="lyric-title">
                {current.name} - {current.artist}
              </p>
            ) : (
              <p className="lyric-title">暂无播放</p>
            )}
            <button
              type="button"
              className="lyric-expand"
              onClick={() => {
                setDrawer(false);
                setLyricsOpen(true);
              }}
            >
              全屏歌词
            </button>
          </div>
          {lines.length === 0 ? (
            <p className="queue-empty">这首歌暂时没有歌词</p>
          ) : (
            lines.map((line, i) => (
              <p
                key={`${line.time}-${i}`}
                data-line={i}
                className={`lyric-line ${i === activeIndex ? 'is-active' : ''}`}
                onClick={() => usePlayer.getState().seek(line.time)}
              >
                {line.text}
              </p>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
