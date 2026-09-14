import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Empty from '../components/Empty';
import Cover from '../components/Cover';
import { useAuth } from '../store/auth';
import { useSongMap } from '../store/catalog';
import { usePlayer } from '../store/player';
import { MeError, meApi, store, type PlayStats } from '../lib/db';
import { formatTotalDuration } from '../utils/format';
import { primaryArtist } from '../utils/artist';
import { PlayIcon } from '../components/Icons';

/** 可选的趋势窗口 */
const RANGES = [
  { days: 14, label: '近 14 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
];

export default function Stats() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);
  const songMap = useSongMap();
  const playQueue = usePlayer((s) => s.playQueue);

  const [days, setDays] = useState(14);
  const [stats, setStats] = useState<PlayStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setStats(null);
      return undefined;
    }
    const token = store.getToken();
    if (!token) return undefined;

    let cancelled = false;
    setLoading(true);
    meApi
      .stats(token, days)
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof MeError ? err.message : '统计加载失败，请稍后重试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, days]);

  const overview = stats?.overview;

  /** 时段分布里播放最多的那一小时 */
  const peakHour = useMemo(() => {
    if (!stats) return null;
    const best = stats.byHour.reduce((a, b) => (b.plays > a.plays ? b : a), stats.byHour[0]);
    return best && best.plays > 0 ? best : null;
  }, [stats]);

  /** 趋势图里最近 N 天的最大值，用于算柱子高度 */
  const dayMax = useMemo(() => {
    if (!stats) return 0;
    return stats.byDay.reduce((max, d) => Math.max(max, d.plays), 0);
  }, [stats]);

  const artistMax = useMemo(() => {
    if (!stats) return 0;
    return stats.topArtists.reduce((max, a) => Math.max(max, a.plays), 0);
  }, [stats]);

  const songMax = useMemo(() => {
    if (!stats) return 0;
    return stats.topSongs.reduce((max, s) => Math.max(max, s.plays), 0);
  }, [stats]);

  if (!user) {
    return (
      <Empty
        icon="🔒"
        title="登录后查看听歌统计"
        desc="播放记录会跟随账号同步，帮你回顾最常听的歌手和歌曲"
        action={
          <button type="button" className="btn btn-primary" onClick={() => openModal('登录后即可查看听歌统计')}>
            立即登录
          </button>
        }
      />
    );
  }

  return (
    <div className="page">
      <header className="section-head">
        <h3 className="section-title">听歌统计</h3>
        <span className="section-sub">
          {overview && overview.firstPlayedAt
            ? `自 ${new Date(overview.firstPlayedAt).toLocaleDateString('zh-CN')} 起累计`
            : '按账号记录'}
        </span>
      </header>

      {error ? <div className="stats-error">{error}</div> : null}

      {loading && !stats ? <div className="stats-loading">正在统计…</div> : null}

      {!loading && stats && overview && overview.totalPlays === 0 ? (
        <Empty
          title="还没有听歌记录"
          desc="播放任意一首歌并听满 30 秒，这里就会开始记录"
          action={
            <Link className="btn btn-primary" to="/">
              去听点什么
            </Link>
          }
        />
      ) : null}

      {stats && overview && overview.totalPlays > 0 ? (
        <>
          {/* ── 总览 ── */}
          <section className="stats-cards">
            <div className="stats-card">
              <span className="stats-card-label">总播放次数</span>
              <strong className="stats-card-value">{overview.totalPlays}</strong>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">累计时长</span>
              <strong className="stats-card-value">{formatTotalDuration(overview.totalSeconds)}</strong>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">听过的歌曲</span>
              <strong className="stats-card-value">{overview.distinctSongs}</strong>
            </div>
            <div className="stats-card">
              <span className="stats-card-label">听过的歌手</span>
              <strong className="stats-card-value">{overview.distinctArtists}</strong>
            </div>
          </section>

          {peakHour ? (
            <p className="stats-insight">
              你最常在 <strong>{peakHour.hour}:00 - {peakHour.hour + 1}:00</strong> 听歌，这个时段共播放了{' '}
              <strong>{peakHour.plays}</strong> 次
            </p>
          ) : null}

          {/* ── 最常听的歌手 ── */}
          {stats.topArtists.length ? (
            <section className="section">
              <header className="section-head">
                <h3 className="section-title">最常听的歌手</h3>
              </header>
              <div className="stats-bars">
                {stats.topArtists.map((item) => (
                  <Link
                    key={item.artist}
                    className="stats-bar-row"
                    to={`/artist/${encodeURIComponent(primaryArtist(item.artist))}`}
                  >
                    <span className="stats-bar-name" title={item.artist}>
                      {item.artist}
                    </span>
                    <span className="stats-bar-track">
                      <span
                        className="stats-bar-fill"
                        style={{ width: `${artistMax ? Math.max(4, (item.plays / artistMax) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="stats-bar-value">{item.plays} 次</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── 最常听的歌曲 ── */}
          {stats.topSongs.length ? (
            <section className="section">
              <header className="section-head">
                <h3 className="section-title">最常听的歌曲</h3>
                <span className="section-sub">播放次数最多的 10 首</span>
              </header>
              <div className="stats-songs">
                {stats.topSongs.map((item, index) => {
                  const song = songMap[item.songId];
                  return (
                    <div className="stats-song" key={item.songId}>
                      <span className={`stats-song-no ${index < 3 ? 'is-top' : ''}`}>{index + 1}</span>
                      <Cover src={song?.cover} name={item.title || '♪'} size={40} radius={6} />
                      <span className="stats-song-info">
                        <span className="stats-song-title" title={item.title}>
                          {item.title || '未知歌曲'}
                        </span>
                        <span className="stats-song-artist">{item.artist || '未知歌手'}</span>
                      </span>
                      <span className="stats-song-bar">
                        <span
                          className="stats-bar-fill"
                          style={{ width: `${songMax ? Math.max(4, (item.plays / songMax) * 100) : 0}%` }}
                        />
                      </span>
                      <span className="stats-song-plays">{item.plays} 次</span>
                      {song ? (
                        <button
                          type="button"
                          className="stats-song-play"
                          title={`播放《${song.name}》`}
                          aria-label={`播放 ${song.name}`}
                          onClick={() => playQueue([song], 0)}
                        >
                          <PlayIcon size={15} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ── 听歌时段 ── */}
          <section className="section">
            <header className="section-head">
              <h3 className="section-title">听歌时段</h3>
              <span className="section-sub">按 24 小时分布</span>
            </header>
            <div className="stats-hours" role="img" aria-label="24 小时听歌次数分布">
              {stats.byHour.map((item) => {
                const max = Math.max(...stats.byHour.map((h) => h.plays), 1);
                return (
                  <span className="stats-hour" key={item.hour} title={`${item.hour}:00 播放 ${item.plays} 次`}>
                    <span
                      className={`stats-hour-bar ${item.plays ? '' : 'is-empty'}`}
                      style={{ height: `${item.plays ? Math.max(6, (item.plays / max) * 100) : 2}%` }}
                    />
                    {item.hour % 3 === 0 ? <span className="stats-hour-label">{item.hour}</span> : null}
                  </span>
                );
              })}
            </div>
          </section>

          {/* ── 播放趋势 ── */}
          <section className="section">
            <header className="section-head">
              <h3 className="section-title">播放趋势</h3>
              <div className="stats-ranges">
                {RANGES.map((range) => (
                  <button
                    key={range.days}
                    type="button"
                    className={`stats-range ${days === range.days ? 'is-active' : ''}`}
                    onClick={() => setDays(range.days)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="stats-trend" role="img" aria-label={`最近 ${days} 天每日播放次数`}>
              {stats.byDay.map((item) => (
                <span
                  className="stats-trend-col"
                  key={item.date}
                  title={`${item.date} 播放 ${item.plays} 次`}
                >
                  <span
                    className={`stats-trend-bar ${item.plays ? '' : 'is-empty'}`}
                    style={{ height: `${item.plays && dayMax ? Math.max(4, (item.plays / dayMax) * 100) : 2}%` }}
                  />
                </span>
              ))}
            </div>
            <p className="stats-trend-legend">
              {stats.byDay[0]?.date} → {stats.byDay[stats.byDay.length - 1]?.date}
            </p>
          </section>

          <p className="stats-note">
            单首歌连续听满 30 秒（或半首歌）才计为一次播放，拖动进度条跳过的部分不计入。
          </p>
        </>
      ) : null}
    </div>
  );
}
