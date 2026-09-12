import { useEffect, useState } from 'react';
import { CloseIcon } from './Icons';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';

/** 新建 / 编辑歌单弹窗 */
export default function PlaylistModal() {
  const modal = useUi((s) => s.playlistModal);
  const close = useUi((s) => s.closePlaylistModal);
  const toast = useUi((s) => s.toast);
  const playlists = useLibrary((s) => s.playlists);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const updatePlaylist = useLibrary((s) => s.updatePlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);

  const editing = modal?.mode === 'edit' ? playlists.find((p) => p.id === modal.playlistId) : undefined;
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!modal) return;
    setTitle(editing?.title ?? '');
    setDesc(editing?.desc ?? '');
    setError('');
  }, [modal, editing?.title, editing?.desc]);

  useEffect(() => {
    if (!modal) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modal, close]);

  if (!modal) return null;

  const isEdit = modal.mode === 'edit' && editing;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) {
      setError('请填写歌单名称');
      return;
    }
    if (name.length > 30) {
      setError('歌单名称最多 30 个字');
      return;
    }
    if (isEdit && editing) {
      updatePlaylist(editing.id, { title: name, desc });
      toast('歌单信息已更新');
    } else {
      const created = createPlaylist(name, desc);
      if (!created) {
        setError('创建失败，请先登录');
        return;
      }
      toast(`歌单「${created.title}」创建成功`);
    }
    close();
  };

  const handleDelete = () => {
    if (!editing) return;
    deletePlaylist(editing.id);
    toast(`已删除歌单「${editing.title}」`);
    close();
  };

  return (
    <div className="modal-mask" onMouseDown={close} role="presentation">
      <div className="playlist-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="auth-close" aria-label="关闭" onClick={close}>
          <CloseIcon size={16} />
        </button>

        <h3 className="modal-title">{isEdit ? '编辑歌单' : '新建歌单'}</h3>
        <p className="modal-sub">
          {isEdit ? `创建于 ${editing ? new Date(editing.createdAt).toLocaleDateString('zh-CN') : ''}` : '给歌单起个名字，之后可以随时修改'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>歌单名称</span>
            <input
              value={title}
              autoFocus
              maxLength={30}
              placeholder="例如：通勤路上的歌"
              onChange={(event) => {
                setTitle(event.target.value);
                setError('');
              }}
            />
          </label>

          <label className="auth-field">
            <span>简介（选填）</span>
            <textarea
              className="modal-textarea"
              value={desc}
              maxLength={120}
              rows={3}
              placeholder="介绍一下这个歌单吧"
              onChange={(event) => setDesc(event.target.value)}
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <div className="modal-actions">
            {isEdit ? (
              <button type="button" className="btn btn-danger-ghost" onClick={handleDelete}>
                删除歌单
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary">
              {isEdit ? '保存修改' : '创建歌单'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
