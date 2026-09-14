import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Cover from '../components/Cover';
import SongList from '../components/SongList';
import PlaylistCard from '../components/PlaylistCard';
import AlbumCard from '../components/AlbumCard';
import Empty from '../components/Empty';
import { ArtistGridSkeleton, AlbumGridSkeleton, SongListSkeleton } from '../components/Skeleton';
import { SONGS as STATIC_SONGS } from '../data/songs';
import { useCatalogLoading, useSongs } from '../store/catalog';
import { useFeaturedPlaylistItems } from '../store/featuredPlaylists';
import { store } from '../lib/db';
import { fetchAlbumDetail, fetchAlbums } from '../lib/album';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { primaryArtist } from '../utils/artist';
import { SearchIcon } from '../components/Icons';
import type { Album } from '../types';

type Tab = 'song' | 'artist' | 'album' | 'playlist';

const HOT_KEYWORDS = ['海阔天空', '起风了', '周杰伦', '许嵩', '五月天', '成都', '叶惠美', '摇滚'];

export default function Search() {
  const [params] = useSearchParams();
  const keyword = (params.get('q') ?? '').trim();
  const [tab, setTab] = useState<Tab>('song');
  const [history, setHistory] = useState<string[]>(() => store.getSearchHistory());
  const songsInLibrary = useSongs();
  const loading = useCatalogLoading();
  // 歌单与首页 / 我的收藏共用同一数据源（DB 优先），否则管理台新建的歌单搜不到
  const featuredPlaylists = useFeaturedPlaylistItems();
  const playQueue = usePlayer((s) => s.playQueue);
  const toast = useUi((s) => s.toast);
  // 曲库还没加载完时先用静态数据兜底，避免首屏搜索为空
  const catalog = songsInLibrary.length ? songsInLibrary : STATIC_SONGS;

  /**
   * 后端专辑搜索结果，连同它对应的关键词一起存。
   * 只存结果数组的话，换关键词后新结果到达前会一直显示上一次的专辑，数量也对不上。
   */
  const [apiAlbums, setApiAlbums] = useState<{ keyword: string; items: Album[] } | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [albumFailed, setAlbumFailed] = useState(false);
  const [preparing, setPreparing] = useState<number | null>(null);

  const lower = keyword.toLowerCase();

  // App 只在路径变化时滚动，关键词变化（在同一个搜索页里换了词）由这里自己回到顶部
  useEffect(() => {
    if (keyword) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [keyword]);

  /**
   * 专辑维度走后端接口：专辑名、年份、封面、曲目数都只存在 albums 表里，
   * 拿曲库里的歌在前端聚合是补不出年份和专辑封面的，所以接口失败就如实报错、不伪造数据。
   */
  useEffect(() => {
    if (!keyword) {
      setApiAlbums(null);
      setAlbumFailed(false);
      return undefined;
    }
    let cancelled = false;
    setAlbumLoading(true);
    fetchAlbums({ keyword, size: 60 })
      .then((result) => {
        if (cancelled) return;
        setApiAlbums({ keyword, items: result.items });
        setAlbumFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setApiAlbums(null);
        setAlbumFailed(true);
      })
      .finally(() => {
        if (!cancelled) setAlbumLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keyword]);

  const albums = useMemo<Album[]>(
    // 结果必须和当前关键词对得上，否则换词后新结果到达前会显示上一次的专辑
    () => (apiAlbums && apiAlbums.keyword === keyword ? apiAlbums.items : []),
    [apiAlbums, keyword],
  );

  const playAlbum = async (album: Album) => {
    if (preparing !== null) return;
    setPreparing(album.id);
    try {
      const result = await fetchAlbumDetail(album.id);
      if (result.status !== 'ready' || !result.data?.songs.length) {
        toast(result.status === 'error' ? '曲目加载失败，请确认后端已启动' : `《${album.name}》还没有曲目`);
        return;
      }
      const queue = result.data.songs;
      const start = queue.findIndex((song) => song.playable !== false && song.src);
      if (start < 0) {
        toast(`《${album.name}》暂无可用音源`);
        return;
      }
      playQueue(queue, start);
    } finally {
      setPreparing(null);
    }
  };

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
        : featuredPlaylists.filter((playlist) =>
            [playlist.title, playlist.creator, playlist.tags.join('')].some((field) =>
              field.toLowerCase().includes(lower),
            ),
          ),
    [lower, featuredPlaylists],
  );

  /**
   * 歌手维度按「主歌手」聚合。
   * 用完整歌手串（如「周杰伦/阿信」）当歌手名会生成一个不存在的歌手页，
   * 点进去是空的；按主歌手聚合才能保证每张卡片都有内容。
   */
  const artists = useMemo(() => {
    if (!lower) return [];
    const map = new Map<string, { name: string; cover: string; count: number }>();
    for (const song of catalog) {
      const name = primaryArtist(song.artist);
      if (!name.toLowerCase().includes(lower)) continue;
      const exist = map.get(name);
      if (exist) exist.count += 1;
      else map.set(name, { name, cover: song.cover, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [lower, catalog]);

  const hasResult = songs.length + playlists.length + artists.length + albums.length > 0;

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
          className={`tab ${tab === 'artist' ? 'is-active' : ''}`}
          onClick={() => setTab('artist')}
        >
          歌手 <em>{artists.length}</em>
        </button>
        <button type="button" className={`tab ${tab === 'album' ? 'is-active' : ''}`} onClick={() => setTab('album')}>
          专辑 <em>{albums.length}</em>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'playlist' ? 'is-active' : ''}`}
          onClick={() => setTab('playlist')}
        >
          歌单 <em>{playlists.length}</em>
        </button>
      </div>

      {/* 曲库还在加载时先出骨架，避免先按静态曲库算出一版结果再被接口数据替换 */}
      {loading ? (
        tab === 'song' ? (
          <SongListSkeleton rows={8} />
        ) : tab === 'album' || tab === 'playlist' ? (
          <AlbumGridSkeleton count={12} />
        ) : (
          <ArtistGridSkeleton count={12} />
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

          {hasResult && tab === 'album' ? (
            albums.length ? (
              <div className="album-grid">
                {albums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    onPlay={() => void playAlbum(album)}
                    playLoading={preparing === album.id}
                  />
                ))}
              </div>
            ) : albumLoading ? (
              <AlbumGridSkeleton count={12} />
            ) : albumFailed ? (
              <Empty title="专辑搜索暂时不可用" desc="请确认后端已启动（npm run server），然后刷新本页" />
            ) : (
              <Empty title="没有匹配的专辑" />
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
