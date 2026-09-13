import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useTheme, type ThemeMode } from '../store/theme';
import { useSongs } from '../store/catalog';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { store } from '../lib/db';
import { adminAuth } from '../lib/adminApi';
import type { Song } from '../types';
import Cover from './Cover';
import {
  AutoThemeIcon,
  CheckIcon,
  CloseIcon,
  MoonIcon,
  MusicNoteIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
} from './Icons';

const NAV = [
  { to: '/', label: '发现音乐', end: true },
  { to: '/likes', label: '我的音乐', end: false },
  { to: '/collection', label: '我的收藏', end: false },
  { to: '/artists', label: '歌手', end: false },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: JSX.Element }[] = [
  { value: 'light', label: '浅色模式', icon: <SunIcon size={16} /> },
  { value: 'dark', label: '深色模式', icon: <MoonIcon size={16} /> },
  { value: 'system', label: '跟随系统', icon: <AutoThemeIcon size={16} /> },
];

/** 最多展示几条联想 */
const SUGGEST_LIMIT = 8;

/** 命中关键词的部分染上主题色；没命中（例如按歌手匹配到的歌名）原样返回 */
function highlight(text: string, keyword: string): JSX.Element {
  const idx = text.toLowerCase().indexOf(keyword);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + keyword.length)}</mark>
      {text.slice(idx + keyword.length)}
    </>
  );
}

export default function TopBar() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);
  const logout = useAuth((s) => s.logout);
  const themeMode = useTheme((s) => s.mode);
  const resolvedTheme = useTheme((s) => s.resolved);
  const setThemeMode = useTheme((s) => s.setMode);
  const navigate = useNavigate();
  const location = useLocation();
  const allSongs = useSongs();
  const playSong = usePlayer((s) => s.playSong);
  const toast = useUi((s) => s.toast);
  const [keyword, setKeyword] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [sugOpen, setSugOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLFormElement>(null);
  // 已经在浏览器里登录过管理台（localStorage 有 JWT）时可以直达；
  // 主站账号如果是 admin 角色（与管理台共用 users 表）也一并算作「可进管理台」
  const [adminUser] = useState(() => adminAuth.getUser());
  const canAdmin = Boolean(adminUser) || user?.role === 'admin';

  const query = keyword.trim().toLowerCase();

  /** 实时联想：曲库在前端内存里，直接过滤，零后端请求 */
  const suggestions = useMemo<Song[]>(() => {
    if (!query) return [];
    const picked: Song[] = [];
    for (const song of allSongs) {
      if (
        song.name.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.album.toLowerCase().includes(query)
      ) {
        picked.push(song);
        if (picked.length >= SUGGEST_LIMIT) break;
      }
    }
    return picked;
  }, [query, allSongs]);

  useEffect(() => {
    if (location.pathname === '/search') {
      const params = new URLSearchParams(location.search);
      setKeyword(params.get('q') ?? '');
    }
    // 路由变化时收起联想，避免跨页还挂着
    setSugOpen(false);
    setActiveIdx(-1);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (themeRef.current && !themeRef.current.contains(target)) setThemeOpen(false);
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSugOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

  const closeSug = () => {
    setSugOpen(false);
    setActiveIdx(-1);
  };

  const handleChange = (value: string) => {
    setKeyword(value);
    setActiveIdx(-1);
    setSugOpen(Boolean(value.trim()));
  };

  /** 点联想项直接开播（上下文用当前联想列表，后续 next/prev 顺着它走） */
  const playSuggestion = (song: Song) => {
    closeSug();
    if (song.playable === false || !song.src) {
      toast(`《${song.name}》暂无可用音源${song.externalUrl ? '，可点击「官方收听」跳转' : ''}`);
      return;
    }
    playSong(song, suggestions);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    store.pushSearchHistory(q);
    closeSug();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!sugOpen || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Escape') {
      closeSug();
    } else if (event.key === 'Enter' && activeIdx >= 0 && activeIdx < suggestions.length) {
      event.preventDefault();
      playSuggestion(suggestions[activeIdx]);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">
            <MusicNoteIcon size={18} />
          </span>
          <span className="logo-text">
            <strong>QQ音乐</strong>
            <em>听我想听</em>
          </span>
        </Link>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <form className="search" onSubmit={handleSubmit} role="search" ref={searchRef}>
          <SearchIcon size={17} className="search-icon" />
          <input
            className="search-input"
            value={keyword}
            onChange={(event) => handleChange(event.target.value)}
            onFocus={() => {
              if (keyword.trim()) setSugOpen(true);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索音乐、歌手、歌单"
            aria-label="搜索音乐、歌手、歌单"
            aria-expanded={sugOpen && Boolean(query)}
            role="combobox"
            aria-controls="search-suggest"
            aria-autocomplete="list"
            autoComplete="off"
          />
          {keyword ? (
            <button
              type="button"
              className="search-clear"
              aria-label="清空"
              onClick={() => {
                setKeyword('');
                closeSug();
              }}
            >
              <CloseIcon size={13} />
            </button>
          ) : null}
          <button type="submit" className="search-btn">
            搜索
          </button>

          {/* 实时联想：歌名 / 歌手 / 专辑前缀匹配，点击直接开播；回车仍进全文搜索页 */}
          {sugOpen && query ? (
            suggestions.length ? (
              <div className="search-sug" id="search-suggest" role="listbox" aria-label="搜索联想">
                {suggestions.map((song, i) => (
                  <button
                    type="button"
                    key={`${song.id}-${i}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`search-sug-item ${i === activeIdx ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => playSuggestion(song)}
                  >
                    <Cover src={song.cover} name={song.name} size={32} radius={4} className="search-sug-cover" />
                    <span className="search-sug-main">
                      <span className="search-sug-name">{highlight(song.name, query)}</span>
                      <span className="search-sug-artist">{song.artist}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="search-sug is-empty">
                <span className="search-sug-note">
                  没有匹配「{keyword.trim()}」的歌曲
                  <em>回车或点「搜索」查看全文搜索结果</em>
                </span>
              </div>
            )
          ) : null}
        </form>

        <div className="topbar-right">
          <div className="theme-switch" ref={themeRef}>
            <button
              type="button"
              className={`theme-btn ${themeOpen ? 'is-active' : ''}`}
              title="切换主题"
              aria-label="切换主题"
              aria-haspopup="menu"
              aria-expanded={themeOpen}
              onClick={() => setThemeOpen((open) => !open)}
            >
              {resolvedTheme === 'dark' ? <MoonIcon size={17} /> : <SunIcon size={17} />}
            </button>
            {themeOpen ? (
              <div className="theme-menu" role="menu">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={themeMode === option.value}
                    className={`theme-item ${themeMode === option.value ? 'is-active' : ''}`}
                    onClick={() => {
                      setThemeMode(option.value);
                      setThemeOpen(false);
                    }}
                  >
                    <span className="theme-item-icon">{option.icon}</span>
                    <span className="theme-item-label">{option.label}</span>
                    {themeMode === option.value ? <CheckIcon size={15} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button type="button" className="vip-btn" onClick={() => openModal('VIP 功能敬请期待，先登录体验吧～')}>
            开通VIP
          </button>

          {/* 已登录管理台，或主站账号是管理员时，给一个直达入口 */}
          {canAdmin ? (
            <Link to="/admin" className="admin-entry" title="进入曲库管理台">
              <SettingsIcon size={16} />
              管理台
            </Link>
          ) : null}

          {user ? (
            <div className="user" ref={menuRef}>
              <button type="button" className="user-trigger" onClick={() => setMenuOpen((open) => !open)}>
                <span className="avatar">{user.nickname.slice(0, 1)}</span>
                <span className="user-name">{user.nickname}</span>
              </button>
              {menuOpen ? (
                <div className="user-menu">
                  <div className="user-menu-head">
                    <span className="avatar avatar-lg">{user.nickname.slice(0, 1)}</span>
                    <div>
                      <p className="user-menu-name">{user.nickname}</p>
                      <p className="user-menu-id">账号：{user.username}</p>
                    </div>
                  </div>
                  <Link className="user-menu-item" to="/likes" onClick={() => setMenuOpen(false)}>
                    我喜欢
                  </Link>
                  <Link className="user-menu-item" to="/collection" onClick={() => setMenuOpen(false)}>
                    我的收藏
                  </Link>
                  <Link className="user-menu-item" to="/recent" onClick={() => setMenuOpen(false)}>
                    最近播放
                  </Link>
                  <Link className="user-menu-item is-admin" to="/admin" onClick={() => setMenuOpen(false)}>
                    <SettingsIcon size={15} />
                    曲库管理台
                    {canAdmin ? <em className="user-menu-role">{adminUser ? '已登录' : '可进入'}</em> : null}
                  </Link>
                  <button
                    type="button"
                    className="user-menu-item is-danger"
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                      if (location.pathname !== '/') navigate('/');
                    }}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button type="button" className="login-btn" onClick={() => openModal('登录后即可收藏喜欢的音乐')}>
              <UserIcon size={16} />
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
