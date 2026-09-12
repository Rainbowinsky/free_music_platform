import { useEffect } from 'react';
import Cover from './Cover';
import { CloseIcon, PlusIcon } from './Icons';
import { SONG_MAP as STATIC_MAP } from '../data/songs';
import { useSongMap } from '../store/catalog';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';

/** “添加到歌单”弹窗：选择已有歌单或直接新建 */
export default function AddToPlaylistModal() {
  const songId = useUi((s) => s.addSongId);
  const close = useUi((s) => s.closeAddToPlaylist);
  const openPlaylistModal = useUi((s) => s.openPlaylistModal);
  const toast = useUi((s) => s.toast);
  const playlists = useLibrary((s) => s.playlists);
  const addSong = useLibrary((s) => s.addSongToPlaylist);
  const catalogMap = useSongMap();
  const songMap = Object.keys(catalogMap).length ? catalogMap : STATIC_MAP;

  useEffect(() => {
    if (!songId) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [songId, close]);

  if (!songId) return null;
  const song = songMap[songId];

  return (
    <div className="modal-mask" onMouseDown={close} role="presentation">
      <div className="add-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="auth-close" aria-label="关闭" onClick={close}>
          <CloseIcon size={16} />
        </button>

        <h3 className="modal-title">添加到歌单</h3>
        <p className="modal-sub">
          歌曲：<strong>{song ? song.name : '未知歌曲'}</strong>
          {song ? ` - ${song.artist}` : ''}
        </p>

        <div className="add-list">
          {playlists.length === 0 ? (
            <p className="add-empty">还没有歌单，先新建一个吧</p>
          ) : (
            playlists.map((playlist) => {
              const exists = playlist.songIds.includes(songId);
              const first = playlist.songIds.length ? songMap[playlist.songIds[0]] : undefined;
              return (
                <button
                  key={playlist.id}
                  type="button"
                  className="add-row"
                  disabled={exists}
                  onClick={() => {
                    addSong(playlist.id, songId);
                    toast(exists ? '这首歌已经在歌单里了' : `已添加到「${playlist.title}」`);
                    close();
                  }}
                >
                  <Cover
                    src={playlist.cover || first?.cover}
                    name={playlist.title}
                    size={40}
                    radius={7}
                  />
                  <span className="add-info">
                    <span className="add-title">{playlist.title}</span>
                    <span className="add-count">{playlist.songIds.length} 首</span>
                  </span>
                  <span className={`add-state ${exists ? 'is-exists' : ''}`}>{exists ? '已添加' : '添加'}</span>
                </button>
              );
            })
          )}
        </div>

        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() => {
            close();
            openPlaylistModal('create');
          }}
        >
          <PlusIcon size={15} />
          新建歌单
        </button>
      </div>
    </div>
  );
}
