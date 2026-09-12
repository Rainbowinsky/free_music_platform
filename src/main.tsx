import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { usePlayer } from './store/player';
import { useAuth } from './store/auth';
import { useLibrary } from './store/library';
import { useTheme } from './store/theme';
import { useCatalog } from './store/catalog';
import { useUi } from './store/ui';
import './styles/index.css';

// 主题要在首屏渲染前落到 <html> 上（index.html 里另有内联脚本防白闪）
useTheme.getState().init();

if (import.meta.env.DEV) {
  // 开发环境下暴露 store，方便在控制台调试与自动化校验
  (window as unknown as Record<string, unknown>).__stores = {
    player: usePlayer,
    auth: useAuth,
    library: useLibrary,
    catalog: useCatalog,
    ui: useUi,
  };
}

const container = document.getElementById('root');
if (!container) throw new Error('#root 容器不存在');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
