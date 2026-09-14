/**
 * 加载骨架屏
 *
 * 曲库从接口返回前列表是空的，直接渲染会出现「空白一闪」再突然填满。
 * 这里用与真实内容同构的占位块（复用 songlist / artist-grid / playlist-grid 的网格类），
 * 保证骨架和真实内容的行高、列宽完全对齐，切换时不跳动。
 *
 * 全部标记为 aria-hidden：屏幕阅读器不需要读占位方块。
 */

interface SongListSkeletonProps {
  rows?: number;
  showAlbum?: boolean;
  showCover?: boolean;
}

/** 歌曲列表骨架，列宽与 SongList 保持一致 */
export function SongListSkeleton({ rows = 8, showAlbum = true, showCover = true }: SongListSkeletonProps) {
  return (
    <div
      className={`songlist skeleton ${showAlbum ? '' : 'no-album'} ${showCover ? '' : 'no-cover'}`}
      aria-hidden="true"
    >
      <div className="songlist-head">
        <span className="col-index">#</span>
        <span className="col-title">音乐标题</span>
        <span className="col-artist">歌手</span>
        {showAlbum ? <span className="col-album">专辑</span> : null}
        <span className="col-duration">时长</span>
      </div>

      {Array.from({ length: rows }, (_, i) => (
        <div className="song-row skeleton-row" key={i}>
          <span className="col-index">
            <span className="sk sk-no" />
          </span>
          <span className="col-title">
            {showCover ? <span className="sk sk-cover" /> : null}
            {/* 宽度按行错开，比整齐等宽更像真实数据 */}
            <span className="sk sk-line" style={{ width: `${48 + ((i * 17) % 34)}%` }} />
          </span>
          <span className="col-artist">
            <span className="sk sk-line" style={{ width: `${44 + ((i * 11) % 28)}%` }} />
          </span>
          {showAlbum ? (
            <span className="col-album">
              <span className="sk sk-line" style={{ width: `${52 + ((i * 7) % 26)}%` }} />
            </span>
          ) : null}
          <span className="col-duration">
            <span className="sk sk-line sk-duration" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** 歌手网格骨架 */
export function ArtistGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="artist-grid skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="artist-card skeleton-card" key={i}>
          <span className="sk sk-avatar" />
          <span className="sk sk-line" style={{ width: `${46 + ((i * 13) % 24)}%` }} />
          <span className="sk sk-line sk-sm" style={{ width: `${30 + ((i * 9) % 18)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** 专辑网格骨架（与 AlbumCard 的排版同构：正方形封面 + 两行文字） */
export function AlbumGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="album-grid skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="album-card skeleton-card" key={i}>
          <span className="sk sk-square" />
          <span className="sk sk-line" style={{ width: `${58 + ((i * 11) % 26)}%` }} />
          <span className="sk sk-line sk-sm" style={{ width: `${34 + ((i * 7) % 20)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** 歌单网格骨架 */
export function PlaylistGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="playlist-grid skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <span className="sk sk-square" />
          <span className="sk sk-line" style={{ width: `${64 + ((i * 11) % 28)}%` }} />
          <span className="sk sk-line sk-sm" style={{ width: `${38 + ((i * 7) % 20)}%` }} />
        </div>
      ))}
    </div>
  );
}
