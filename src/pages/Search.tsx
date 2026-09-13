import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
import PlaylistCard from '../components/PlaylistCard';
import Empty from '../components/Empty';
import { SongListSkeleton, ArtistGridSkeleton } from '../components/Skeleton';
import { SONGS as STATIC_SONGS } from '../data/songs';
import { PLAYLISTS } from '../data/playlists';
import { useCatalogLoading, useSongs } from '../store/catalog';
import { store } from '../lib/db';
import { SearchIcon } from '../components/Icons';

type Tab = 'song' | 'playlist' | 'artist';

const HOT_KEYWORDS = ['海阔天空', '起风了', '周杰伦', '许嵩', '五月天', '成都', '治愈', '摇滚'];

export default function Search() {
  const [params] = useSearchParams();
  const keyword = (params.get('q') ?? '').trim();
  const [tab, setTab] = useState<Tab>('song');
  const [history, setHistory] = useState<string[]>(() => store.getSearchHistory());
  const songsInLibrary = useSongs();
  const loading = useCatalogLoading();
  // 曲库还没加载完时先用静态数据兜底，避免首屏搜索为空
  const catalog = songsInLibrary.length ? songsInLibrary : STATIC_SONGS;

  const lower = keyword.toLowerCase();

  const songs = useMemo(
    () =>
      !lower
        ? []
        : catalog.filter((song) =>
            [song.name, song.artist, song.album].some((field) => field.toLowerCase().includes(lower)),
          ),
    [lower, catalog],
  );

  const playlists = useMemo(
    () =>
      !lower
        ? []
        : PLAYLISTS.filter((playlist) =>
            [playlist.title, playlist.creator, playlist.tags.join('')].some((field) =>
              field.toLowerCase().includes(lower),
            ),
          ),
    [lower],
  );

  const artists = useMemo(() => {
    if (!lower) return [];
    const map = new Map<string, { name: string; cover: string; count: number }>();
    for (const song of catalog) {
      if (!song.artist.toLowerCase().includes(lower)) continue;
      const name = song.artist;
      const exist = map.get(name);
      if (exist) exist.count += 1;
      else map.set(name, { name, cover: song.cover, count: 1 });
    }
    return [...map.values()];
  }, [lower, catalog]);

  const hasResult = songs.length + playlists.length + artists.length > 0;

  if (!keyword) {
    return (
      <div className="page search-page">
        <div className="search-panel">
          <h3 className="section-title">热门搜索</h3>
          <div className="keyword-list">
            {HOT_KEYWORDS.map((word) => (
              <Link key={word} className="keyword" to={`/search?q=${encodeURIComponent(word)}`}>
                {word}
              </Link>
            ))}
          </div>
        </div>

        {history.length ? (
          <div className="search-panel">
            <div className="section-head section-head-inline">
              <h3 className="section-title">搜索历史</h3>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  store.clearSearchHistory();
                  setHistory([]);
                }}
              >
                清空
              </button>
            </div>
            <div className="keyword-list">
              {history.map((word) => (
                <Link key={word} className="keyword" to={`/search?q=${encodeURIComponent(word)}`}>
                  {word}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="page search-page">
      <header className="section-head">
        <h3 className="section-title">
          <SearchIcon size={16} /> “{keyword}” 的搜索结果
        </h3>
      </header>

      <div className="tabs">
        <button type="button" className={`tab ${tab === 'song' ? 'is-active' : ''}`} onClick={() => setTab('song')}>
          单曲 <em>{songs.length}</em>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'playlist' ? 'is-active' : ''}`}
          onClick={() => setTab('playlist')}
        >
          歌单 <em>{playlists.length}</em>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'artist' ? 'is-active' : ''}`}
          onClick={() => setTab('artist')}
        >
          歌手 <em>{artists.length}</em>
        </button>
      </div>

      {/* 曲库还在加载时先出骨架，避免先按静态曲库算出一版结果再被接口数据替换 */}
      {loading ? (
        tab === 'song' ? (
          <SongListSkeleton rows={8} />
        ) : (
          <ArtistGridSkeleton count={tab === 'artist' ? 12 : 5} />
        )
      ) : (
        <>
          {!hasResult ? (
            <Empty title={`没有找到与“${keyword}”相关的结果`} desc="换一个关键词试试，比如歌手名或歌名" />
          ) : null}

          {hasResult && tab === 'song' ? (
            songs.length ? (
              <SongList songs={songs} context={songs} />
            ) : (
              <Empty title="没有匹配的单曲" />
            )
          ) : null}

          {hasResult && tab === 'playlist' ? (
            playlists.length ? (
              <div className="playlist-grid">
                {playlists.map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </div>
            ) : (
              <Empty title="没有匹配的歌单" />
            )
          ) : null}

          {hasResult && tab === 'artist' ? (
            artists.length ? (
              <div className="artist-grid">
                {artists.map((artist) => (
                  <Link key={artist.name} className="artist-card" to={`/artist/${encodeURIComponent(artist.name)}`}>
                    <Cover src={artist.cover} name={artist.name} size={128} rounded />
                    <p className="artist-name">{artist.name}</p>
                    <p className="artist-count">{artist.count} 首歌曲</p>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="没有匹配的歌手" />
            )
          ) : null}
        </>
      )}
    </div>
  );
}
