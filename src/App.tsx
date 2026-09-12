import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import QueueDrawer from './components/QueueDrawer';
import LyricsView from './components/LyricsView';
import AuthModal from './components/AuthModal';
import PlaylistModal from './components/PlaylistModal';
import AddToPlaylistModal from './components/AddToPlaylistModal';
import Toaster from './components/Toaster';
import Home from './pages/Home';
import PlaylistDetail from './pages/PlaylistDetail';
import Search from './pages/Search';
import Likes from './pages/Likes';
import Collection from './pages/Collection';
import Recent from './pages/Recent';
import Ranking from './pages/Ranking';
import Artists from './pages/Artists';
import ArtistDetail from './pages/ArtistDetail';
import NotFound from './pages/NotFound';
import AdminConsole from './pages/admin/AdminConsole';
import { useAuth } from './store/auth';
import { useCatalog } from './store/catalog';

export default function App() {
  const boot = useAuth((s) => s.boot);
  const loadCatalog = useCatalog((s) => s.load);
  const location = useLocation();

  // 管理台入库写的是 MySQL + public/ 音频，所以曲库要从后端接口加载
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // 管理台使用独立布局（不带播放条 / 侧边栏）
  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

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
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/playlist/:id" element={<PlaylistDetail />} />
            <Route path="/search" element={<Search />} />
            <Route path="/likes" element={<Likes />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/recent" element={<Recent />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/artist/:name" element={<ArtistDetail />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
      <PlayerBar />
      <QueueDrawer />
      <LyricsView />
      <AuthModal />
      <PlaylistModal />
      <AddToPlaylistModal />
      <Toaster />
    </div>
  );
}
