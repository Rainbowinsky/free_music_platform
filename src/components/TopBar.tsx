import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useTheme, type ThemeMode } from '../store/theme';
import { store } from '../lib/db';
import { adminAuth } from '../lib/adminApi';
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

export default function TopBar() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);
  const logout = useAuth((s) => s.logout);
  const themeMode = useTheme((s) => s.mode);
  const resolvedTheme = useTheme((s) => s.resolved);
  const setThemeMode = useTheme((s) => s.setMode);
  const navigate = useNavigate();
  const location = useLocation();
  const [keyword, setKeyword] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  // 浏览器里已经登录过管理台的话（localStorage 有 JWT），顶栏给一个直达入口
  const [adminUser] = useState(() => adminAuth.getUser());

  useEffect(() => {
    if (location.pathname === '/search') {
      const params = new URLSearchParams(location.search);
      setKeyword(params.get('q') ?? '');
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (themeRef.current && !themeRef.current.contains(target)) setThemeOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    store.pushSearchHistory(q);
    navigate(`/search?q=${encodeURIComponent(q)}`);
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

        <form className="search" onSubmit={handleSubmit} role="search">
          <SearchIcon size={17} className="search-icon" />
          <input
            className="search-input"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索音乐、歌手、歌单"
            aria-label="搜索音乐、歌手、歌单"
          />
          {keyword ? (
            <button type="button" className="search-clear" aria-label="清空" onClick={() => setKeyword('')}>
              <CloseIcon size={13} />
            </button>
          ) : null}
          <button type="submit" className="search-btn">
            搜索
          </button>
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

          {/* 已经登录过管理台的话，这里给一个直达入口 */}
          {adminUser ? (
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
                    {adminUser ? <em className="user-menu-role">已登录</em> : null}
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
