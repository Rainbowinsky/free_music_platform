import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import { CloseIcon, MusicNoteIcon } from './Icons';

type Tab = 'login' | 'register';

export default function AuthModal() {
  const modalOpen = useAuth((s) => s.modalOpen);
  const modalHint = useAuth((s) => s.modalHint);
  const closeModal = useAuth((s) => s.closeModal);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);

  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (modalOpen) {
      setError('');
      setPassword('');
      setLoading(false);
    }
  }, [modalOpen, tab]);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') await login(username, password);
      else await register(username, password, nickname);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-mask" onMouseDown={closeModal} role="presentation">
      <div className="auth-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="auth-close" aria-label="关闭" onClick={closeModal}>
          <CloseIcon size={16} />
        </button>

        <div className="auth-head">
          <span className="logo-mark logo-mark-lg">
            <MusicNoteIcon size={22} />
          </span>
          <h3>欢迎来到 QQ音乐</h3>
          <p className="auth-sub">登录后即可收藏喜欢的歌曲与歌单</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'login' ? 'is-active' : ''}`}
            onClick={() => setTab('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'register' ? 'is-active' : ''}`}
            onClick={() => setTab('register')}
          >
            注册
          </button>
        </div>

        {modalHint ? <p className="auth-hint">{modalHint}</p> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>账号</span>
            <input
              value={username}
              autoFocus
              autoComplete="username"
              placeholder="2-16 位中文、字母、数字或下划线"
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          {tab === 'register' ? (
            <label className="auth-field">
              <span>昵称</span>
              <input
                value={nickname}
                autoComplete="nickname"
                placeholder="选填，默认与账号相同"
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
          ) : null}

          <label className="auth-field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              placeholder="至少 6 位"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? '处理中…' : tab === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        <p className="auth-foot">
          {tab === 'login' ? '还没有账号？' : '已有账号？'}
          <button type="button" className="link-btn" onClick={() => setTab(tab === 'login' ? 'register' : 'login')}>
            {tab === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
        <p className="auth-tip">账号数据保存在浏览器本地，仅用于演示</p>
      </div>
    </div>
  );
}
