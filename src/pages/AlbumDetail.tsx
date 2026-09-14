import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
import Empty from '../components/Empty';
import { SongListSkeleton } from '../components/Skeleton';
import { usePlayer } from '../store/player';
import { toSongs, type ApiSong } from '../lib/song';
import type { Song } from '../types';
import { PlayIcon } from '../components/Icons';

interface AlbumPayload {
  album: {
    id: number;
    name: string;
    cover: string;
    year: string;
    artistId: number | null;
    artistName: string;
  };
  songs: ApiSong[];
}

type Status = 'loading' | 'ready' | 'notfound' | 'error';

/**
 * 专辑详情页。
 *
 * 专辑信息（封面、年份、曲目归属）本来就由管理台维护，但主站此前没有专辑维度，
 * 管理员整理好的结构用户完全看不到。这里接的是新增的公开读接口 GET /api/library/albums/:id。
 */
export default function AlbumDetail() {
  const { id = '' } = useParams();
  const playQueue = usePlayer((s) => s.playQueue);

  const [data, setData] = useState<AlbumPayload | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!id) {
      setStatus('notfound');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    fetch(`/api/library/albums/${encodeURIComponent(id)}`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus('notfound');
          return null;
        }
        if (!res.ok) throw new Error(`接口返回 ${res.status}`);
        return res.json() as Promise<AlbumPayload>;
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        setData(payload);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const songs: Song[] = useMemo(() => toSongs(data?.songs), [data]);

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
        desc="换一个专辑听听吧"
        action={
          <Link className="btn btn-primary" to="/">
            回到首页
          </Link>
        }
      />
    );
  }

  if (status === 'error' || !data) {
    return (
      <Empty
        title="专辑加载失败"
        desc="请确认后端已启动（npm run server），或稍后重试"
        action={
          <Link className="btn btn-primary" to="/artists">
            去歌手页
          </Link>
        }
      />
    );
  }

  const { album } = data;

  return (
    <div className="page album-detail">
      <header className="detail-head">
        <Cover src={album.cover} name={album.name} size={196} radius={14} className="detail-cover" />
        <div className="detail-info">
          <span className="detail-tag">专辑</span>
          <h2 className="detail-title">{album.name}</h2>
          {album.artistName ? (
            <p className="detail-creator">
              <span className="avatar avatar-sm">{album.artistName.slice(0, 1)}</span>
              <Link className="detail-artist-link" to={`/artist/${encodeURIComponent(album.artistName)}`}>
                {album.artistName}
              </Link>
            </p>
          ) : null}
          <p className="detail-desc">{album.year ? `发行于 ${album.year} 年` : '暂无发行年份'}</p>
          <p className="detail-tags">
            <span className="detail-stat">共 {songs.length} 首</span>
          </p>
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!songs.length}
              onClick={() => playQueue(songs, 0)}
            >
              <PlayIcon size={15} />
              播放全部
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
          <Empty title="这张专辑还没有曲目" desc="去管理台补几首歌吧" />
        )}
      </section>
    </div>
  );
}
