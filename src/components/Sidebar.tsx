import { NavLink } from 'react-router-dom';
import { PLAYLISTS } from '../data/playlists';
import { useSongMap } from '../store/catalog';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useRequireLogin } from '../hooks/useRequireLogin';
import Cover from './Cover';
import {
  ClockIcon,
  HeartFilledIcon,
  ListIcon,
  MusicNoteIcon,
  PlusIcon,
  SettingsIcon,
} from './Icons';

const NAV_GROUPS = [
  {
    title: '推荐',
    items: [
      { to: '/', label: '发现音乐', icon: <MusicNoteIcon size={17} />, end: true },
      { to: '/ranking', label: '排行榜', icon: <ListIcon size={17} />, end: false },
      { to: '/artists', label: '歌手', icon: <MusicNoteIcon size={17} />, end: false },
    ],
  },
  {
    title: '我的音乐',
    items: [
      { to: '/likes', label: '我喜欢', icon: <HeartFilledIcon size={17} />, end: false },
      { to: '/collection', label: '我的收藏', icon: <ListIcon size={17} />, end: false },
      { to: '/recent', label: '最近播放', icon: <ClockIcon size={17} />, end: false },
    ],
  },
];

export default function Sidebar() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);
  const collected = useLibrary((s) => s.collected);
  const playlists = useLibrary((s) => s.playlists);
  const openPlaylistModal = useUi((s) => s.openPlaylistModal);
  const guard = useRequireLogin();
  const songMap = useSongMap();
  const collectedPlaylists = PLAYLISTS.filter((p) => collected.includes(p.id));

  return (
    <aside className="sidebar">
      {NAV_GROUPS.map((group) => (
        <div className="side-group" key={group.title}>
          <p className="side-title">{group.title}</p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `side-link ${isActive ? 'is-active' : ''}`}
            >
              <span className="side-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="side-group">
        <p className="side-title">
          我的歌单
          <button
            type="button"
            className="side-add"
            aria-label="新建歌单"
            title="新建歌单"
            onClick={() => guard(() => openPlaylistModal('create'), '登录后即可创建属于自己的歌单')}
          >
            <PlusIcon size={14} />
          </button>
        </p>
        {playlists.length ? (
          playlists.map((playlist) => {
            const first = playlist.songIds.length ? songMap[playlist.songIds[0]] : undefined;
            return (
              <NavLink
                key={playlist.id}
                to={`/playlist/${playlist.id}`}
                className={({ isActive }) => `side-link side-link-playlist ${isActive ? 'is-active' : ''}`}
              >
                <Cover src={playlist.cover || first?.cover} name={playlist.title} size={22} radius={4} />
                <span className="side-playlist-name">{playlist.title}</span>
              </NavLink>
            );
          })
        ) : (
          <p className="side-hint">
            {user ? '点击右上角 + 创建你的第一个歌单' : '登录后可创建自己的歌单'}
          </p>
        )}
      </div>

      <div className="side-group">
        <p className="side-title">收藏的歌单</p>
        {collectedPlaylists.length ? (
          collectedPlaylists.map((playlist) => (
            <NavLink
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              className={({ isActive }) => `side-link side-link-playlist ${isActive ? 'is-active' : ''}`}
            >
              <Cover src={playlist.cover} name={playlist.title} size={22} radius={4} />
              <span className="side-playlist-name">{playlist.title}</span>
            </NavLink>
          ))
        ) : (
          <p className="side-hint">
            {user ? '去首页收藏喜欢的歌单吧' : '登录后同步你的收藏'}
          </p>
        )}
      </div>

      {!user ? (
        <button type="button" className="side-login" onClick={() => openModal('登录后即可收藏音乐、创建歌单')}>
          登录 / 注册
        </button>
      ) : null}

      <div className="side-group side-admin-group">
        <NavLink to="/admin" className="side-admin">
          <SettingsIcon size={15} />
          曲库管理台
          <span className="side-admin-arrow">→</span>
        </NavLink>
      </div>
    </aside>
  );
}
