import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
import AlbumCard from '../components/AlbumCard';
import Empty from '../components/Empty';
import { SongListSkeleton } from '../components/Skeleton';
import { HeartFilledIcon, HeartIcon, PlayIcon } from '../components/Icons';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useRequireLogin } from '../hooks/useRequireLogin';
import { albumKind, fetchAlbumDetail, type AlbumDetailPayload, type AlbumDetailStatus } from '../lib/album';
import { formatTotalDuration } from '../utils/format';
import { primaryArtist } from '../utils/artist';

/**
 * 专辑详情页。
 *
 * 专辑信息（封面、年份、曲目归属）本来就由管理台维护，但主站此前没有专辑维度，
 * 管理员整理好的结构用户完全看不到。这里接的是公开读接口 GET /api/library/albums/:id，
 * 并补上同歌手其他专辑 —— 否则看完一张专辑没有出口，页面就是座孤岛。
 */
export default function AlbumDetail() {
  const { id = '' } = useParams();
  const playQueue = usePlayer((s) => s.playQueue);
  const collectedAlbums = useLibrary((s) => s.collectedAlbums);
  const toggleCollectAlbum = useLibrary((s) => s.toggleCollectAlbum);
  const toast = useUi((s) => s.toast);
  const guard = useRequireLogin();

  const [data, setData] = useState<AlbumDetailPayload | null>(null);
  const [status, setStatus] = useState<AlbumDetailStatus>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setStatus('notfound');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    void fetchAlbumDetail(id).then((result) => {
      if (cancelled) return;
      if (result.status === 'ready' && result.data) {
        setData(result.data);
        setStatus('ready');
        return;
      }
      setError(result.error ?? '');
      setStatus(result.status);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const songs = useMemo(() => data?.songs ?? [], [data]);

  if (status === 'loading') {
    return (
      <div className="page">
        <header className="section-head">
          <h3 className="section-title">专辑</h3>
          <span className="section-sub">正在加载…</span>
        </header>
        <SongListSkeleton rows={6} />
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <Empty
        title="专辑不存在或已被删除"
        desc="换一张专辑听听吧"
        action={
          <Link className="btn btn-primary" to="/albums">
            全部专辑
          </Link>
        }
      />
    );
  }

  if (status === 'error' || !data) {
    return (
      <Empty
        title="专辑加载失败"
        desc={error || '请确认后端已启动（npm run server），或稍后重试'}
        action={
          <Link className="btn btn-primary" to="/albums">
            去专辑页
          </Link>
        }
      />
    );
  }

  const { album, related } = data;
  const artist = primaryArtist(album.artistName);
  const kind = albumKind(album.songCount);
  const isCollected = collectedAlbums.includes(String(album.id));
  const unplayable = album.songCount - album.playableCount;

  /** 专辑页的元信息：年份 · 类型 · 曲目数 · 总时长，缺项自动跳过 */
  const meta = [
    album.year ? `${album.year} 年发行` : '发行年份未知',
    kind,
    `共 ${album.songCount} 首`,
    album.totalDuration ? formatTotalDuration(album.totalDuration) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const firstPlayable = songs.findIndex((song) => song.playable !== false && song.src);

  return (
    <div className="page album-detail">
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/albums">专辑</Link>
        <span className="breadcrumb-sep">/</span>
        {artist ? (
          <>
            <Link to={`/artist/${encodeURIComponent(artist)}`}>{album.artistName}</Link>
            <span className="breadcrumb-sep">/</span>
          </>
        ) : null}
        <span className="breadcrumb-current">{album.name}</span>
      </nav>

      <header className="detail-head">
        <Cover src={album.cover} name={album.name} size={196} radius={14} className="detail-cover" />
        <div className="detail-info">
          <span className="detail-tag">专辑</span>
          <h2 className="detail-title">{album.name}</h2>
          {album.artistName ? (
            <p className="detail-creator">
              <span className="avatar avatar-sm">{artist.slice(0, 1)}</span>
              <Link className="detail-artist-link" to={`/artist/${encodeURIComponent(artist)}`}>
                {album.artistName}
              </Link>
            </p>
          ) : null}
          <p className="detail-desc">{meta}</p>
          {unplayable > 0 ? (
            <p className="detail-desc album-hint">
              其中 {unplayable} 首暂无可用音源，可点击行内的「官方收听」跳转
            </p>
          ) : null}
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!songs.length || firstPlayable < 0}
              onClick={() => playQueue(songs, firstPlayable < 0 ? 0 : firstPlayable)}
            >
              <PlayIcon size={15} />
              播放全部
            </button>
            <button
              type="button"
              className={`btn btn-outline ${isCollected ? 'is-collected' : ''}`}
              onClick={() =>
                guard(async () => {
                  await toggleCollectAlbum(String(album.id));
                  toast(isCollected ? '已取消收藏这张专辑' : '已收藏这张专辑');
                }, '登录后即可收藏专辑，换设备也在')
              }
            >
              {isCollected ? <HeartFilledIcon size={15} /> : <HeartIcon size={15} />}
              {isCollected ? '已收藏' : '收藏专辑'}
            </button>
          </div>
        </div>
      </header>

      <section className="section">
        <header className="section-head">
          <h3 className="section-title">歌曲列表</h3>
          <span className="section-sub">{songs.length} 首</span>
        </header>
        {songs.length ? (
          <SongList songs={songs} context={songs} showAlbum={false} />
        ) : (
          <Empty title="这张专辑还没有曲目" desc="去曲库管理台补几首歌吧" />
        )}
      </section>

      {related.length ? (
        <section className="section">
          <header className="section-head">
            <h3 className="section-title">更多来自 {album.artistName}</h3>
            <Link className="section-more" to={`/artist/${encodeURIComponent(artist)}`}>
              查看歌手 ›
            </Link>
          </header>
          <div className="album-grid">
            {related.map((item) => (
              <AlbumCard key={item.id} album={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
