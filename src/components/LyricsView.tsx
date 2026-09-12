import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cover from './Cover';
import PlayerControls, { VolumeControl } from './PlayerControls';
import { ChevronLeftIcon, HeartFilledIcon, HeartIcon, PlusIcon } from './Icons';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useRequireLogin } from '../hooks/useRequireLogin';
import { useLyrics } from '../hooks/useLyrics';
import { activeLyricIndex } from '../utils/lrc';
import { Link } from 'react-router-dom';

/** 全屏歌词页：点击播放条左侧歌曲卡片进入 */
export default function LyricsView() {
  const open = usePlayer((s) => s.lyricsOpen);
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const progress = usePlayer((s) => s.progress);
  const setLyricsOpen = usePlayer((s) => s.setLyricsOpen);
  const seek = usePlayer((s) => s.seek);
  const liked = useLibrary((s) => s.liked);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const openAdd = useUi((s) => s.openAddToPlaylist);
  const guard = useRequireLogin();

  const { lines } = useLyrics(current?.lrc);
  const scrollRef = useRef<HTMLDivElement>(null);
  const manualUntilRef = useRef(0);
  const [manualScrolling, setManualScrolling] = useState(false);

  const activeIndex = useMemo(() => activeLyricIndex(lines, progress), [lines, progress]);
  const isLiked = current ? liked.includes(current.id) : false;

  const close = useCallback(() => {
    // 打开时压入了一条历史记录，关闭时用它保证返回键行为一致
    if (window.history.state && (window.history.state as { qqLyrics?: boolean }).qqLyrics) {
      window.history.back();
    } else {
      setLyricsOpen(false);
    }
  }, [setLyricsOpen]);

  // 打开时接管浏览器返回键，关闭时释放
  useEffect(() => {
    if (!open) return undefined;
    window.history.pushState({ qqLyrics: true }, '');
    const handlePop = () => setLyricsOpen(false);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [open, setLyricsOpen]);

  // 打开时锁定背景滚动
  useEffect(() => {
    document.body.classList.toggle('no-scroll', open);
    return () => document.body.classList.remove('no-scroll');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close]);

  // 歌词自动滚动（用户手动滚动后短暂暂停）
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    if (Date.now() < manualUntilRef.current) return;
    const node = scrollRef.current?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, open]);

  const handleManualScroll = () => {
    manualUntilRef.current = Date.now() + 3200;
    setManualScrolling(true);
    window.setTimeout(() => setManualScrolling(false), 800);
  };

  const artistLink = current ? `/artist/${encodeURIComponent(current.artist.split('/')[0])}` : '/';

  return (
    <section className={`lyrics-view ${open ? 'is-open' : ''} ${isPlaying ? 'is-playing' : ''}`} aria-hidden={!open}>
      <div
        className="lyrics-bg"
        style={current?.cover ? { backgroundImage: `url(${current.cover})` } : undefined}
      />
      <div className="lyrics-mask" />

      <div className="lyrics-inner">
        <header className="lyrics-top">
          <button type="button" className="lyrics-back" aria-label="收起歌词页" onClick={close}>
            <ChevronLeftIcon size={20} />
          </button>
          <div className="lyrics-top-info">
            <span className="lyrics-top-name">{current?.name ?? '暂无播放'}</span>
            <span className="lyrics-top-artist">{current?.artist ?? ''}</span>
          </div>
          <div className="lyrics-top-actions">
            <button
              type="button"
              className={`lyrics-action ${isLiked ? 'is-liked' : ''}`}
              title={isLiked ? '取消喜欢' : '喜欢'}
              disabled={!current}
              onClick={() => current && guard(() => toggleLike(current.id), '登录后即可收藏喜欢的音乐')}
            >
              {isLiked ? <HeartFilledIcon size={19} /> : <HeartIcon size={19} />}
            </button>
            <button
              type="button"
              className="lyrics-action"
              title="添加到歌单"
              disabled={!current}
              onClick={() => current && guard(() => openAdd(current.id), '登录后即可创建、收藏歌单')}
            >
              <PlusIcon size={19} />
            </button>
          </div>
        </header>

        <div className="lyrics-main">
          <div className="lyrics-left">
            <div className="lyrics-disc">
              <span className="lyrics-disc-ring" />
              <div className="lyrics-disc-cover">
                <Cover src={current?.cover} name={current?.name ?? '♪'} size={252} rounded />
              </div>
            </div>
            <div className="lyrics-meta">
              <h2 className="lyrics-meta-name">{current?.name ?? '还没有播放歌曲'}</h2>
              <p className="lyrics-meta-sub">
                {current ? (
                  <>
                    <Link to={artistLink} className="lyrics-meta-link">
                      {current.artist}
                    </Link>
                    {current.album ? <span className="lyrics-meta-album">《{current.album}》</span> : null}
                  </>
                ) : (
                  '从首页挑一首开始吧'
                )}
              </p>
            </div>
          </div>

          <div
            className={`lyrics-scroll ${manualScrolling ? 'is-manual' : ''}`}
            ref={scrollRef}
            onWheel={handleManualScroll}
            onTouchMove={handleManualScroll}
          >
            {current == null ? (
              <p className="lyrics-empty">播放歌曲后这里会显示歌词</p>
            ) : lines.length === 0 ? (
              <p className="lyrics-empty">这首歌暂时没有歌词，静静听吧</p>
            ) : (
              lines.map((line, index) => (
                <p
                  key={`${line.time}-${index}`}
                  data-line={index}
                  className={`lyric-line ${index === activeIndex ? 'is-active' : ''}`}
                  onClick={() => seek(line.time)}
                  title="点击跳转到这一句"
                >
                  {line.text}
                </p>
              ))
            )}
          </div>
        </div>

        <footer className="lyrics-controls">
          <div className="lyrics-controls-side" />
          <PlayerControls />
          <div className="lyrics-controls-side is-right">
            <VolumeControl withQueueCount={false} />
          </div>
        </footer>
      </div>
    </section>
  );
}
