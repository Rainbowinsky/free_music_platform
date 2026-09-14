import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AlbumCard from '../components/AlbumCard';
import Empty from '../components/Empty';
import Select from '../components/Select';
import { AlbumGridSkeleton } from '../components/Skeleton';
import { CloseIcon, SearchIcon } from '../components/Icons';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import {
  ALBUM_SORTS,
  fetchAlbumDetail,
  fetchAlbums,
  isAlbumSort,
  type AlbumSort,
} from '../lib/album';
import type { Album } from '../types';

/** 一次拉多少张；与后端 size 上限（120）留出余量 */
const PAGE_SIZE = 36;

/** 错峰入场时最多错开多少张，避免列表一长末尾的卡片迟迟不出现 */
const STAGGER_CAP = 12;

type Status = 'loading' | 'ready' | 'more';

/**
 * 专辑库页。
 *
 * 筛选条件全部落在 URL 上（?q=&sort=&artist=），这样专辑页可以被分享 / 刷新后保持状态。
 * `artist` 参数没有界面入口（歌手筛选下拉已移除——歌手一多下拉面板会失控），
 * 但歌手页的「全部专辑」链接仍会带着它跳过来，这里用一个可关闭的标签呈现。
 *
 * 过渡动画的取舍：
 *   - 切换排序/搜索时**不闪骨架屏**，旧内容压低透明度表示「刷新中」，新数据到达后
 *     整组卡片错峰淡入 —— 直接替换是造成「页面跳一下」的主要原因。
 *   - 骨架屏只在首次进入（还没有任何内容）时出现。
 */
export default function Albums() {
  const [params, setParams] = useSearchParams();
  const keyword = (params.get('q') ?? '').trim();
  const rawSort = params.get('sort') ?? '';
  const sort: AlbumSort = isAlbumSort(rawSort) ? rawSort : 'all';
  const artist = params.get('artist') ?? '';

  const playQueue = usePlayer((s) => s.playQueue);
  const toast = useUi((s) => s.toast);

  /** 输入框内容（搜索防抖后再写回 URL，避免每敲一个字都进历史栈） */
  const [term, setTerm] = useState(keyword);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Album[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  /** 正在拉曲目准备播放的专辑 id */
  const [preparing, setPreparing] = useState<number | null>(null);
  /**
   * 已展示结果的「版本号」。首页数据到达时 +1，作为网格的 key 触发整体重挂载，
   * 错峰入场动画才会在新内容上重放；加载更多时保持不变，旧卡片不会重放动画。
   */
  const [resultVersion, setResultVersion] = useState(0);

  /** 记录「URL 里最新的 q 是不是自己写进去的」，用于区分外部跳转与自身输入 */
  const echoRef = useRef(keyword);
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  /** 合并式更新查询参数（空值即删除），同时回到第一页 */
  const patchParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(paramsRef.current);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setPage(1);
    setParams(next, { replace: true });
  };

  // 外部（歌手页、搜索结果）跳进来时把 URL 的 q 同步到输入框；
  // 自己敲字引起的 URL 变化不回填，否则光标位置会被打断。
  useEffect(() => {
    if (keyword === echoRef.current) return;
    echoRef.current = keyword;
    setTerm(keyword);
  }, [keyword]);

  // 输入防抖：320ms 无输入再写回 URL
  useEffect(() => {
    if (term === keyword) return undefined;
    const timer = window.setTimeout(() => {
      echoRef.current = term;
      patchParams({ q: term });
    }, 320);
    return () => window.clearTimeout(timer);
    // patchParams 依赖 paramsRef / setParams，两者都稳定，不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, keyword]);

  useEffect(() => {
    let cancelled = false;
    setStatus(page === 1 ? 'loading' : 'more');
    fetchAlbums({ keyword, sort, artist, page, size: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
        if (page === 1) setResultVersion((v) => v + 1);
        setTotal(result.total);
        setNotice('');
        setFailed(false);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        // 专辑的封面、年份、曲目数只存在后端 albums 表里，前端拿曲库里的歌是补不出来的，
        // 所以这里不去伪造一份数据，而是明确告诉用户后端不可用。
        if (page === 1) {
          setItems([]);
          setTotal(0);
        }
        setFailed(true);
        setNotice('曲库接口暂时不可用，请确认后端已启动（npm run server）后刷新本页');
        setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [keyword, sort, artist, page]);

  /** 播放整张专辑：曲目要现拉，所以先取详情再交给播放器 */
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

  const hasFilter = Boolean(keyword || artist);
  /** 首次进入才出骨架屏；之后换条件只把旧内容压暗，避免整块替换造成跳动感 */
  const showSkeleton = status === 'loading' && !items.length;
  const refreshing = status === 'loading' && items.length > 0;

  return (
    <div className="page albums-page">
      <header className="section-head">
        <h3 className="section-title">专辑</h3>
        <span className="section-sub">
          {showSkeleton
            ? '正在加载…'
            : refreshing
              ? '刷新中…'
              : hasFilter
                ? `筛选出 ${total} 张`
                : `共 ${total} 张专辑`}
        </span>
      </header>

      <div className="album-toolbar">
        <form
          className="album-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            echoRef.current = term;
            patchParams({ q: term });
          }}
        >
          <SearchIcon size={16} className="album-search-icon" />
          <input
            className="album-search-input"
            value={term}
            placeholder="搜索专辑名或歌手名"
            aria-label="搜索专辑"
            onChange={(event) => setTerm(event.target.value)}
          />
          {term ? (
            <button
              type="button"
              className="album-search-clear"
              aria-label="清空"
              onClick={() => {
                setTerm('');
                echoRef.current = '';
                patchParams({ q: '' });
              }}
            >
              <CloseIcon size={13} />
            </button>
          ) : null}
        </form>

        <Select
          prefix="排序"
          ariaLabel="专辑排序方式"
          value={sort}
          options={ALBUM_SORTS.map((option) => ({ value: option.value, label: option.label, tag: option.tag }))}
          onChange={(value) => patchParams({ sort: value === 'all' ? '' : value })}
        />

        {artist ? (
          <button
            type="button"
            className="album-filter-tag"
            title="取消歌手筛选"
            onClick={() => patchParams({ artist: '' })}
          >
            歌手：{artist}
            <CloseIcon size={12} />
          </button>
        ) : null}

        {hasFilter ? (
          <button
            type="button"
            className="link-btn album-reset"
            onClick={() => {
              setTerm('');
              echoRef.current = '';
              setPage(1);
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            重置筛选
          </button>
        ) : null}
      </div>

      {notice ? <p className="page-tip">{notice}</p> : null}

      {showSkeleton ? (
        <AlbumGridSkeleton count={12} />
      ) : items.length ? (
        <>
          <div className={`album-grid ${refreshing ? 'is-refreshing' : ''}`} key={resultVersion}>
            {items.map((album, index) => (
              // 错峰入场：新挂载的卡片按序号依次淡入；已挂载的（加载更多前的旧卡片）不重放
              <div
                className="album-anim"
                style={{ animationDelay: `${Math.min(index, STAGGER_CAP) * 22}ms` }}
                key={album.id}
              >
                <AlbumCard album={album} onPlay={() => void playAlbum(album)} playLoading={preparing === album.id} />
              </div>
            ))}
          </div>
          {items.length < total ? (
            <div className="album-more">
              <button
                type="button"
                className="btn btn-outline"
                disabled={status === 'more'}
                onClick={() => setPage((current) => current + 1)}
              >
                {status === 'more' ? '加载中…' : `加载更多（还有 ${total - items.length} 张）`}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <Empty
          title={failed ? '专辑加载失败' : hasFilter ? '没有找到符合条件的专辑' : '曲库里还没有专辑'}
          desc={
            failed
              ? '请确认后端已启动（npm run server），然后刷新本页'
              : hasFilter
                ? '换个关键词，或把筛选条件重置一下'
                : '去曲库管理台搜歌入库，专辑会自动归档'
          }
        />
      )}
    </div>
  );
}
