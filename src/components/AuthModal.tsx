import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import { store } from '../lib/db';
import { CloseIcon, EyeIcon, EyeOffIcon, LockIcon, SmileIcon, UserIcon } from './Icons';
import ParticleBackground from './ParticleBackground';

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
  const [showPassword, setShowPassword] = useState(false);
  /** 旧版本地账号库是否还有数据（存在则提示用户用原账号名重新注册/登录） */
  const [legacyUser, setLegacyUser] = useState('');

  useEffect(() => {
    if (!modalOpen) return;
    // 用户名一填就检查旧库，命中说明这是从本地账号时代迁移过来的用户
    const name = username.trim();
    setLegacyUser(name && store.hasLegacyUser(name) ? name : '');
  }, [modalOpen, username]);

  useEffect(() => {
    if (modalOpen) {
      setError('');
      setPassword('');
      setLoading(false);
      setShowPassword(false);
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
      // 后端返回的中文提示（账号不存在 / 密码错误 / 无法连接服务器…）直接展示
      setError(err instanceof Error ? err.message : '操作失败，请稍后再试');
      // 登录时提示「账号不存在」但旧库里其实有这个账号 → 说明需要先注册迁移
      if (tab === 'login' && store.hasLegacyUser(username)) {
        setLegacyUser(username.trim());
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-mask auth-mask" onMouseDown={closeModal} role="presentation">
      <ParticleBackground />
      <div className="auth-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="auth-close" aria-label="关闭" onClick={closeModal}>
          <CloseIcon size={16} />
        </button>

        <div className="auth-head">
          <span className="logo-mark logo-mark-lg auth-logo">
            <img src="/icon/c55fbb69-0ae0-4659-9de3-6111144698a7.png" alt="" />
          </span>
          <h3>欢迎来到 Free音乐</h3>
          <p className="auth-sub">登录后即可收藏喜欢的歌曲与歌单</p>
        </div>

        <div className="auth-tabs" role="tablist">
          <span className={`auth-tab-slider ${tab === 'register' ? 'is-right' : ''}`} aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            className={`auth-tab ${tab === 'login' ? 'is-active' : ''}`}
            onClick={() => setTab('login')}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'register'}
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
            <span className="auth-input-wrap">
              <UserIcon size={17} className="auth-input-icon" />
              <input
                value={username}
                autoFocus
                autoComplete="username"
                placeholder="2-16 位中文、字母、数字或下划线"
                onChange={(event) => setUsername(event.target.value)}
              />
            </span>
          </label>

          {tab === 'register' ? (
            <label className="auth-field auth-field-enter">
              <span>昵称</span>
              <span className="auth-input-wrap">
                <SmileIcon size={17} className="auth-input-icon" />
                <input
                  value={nickname}
                  autoComplete="nickname"
                  placeholder="选填，默认与账号相同"
                  onChange={(event) => setNickname(event.target.value)}
                />
              </span>
            </label>
          ) : null}

          <label className="auth-field">
            <span>密码</span>
            <span className="auth-input-wrap">
              <LockIcon size={17} className="auth-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                placeholder="至少 6 位"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-eye"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
              </button>
            </span>
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="btn auth-submit btn-block" disabled={loading}>
            <span className="auth-submit-label">{loading ? '处理中…' : tab === 'login' ? '登录' : '注册并登录'}</span>
          </button>
        </form>

        <p className="auth-foot">
          {tab === 'login' ? '还没有账号？' : '已有账号？'}
          <button type="button" className="link-btn" onClick={() => setTab(tab === 'login' ? 'register' : 'login')}>
            {tab === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
        <p className="auth-tip">
          {legacyUser
            ? `检测到旧版本地账号「${legacyUser}」，请用该账号名注册或登录；收藏与歌单会保留`
            : '账号与管理台共用，登录后收藏、歌单在任意浏览器都可用'}
        </p>
      </div>
    </div>
  );
}
