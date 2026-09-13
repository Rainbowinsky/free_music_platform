import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Cover from './Cover';
import { CloseIcon, DragHandleIcon, TrashIcon } from './Icons';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
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
  const moveItem = usePlayer((s) => s.moveItem);
  const setLyricsOpen = usePlayer((s) => s.setLyricsOpen);

  const [tab, setTab] = useState<Tab>('queue');
  const showTranslation = useUi((s) => s.showTranslation);
  const { lines } = useLyrics(current?.lrc);
  const lyricRef = useRef<HTMLDivElement>(null);

  /** 正在被拖动的行下标 */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  /** 当前悬停到的目标行下标（用于显示插入位置提示） */
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /** 行 DOM 引用：拖动时用它做半透明拖影 */
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const activeIndex = useMemo(() => activeLyricIndex(lines, progress), [lines, progress]);

  useEffect(() => {
    if (tab !== 'lyric' || activeIndex < 0 || !open) return;
    const node = lyricRef.current?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, tab, open]);

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

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
                <div
                  key={`${song.id}-${i}`}
                  ref={(node) => {
                    rowRefs.current[i] = node;
                  }}
                  className={[
                    'queue-row',
                    i === index ? 'is-active' : '',
                    dragIndex === i ? 'is-dragging' : '',
                    overIndex === i && dragIndex !== null && dragIndex !== i ? 'is-drop-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onDragOver={(event) => {
                    // 必须 preventDefault 才会触发 drop
                    if (dragIndex === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    if (overIndex !== i) setOverIndex(i);
                  }}
                  onDragLeave={(event) => {
                    // 在行内子元素之间移动时也会触发 dragleave，用 relatedTarget 过滤掉，否则指示线会闪
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    if (overIndex === i) setOverIndex(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = dragIndex;
                    endDrag();
                    if (from === null || from === i) return;
                    moveItem(from, i);
                  }}
                >
                  <span
                    className="queue-handle"
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={`调整《${song.name}》的位置，可拖动或用 Alt 加方向键`}
                    title="拖动排序（也可 Alt + ↑/↓）"
                    onKeyDown={(event) => {
                      // 用 Alt + 方向键做键盘排序，鼠标不可用/不想拖时也能调整顺序。
                      // 全局快捷键遇到 altKey 会直接放行，两边不会打架。
                      if (!event.altKey) return;
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      const target = event.key === 'ArrowUp' ? i - 1 : i + 1;
                      if (target < 0 || target >= queue.length) return;
                      moveItem(i, target);
                      // 焦点跟着挪到新位置，方便连续调整
                      window.setTimeout(() => {
                        rowRefs.current[target]?.querySelector<HTMLElement>('.queue-handle')?.focus();
                      }, 0);
                    }}
                    onDragStart={(event) => {
                      setDragIndex(i);
                      event.dataTransfer.effectAllowed = 'move';
                      // Firefox 必须写入数据才会真正开始拖动
                      event.dataTransfer.setData('text/plain', String(i));
                      const row = rowRefs.current[i];
                      if (row) event.dataTransfer.setDragImage(row, 24, 20);
                    }}
                    onDragEnd={endDrag}
                  >
                    <DragHandleIcon size={14} />
                  </span>
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
              <span className="queue-hint">拖动左侧手柄可调整顺序</span>
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
                className={`lyric-line ${i === activeIndex ? 'is-active' : ''} ${
                  line.translation ? 'has-translation' : ''
                }`}
                onClick={() => usePlayer.getState().seek(line.time)}
              >
                <span className="lyric-text">{line.text}</span>
                {line.translation && showTranslation ? (
                  <span className="lyric-trans">{line.translation}</span>
                ) : null}
              </p>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
