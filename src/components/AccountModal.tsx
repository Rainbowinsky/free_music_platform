import { useEffect, useState } from 'react';
import { CloseIcon, EyeIcon, EyeOffIcon, LockIcon } from './Icons';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { meApi, MeError, store } from '../lib/db';

/** 账号角色展示文案（与后端 users.role 的三级角色一致） */
const ROLE_TEXT: Record<string, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  user: '普通用户',
};

const PASSWORD_MIN = 6;

/**
 * 账号设置弹窗。
 *
 * 目前只做「修改密码」这一件主站用户真正会需要的事：
 * 之前忘了密码只能找管理员重置，而管理员重置又只有超管能做，链路太长。
 * 刻意不做邮箱找回 —— 那要引入 SMTP，与「本地曲库演示项目」的定位不符。
 */
export default function AccountModal() {
  const open = useUi((s) => s.accountOpen);
  const close = useUi((s) => s.closeAccount);
  const toast = useUi((s) => s.toast);
  const user = useAuth((s) => s.user);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 每次打开都重新开始，避免残留上一次输入
  useEffect(() => {
    if (!open) return;
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShow(false);
    setError('');
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close]);

  if (!open || !user) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    // 前端先做一轮校验，减少一次往返；真正的规则仍以后端为准
    if (!oldPassword) {
      setError('请输入当前密码');
      return;
    }
    if (newPassword.length < PASSWORD_MIN) {
      setError(`新密码长度不能少于 ${PASSWORD_MIN} 位`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword === oldPassword) {
      setError('新密码不能与当前密码相同');
      return;
    }

    const token = store.getToken();
    if (!token) {
      setError('登录状态已过期，请重新登录');
      return;
    }

    setError('');
    setBusy(true);
    try {
      await meApi.changePassword(token, oldPassword, newPassword);
      toast('密码已更新，请记住新密码');
      close();
    } catch (err) {
      setError(err instanceof MeError ? err.message : '修改失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onMouseDown={close} role="presentation">
      <div className="playlist-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="auth-close" aria-label="关闭" onClick={close}>
          <CloseIcon size={16} />
        </button>

        <h3 className="modal-title">账号设置</h3>
        <p className="modal-sub">账号资料与密码都保存在后端，换浏览器也在</p>

        <div className="account-rows">
          <div className="account-row">
            <span className="account-key">账号</span>
            <span className="account-val">{user.username}</span>
          </div>
          <div className="account-row">
            <span className="account-key">昵称</span>
            <span className="account-val">{user.nickname}</span>
          </div>
          <div className="account-row">
            <span className="account-key">角色</span>
            <span className="account-val">{ROLE_TEXT[user.role ?? 'user'] ?? '普通用户'}</span>
          </div>
          <div className="account-row">
            <span className="account-key">注册时间</span>
            <span className="account-val">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '—'}
            </span>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <p className="account-section">修改密码</p>

          <label className="auth-field">
            <span>当前密码</span>
            <span className="auth-input-wrap">
              <LockIcon size={17} className="auth-input-icon" />
              <input
                type={show ? 'text' : 'password'}
                value={oldPassword}
                autoComplete="current-password"
                placeholder="用于验证身份"
                onChange={(event) => {
                  setOldPassword(event.target.value);
                  setError('');
                }}
              />
              <button
                type="button"
                className="auth-eye"
                aria-label={show ? '隐藏密码' : '显示密码'}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
              </button>
            </span>
          </label>

          <label className="auth-field">
            <span>新密码</span>
            <span className="auth-input-wrap">
              <LockIcon size={17} className="auth-input-icon" />
              <input
                type={show ? 'text' : 'password'}
                value={newPassword}
                autoComplete="new-password"
                placeholder={`至少 ${PASSWORD_MIN} 位`}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setError('');
                }}
              />
            </span>
          </label>

          <label className="auth-field">
            <span>确认新密码</span>
            <span className="auth-input-wrap">
              <LockIcon size={17} className="auth-input-icon" />
              <input
                type={show ? 'text' : 'password'}
                value={confirmPassword}
                autoComplete="new-password"
                placeholder="再输入一次"
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError('');
                }}
              />
            </span>
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={close} disabled={busy}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? '提交中…' : '保存新密码'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
