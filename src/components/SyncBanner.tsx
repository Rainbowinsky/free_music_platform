import { useEffect, useState } from 'react';
import { useLibrary } from '../store/library';
import { useAuth } from '../store/auth';

/**
 * 「我的音乐」同步状态提示。
 *
 * 迁移到后端之后，写操作失败（后端没起、token 过期）不该悄无声息 ——
 * 用户会以为自己点了个寂寞。这里把 store 里的 error 显性化，
 * 可手动关闭，下次 error 变化时会重新出现。
 */
export default function SyncBanner() {
  const user = useAuth((s) => s.user);
  const error = useLibrary((s) => s.error);
  const retry = useLibrary((s) => s.loadFor);
  const [dismissed, setDismissed] = useState('');

  // error 变了就重新展示（比如上一轮已关掉，这轮又失败）
  useEffect(() => {
    if (!error) setDismissed('');
  }, [error]);

  if (!user || !error || dismissed === error) return null;

  return (
    <div className="sync-banner" role="alert">
      <span className="sync-banner-text">⚠️ {error}</span>
      <div className="sync-banner-actions">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void retry(user.username)}
        >
          重试
        </button>
        <button
          type="button"
          className="sync-banner-close"
          aria-label="关闭提示"
          onClick={() => setDismissed(error)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
