import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import QueueDrawer from './components/QueueDrawer';
import LyricsView from './components/LyricsView';
import AuthModal from './components/AuthModal';
import AccountModal from './components/AccountModal';
import PlaylistModal from './components/PlaylistModal';
import AddToPlaylistModal from './components/AddToPlaylistModal';
import Toaster from './components/Toaster';
import SyncBanner from './components/SyncBanner';
import Home from './pages/Home';
import PlaylistDetail from './pages/PlaylistDetail';
import Search from './pages/Search';
import Likes from './pages/Likes';
import Collection from './pages/Collection';
import Recent from './pages/Recent';
import Stats from './pages/Stats';
import Ranking from './pages/Ranking';
import Artists from './pages/Artists';
import ArtistDetail from './pages/ArtistDetail';
import Albums from './pages/Albums';
import AlbumDetail from './pages/AlbumDetail';
import NotFound from './pages/NotFound';
import AdminConsole from './pages/admin/AdminConsole';
import { useAuth } from './store/auth';
import { useCatalog } from './store/catalog';
import { useFeaturedPlaylists } from './store/featuredPlaylists';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export default function App() {
  const boot = useAuth((s) => s.boot);
  const loadCatalog = useCatalog((s) => s.load);
  const loadFeaturedPlaylists = useFeaturedPlaylists((s) => s.load);
  const location = useLocation();
  // 全局播放快捷键（空格 / 方向键 / M / L），管理台里也挂着但不影响输入
  useKeyboardShortcuts();
  // 管理台使用独立布局（不带播放条 / 侧边栏）
  const isAdminRoute = location.pathname.startsWith('/admin');

  // 管理台入库写的是 MySQL + public/ 音频，所以曲库要从后端接口加载。
  // 从管理台返回主站时会重新取数，让刚维护的歌手、专辑和推荐歌单立即生效。
  useEffect(() => {
    void loadCatalog();
    void loadFeaturedPlaylists();
  }, [loadCatalog, loadFeaturedPlaylists, isAdminRoute]);

  useEffect(() => {
    boot();
  }, [boot]);

  /**
   * 路由切换时的滚动策略：
   *   - 只在「路径」变化时滚动 —— 查询参数变化（比如专辑页切排序）不该把页面猛地弹回顶部，
   *     那一下瞬间跳动正是用户感知到的「抖动」；
   *   - 用平滑滚动让换页有个自然的过渡，系统开了「减弱动态效果」则退回瞬间定位。
   */
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [location.pathname]);

  if (isAdminRoute) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminConsole />} />
        <Route path="*" element={<AdminConsole />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      {/* 歌词抽屉展开时这一整块会同步模糊（body.lyrics-open），播放条与抽屉本身不模糊 */}
      <div className="app-shell">
        <TopBar />
        <div className="app-body">
          <Sidebar />
          <main className="app-main">
            <SyncBanner />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/playlist/:id" element={<PlaylistDetail />} />
              <Route path="/search" element={<Search />} />
              <Route path="/likes" element={<Likes />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/recent" element={<Recent />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/artists" element={<Artists />} />
              <Route path="/artist/:name" element={<ArtistDetail />} />
              <Route path="/albums" element={<Albums />} />
              <Route path="/album/:id" element={<AlbumDetail />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
      <PlayerBar />
      <QueueDrawer />
      <LyricsView />
      <AuthModal />
      <AccountModal />
      <PlaylistModal />
      <AddToPlaylistModal />
      <Toaster />
    </div>
  );
}
