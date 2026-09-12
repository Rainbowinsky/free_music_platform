import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminApi,
  adminAuth,
  ApiError,
  coverProxy,
  formatDateTime,
  formatDuration,
  formatSize,
  ROLE_META,
  SOURCE_LABEL,
  VERDICT_LABEL,
  type AdminSong,
  type AdminUser,
  type AgentStatus,
  type Candidate,
  type ImportTask,
  type LibraryStats,
  type Role,
  type SearchResult,
} from '../../lib/adminApi';
import Cover from '../../components/Cover';
import {
  CloseIcon,
  ListIcon,
  MusicNoteIcon,
  PlusIcon,
  SearchIcon,
  StopIcon,
  TrashIcon,
  DownloadIcon,
  UserIcon,
} from '../../components/Icons';

type Tab = 'import' | 'upload' | 'library' | 'users';

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export default function AdminConsole() {
  const [user, setUser] = useState<AdminUser | null>(adminAuth.getUser());
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('import');
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refreshStats = useCallback(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    (async () => {
      if (!adminAuth.getToken()) {
        setChecking(false);
        return;
      }
      try {
        const { user: me } = await adminApi.me();
        setUser(me);
        adminAuth.setUser(me);
        refreshStats();
        adminApi.agentStatus().then(setAgent).catch(() => setAgent(null));
      } catch {
        adminAuth.clear();
        setUser(null);
      } finally {
        setChecking(false);
      }
    })();
  }, [refreshStats]);

  const handleLogout = () => {
    adminAuth.clear();
    setUser(null);
    setAgent(null);
    setStats(null);
  };

  if (checking) return <div className="adm-boot">正在检查登录状态…</div>;
  if (!user) return <AdminLogin onSuccess={(u) => { setUser(u); refreshStats(); }} />;
  // admin 与 superadmin 都能进管理台
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return (
      <div className="adm-boot">
        <p>当前账号「{user.nickname}」不是管理员，无法进入曲库管理台。</p>
        <button type="button" className="adm-btn" onClick={handleLogout}>
          换个账号登录
        </button>
      </div>
    );
  }

  return (
    <div className="adm">
      <aside className="adm-side">
        <Link to="/" className="adm-logo">
          <span className="logo-mark">
            <MusicNoteIcon size={18} />
          </span>
          <span>
            <strong>曲库管理台</strong>
            <em>QQ音乐 · 学习项目</em>
          </span>
        </Link>

        <nav className="adm-nav">
          <button type="button" className={`adm-nav-item ${tab === 'import' ? 'is-active' : ''}`} onClick={() => setTab('import')}>
            <SearchIcon size={17} />
            搜歌入库
          </button>
          <button type="button" className={`adm-nav-item ${tab === 'upload' ? 'is-active' : ''}`} onClick={() => setTab('upload')}>
            <DownloadIcon size={17} />
            本地上传
          </button>
          <button type="button" className={`adm-nav-item ${tab === 'library' ? 'is-active' : ''}`} onClick={() => setTab('library')}>
            <ListIcon size={17} />
            曲库管理
          </button>
          <button type="button" className={`adm-nav-item ${tab === 'users' ? 'is-active' : ''}`} onClick={() => setTab('users')}>
            <UserIcon size={17} />
            账号管理
          </button>
        </nav>

        <div className="adm-agent">
          <p className="adm-agent-title">裁决模型</p>
          {agent?.enabled ? (
            <>
              <p className="adm-agent-model">
                {agent.model}
                {agent.modelAvailable === false ? <span className="adm-tag is-warn">未在模型列表</span> : <span className="adm-tag is-ok">已启用</span>}
              </p>
              <p className="adm-agent-note">负责查询理解、实体归一化与版本裁决</p>
            </>
          ) : (
            <p className="adm-agent-note">{agent?.message || '未启用，使用纯规则裁决'}</p>
          )}
        </div>

        <div className="adm-side-foot">
          <Link to="/" className="adm-link">
            ← 返回音乐站
          </Link>
          <button type="button" className="adm-link" onClick={handleLogout}>
            退出登录（{user.nickname}）
          </button>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-top">
          <div>
            <h1 className="adm-title">
              {tab === 'import'
                ? '搜歌入库'
                : tab === 'upload'
                  ? '本地上传归档'
                  : tab === 'library'
                    ? '曲库管理'
                    : '账号管理'}
            </h1>
            <p className="adm-sub">
              {tab === 'import'
                ? '输入歌名或「歌名 歌手」，模型会理解查询并裁决候选版本，确认后写入本地曲库'
                : tab === 'upload'
                  ? '上传本地音频文件，自动读取标签、在线补全专辑/封面/歌词并归档'
                  : tab === 'library'
                    ? '查看、编辑、删除曲库条目；无音源的曲目会标记为「仅元数据」并给出官方跳转'
                    : '管理后台账号与角色：新建账号、提升/降级、重置密码、删除；系统始终保留至少一个管理员'}
            </p>
          </div>
          {stats ? (
            <div className="adm-stats">
              <span>
                <em>{stats.songs}</em> 首歌曲
              </span>
              <span>
                <em>{stats.playable}</em> 可播放
              </span>
              <span>
                <em>{stats.metaOnly}</em> 仅元数据
              </span>
              <span>
                <em>{stats.artists}</em> 歌手
              </span>
              <span>
                <em>{stats.albums}</em> 专辑
              </span>
              <span>
                <em>{formatSize(stats.totalBytes)}</em> 占用
              </span>
            </div>
          ) : null}
        </header>

        <div className="adm-body">
          {tab === 'import' ? <ImportTab onImported={() => { refreshStats(); setReloadKey((k) => k + 1); }} /> : null}
          {tab === 'upload' ? <UploadTab onImported={() => { refreshStats(); setReloadKey((k) => k + 1); }} /> : null}
          {tab === 'library' ? <LibraryTab reloadKey={reloadKey} onChanged={() => { refreshStats(); setReloadKey((k) => k + 1); }} /> : null}
          {tab === 'users' ? <UsersTab current={user} onSelfChanged={(u) => { setUser(u); adminAuth.setUser(u); }} /> : null}
        </div>
      </main>
    </div>
  );
}

/* ────────────────────────── 登录 ────────────────────────── */

function AdminLogin({ onSuccess }: { onSuccess: (user: AdminUser) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { user, token } = await adminApi.login(username.trim(), password);
      adminAuth.setToken(token);
      adminAuth.setUser(user);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请确认后端已启动');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-login-wrap">
      <form className="adm-login" onSubmit={submit}>
        <span className="logo-mark logo-mark-lg">
          <MusicNoteIcon size={22} />
        </span>
        <h1>曲库管理台</h1>
        <p className="adm-login-sub">使用管理员账号登录（首次启动会自动创建 admin / admin123456）</p>

        <label className="adm-field">
          <span>账号</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label className="adm-field">
          <span>密码</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="admin123456" />
        </label>

        {error ? <p className="adm-error">{error}</p> : null}

        <button type="submit" className="adm-btn is-primary is-block" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
        <Link to="/" className="adm-link is-center">
          返回音乐站
        </Link>
      </form>
    </div>
  );
}

/* ────────────────────────── 搜歌入库 ────────────────────────── */

function ImportTab({ onImported }: { onImported: () => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [task, setTask] = useState<ImportTask | null>(null);
  const [importingId, setImportingId] = useState('');
  const [metaForm, setMetaForm] = useState<{ title: string; artist: string; album: string } | null>(null);
  const [judging, setJudging] = useState(false);
  const pollRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const judgeAbortRef = useRef<AbortController | null>(null);
  const searchIdRef = useRef('');

  /** 主动停止：先显式通知后端取消（代理下也生效），再中断本地请求 */
  const stopSearch = () => {
    const id = searchIdRef.current;
    searchAbortRef.current?.abort();
    judgeAbortRef.current?.abort();
    searchAbortRef.current = null;
    judgeAbortRef.current = null;
    setLoading(false);
    setJudging(false);
    setNotice('已停止搜索');
    if (id) {
      void adminApi.cancelSearch(id).catch(() => {
        /* 后端可能已经结束了，忽略 */
      });
    }
  };

  /**
   * 第二阶段：模型裁决。
   * 候选先用规则结果快速渲染出来，这里再异步补上模型判定（模型慢/超时都不影响可用性）。
   */
  const runJudge = async (searchId: string) => {
    const controller = new AbortController();
    judgeAbortRef.current = controller;
    setJudging(true);
    try {
      const judged = await adminApi.judge(searchId, controller.signal);
      if (judgeAbortRef.current !== controller) return; // 已被新的搜索取代
      setResult((prev) =>
        prev && prev.searchId === searchId
          ? { ...prev, candidates: judged.candidates, agentApplied: judged.agentApplied, agentNote: judged.agentNote, judged: true }
          : prev,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setResult((prev) => (prev && prev.searchId === searchId ? { ...prev, agentNote: '模型裁决未完成，置信度来自规则判定' } : prev));
      }
    } finally {
      if (judgeAbortRef.current === controller) {
        judgeAbortRef.current = null;
        setJudging(false);
      }
    }
  };

  const doSearch = async (raw?: string) => {
    const keyword = (raw ?? query).trim();
    if (!keyword || loading) return;

    searchAbortRef.current?.abort();
    judgeAbortRef.current?.abort();
    judgeAbortRef.current = null;
    setJudging(false);

    const controller = new AbortController();
    const searchId = window.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    searchAbortRef.current = controller;
    searchIdRef.current = searchId;

    setLoading(true);
    setError('');
    setNotice('');
    setTask(null);

    try {
      const data = await adminApi.search(keyword, searchId, controller.signal);
      setResult(data);
      // 候选已经渲染，接着补模型裁决
      if (data.judgePending) void runJudge(searchId);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 用户点了「停止搜索」
        setResult(null);
      } else {
        setError(err instanceof ApiError ? err.message : '搜索失败');
        setResult(null);
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setLoading(false);
      }
    }
  };

  const pollTask = async (taskId: string) => {
    const token = ++pollRef.current;
    for (let i = 0; i < 90; i += 1) {
      await sleep(600);
      if (pollRef.current !== token) return;
      try {
        const { task: t } = await adminApi.task(taskId);
        setTask(t);
        if (t.status !== 'running' && t.status !== 'pending') {
          setImportingId('');
          if (t.status === 'success') {
            onImported();
            setResult((prev) => (prev ? { ...prev, duplicate: null } : prev));
          }
          return;
        }
      } catch {
        setImportingId('');
        return;
      }
    }
    setImportingId('');
  };

  const doImport = async (candidate: Candidate) => {
    if (!result) return;
    setImportingId(`${candidate.server}:${candidate.id}`);
    setTask(null);
    try {
      const { taskId } = await adminApi.importCandidate({
        server: candidate.server,
        id: candidate.id,
        target: result.target,
      });
      void pollTask(taskId);
    } catch (err) {
      setImportingId('');
      setError(err instanceof ApiError ? err.message : '入库失败');
    }
  };

  const doMetadataOnly = async () => {
    if (!metaForm) return;
    try {
      const res = await adminApi.metadataOnly(metaForm);
      const skipped = res.status === 'skipped';
      setTask({
        id: 'manual',
        action: 'metadata',
        target: metaForm.title,
        status: skipped ? 'skipped' : 'success',
        step: skipped ? '已存在' : '完成',
        progress: 100,
        message: res.message || `已按「仅元数据」入库《${res.song.title}》- ${res.song.artist}，可在曲库中补充音频或跳转官方平台`,
        songId: res.song?.id ?? null,
      });
      setMetaForm(null);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '写入失败');
    }
  };

  return (
    <div className="adm-panel">
      <form
        className="adm-search"
        onSubmit={(e) => {
          e.preventDefault();
          void doSearch();
        }}
      >
        <SearchIcon size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如：有何不可 许嵩 / 周杰伦那首关于妈妈的歌"
        />
        {loading ? (
          <button type="button" className="adm-btn is-stop" onClick={stopSearch}>
            <StopIcon size={14} />
            停止搜索
          </button>
        ) : (
          <button type="submit" className="adm-btn is-primary">
            搜索
          </button>
        )}
      </form>

      <div className="adm-quick">
        <span>试试：</span>
        {['有何不可 许嵩', '海阔天空 Beyond', '晴天 周杰伦', 'Lemon 米津玄师'].map((k) => (
          <button
            key={k}
            type="button"
            className="adm-chip"
            disabled={loading}
            onClick={() => {
              setQuery(k);
              void doSearch(k);
            }}
          >
            {k}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="adm-hint">
          正在多源召回候选，并交给裁决模型核对版本与专辑（通常 5–12 秒）——如果卡住可以点「停止搜索」
        </p>
      ) : null}

      {notice ? <p className="adm-notice">{notice}</p> : null}

      {error ? <p className="adm-error">{error}</p> : null}

      {task ? (
        <div className={`adm-task is-${task.status}`}>
          <div className="adm-task-head">
            <strong>{task.status === 'success' ? '入库成功' : task.status === 'skipped' ? '已存在，跳过' : task.status === 'failed' ? '入库失败' : '处理中'}</strong>
            <span>{task.progress}%</span>
          </div>
          <div className="adm-bar">
            <i style={{ width: `${task.progress}%` }} />
          </div>
          <p className="adm-task-msg">
            {task.step} · {task.message}
          </p>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="adm-result-head">
            <div>
              <p className="adm-result-target">
                识别为：<strong>{result.target.title}</strong>
                {result.target.artist ? ` - ${result.target.artist}` : ''}
                <span className={`adm-tag ${result.parsedBy === 'agent' ? 'is-ok' : 'is-muted'}`}>
                  {result.parsedBy === 'agent' ? '模型解析' : '规则解析'}
                </span>
                <span className="adm-tag is-muted">共召回 {result.total} 条</span>
                {judging ? <span className="adm-tag is-muted">模型裁决中…</span> : null}
                {!judging && result.judged && result.agentApplied ? <span className="adm-tag is-ok">模型已裁决</span> : null}
                {result.agentNote ? <span className="adm-tag is-warn">{result.agentNote}</span> : null}
              </p>
            </div>
            <button type="button" className="adm-btn is-ghost" onClick={() => setMetaForm({ title: result.target.title, artist: result.target.artist, album: '' })}>
              仅元数据入库
            </button>
          </div>

          {result.duplicate ? (
            <div className="adm-banner is-warn">
              曲库已有《{result.duplicate.title}》- {result.duplicate.artist}
              {result.duplicate.album ? `《${result.duplicate.album}》` : ''}
              {result.duplicate.playable ? '（可播放）' : '（仅元数据）'}
            </div>
          ) : null}

          <ul className="adm-cands">
            {result.candidates.map((c) => {
              const verdict = c.agentVerdict ? VERDICT_LABEL[c.agentVerdict] : null;
              const busy = importingId === `${c.server}:${c.id}`;
              return (
                <li key={`${c.server}-${c.id}`} className={`adm-cand ${c.confidence >= 70 ? 'is-good' : ''}`}>
                  <Cover src={coverProxy(c.coverUrl || c.picUrl)} name={c.name} size={56} radius={8} />
                  <div className="adm-cand-main">
                    <div className="adm-cand-title">
                      <strong>{c.name}</strong>
                      <span className={`adm-tag is-${c.server === 'netease' ? 'ok' : 'muted'}`}>{SOURCE_LABEL[c.server] || c.server}</span>
                      {verdict ? <span className={`adm-tag is-${verdict.tone}`}>{verdict.text}</span> : null}
                      {c.audioAvailable === false ? <span className="adm-tag is-bad">音源不可用</span> : null}
                      {c.duplicate ? <span className="adm-tag is-warn">曲库已有</span> : null}
                    </div>
                    <p className="adm-cand-meta">
                      {c.artist || '未知歌手'}
                      {c.album ? ` · 《${c.album}》` : ' · 无专辑信息'}
                      {c.durationSec ? ` · ${formatDuration(c.durationSec)}` : ''}
                      {c.sizeMB ? ` · ${c.sizeMB}MB` : ''}
                      {c.full === false ? ' · 非全曲' : ''}
                    </p>
                    {c.agentReason ? <p className="adm-cand-reason">模型：{c.agentReason}</p> : null}
                    {c.flags.length ? (
                      <p className="adm-cand-flags">
                        {c.flags.map((f) => (
                          <span key={f} className="adm-flag">
                            {f}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  <div className="adm-cand-side">
                    <div className="adm-conf" title={`置信度 ${c.confidence}`}>
                      <span>{c.confidence}</span>
                      <i style={{ width: `${c.confidence}%` }} />
                    </div>
                    <button
                      type="button"
                      className="adm-btn is-primary is-sm"
                      disabled={busy || Boolean(c.duplicate) || c.importable === false}
                      onClick={() => void doImport(c)}
                    >
                      {busy
                        ? '入库中…'
                        : c.duplicate
                          ? '已在库'
                          : c.importable === false
                            ? '音源不可用'
                            : '确认入库'}
                    </button>
                    {c.importable === false ? (
                      <button
                        type="button"
                        className="adm-btn is-sm"
                        onClick={() => setMetaForm({ title: c.name, artist: c.artist, album: c.album || '' })}
                      >
                        仅元数据
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {result.candidates.length === 0 ? (
            <div className="adm-empty">
              <p>没有召回可用候选。</p>
              <p className="adm-empty-note">
                这类曲目通常是独家版权（例如周杰伦在网易云整库缺失）。建议改用「仅元数据入库」保留专辑结构，或用「本地上传」归档你合法持有的音频。
              </p>
              <button type="button" className="adm-btn" onClick={() => setMetaForm({ title: result.target.title, artist: result.target.artist, album: '' })}>
                仅元数据入库
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {metaForm ? (
        <div className="adm-modal-mask" onClick={() => setMetaForm(null)} role="presentation">
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="adm-modal-close" onClick={() => setMetaForm(null)} aria-label="关闭">
              <CloseIcon size={16} />
            </button>
            <h2>仅元数据入库</h2>
            <p className="adm-modal-sub">先把曲目结构（歌手 / 专辑 / 歌名）建好，音频可之后用本地上传补齐</p>
            <label className="adm-field">
              <span>歌名</span>
              <input value={metaForm.title} onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })} />
            </label>
            <label className="adm-field">
              <span>歌手</span>
              <input value={metaForm.artist} onChange={(e) => setMetaForm({ ...metaForm, artist: e.target.value })} />
            </label>
            <label className="adm-field">
              <span>专辑</span>
              <input value={metaForm.album} onChange={(e) => setMetaForm({ ...metaForm, album: e.target.value })} placeholder="选填" />
            </label>
            <button type="button" className="adm-btn is-primary is-block" onClick={() => void doMetadataOnly()}>
              写入曲库（标记为需外部收听）
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ────────────────────────── 本地上传 ────────────────────────── */

function UploadTab({ onImported }: { onImported: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<{ name: string; status: string; message: string; detail?: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.upload(file);
      const tags = (res.tags || {}) as Record<string, unknown>;
      setHistory((prev) => [
        {
          name: file.name,
          status: res.status,
          message: res.message,
          detail: [
            `歌名：${tags.title ?? '-'}`,
            `歌手：${tags.artist || '-'}`,
            `专辑：${tags.album || '-'}`,
            `时长：${tags.durationSec ? `${tags.durationSec}s` : '-'}`,
            `封面：${tags.cover ? '已获取' : '无'}`,
            `歌词：${tags.lyrics ? '已获取' : '无'}`,
            res.matched ? `在线匹配：网易云 id=${res.matched.id}` : '在线匹配：无',
          ].join(' · '),
        },
        ...prev,
      ]);
      if (res.status === 'success') onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `上传失败：${err instanceof Error ? err.message : '请确认后端服务已启动（npm run server）'}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="adm-panel">
      <div
        className={`adm-drop ${dragging ? 'is-dragging' : ''} ${busy ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.flac,.m4a,.wav,.ogg"
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <PlusIcon size={26} />
        <p className="adm-drop-title">{busy ? '正在解析并归档…' : '点击选择，或把音频文件拖到这里'}</p>
        <p className="adm-drop-note">
          支持 mp3 / flac / m4a / wav；会自动读取 ID3 标签，标签缺失时用文件名 + 在线检索补全专辑、封面与歌词，
          并自动归档到对应歌手与专辑
        </p>
      </div>

      {error ? <p className="adm-error">{error}</p> : null}

      {history.length ? (
        <ul className="adm-uploads">
          {history.map((item, i) => (
            <li key={`${item.name}-${i}`} className={`adm-upload is-${item.status}`}>
              <div className="adm-upload-head">
                <strong>{item.name}</strong>
                <span className={`adm-tag is-${item.status === 'success' ? 'ok' : item.status === 'skipped' ? 'warn' : 'bad'}`}>
                  {item.status === 'success' ? '已归档' : item.status === 'skipped' ? '已存在' : '失败'}
                </span>
              </div>
              <p className="adm-upload-msg">{item.message}</p>
              {item.detail ? <p className="adm-upload-detail">{item.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ────────────────────────── 曲库管理 ────────────────────────── */

function LibraryTab({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [playable, setPlayable] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminSong[] }>({ total: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminSong | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.songs({ keyword, playable, page, size: 12 });
      setData({ total: res.total, items: res.items });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, playable, page]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(data.total / 12));

  const remove = async (song: AdminSong) => {
    if (!window.confirm(`确认删除《${song.title}》- ${song.artist}？本地音频文件也会一并删除。`)) return;
    try {
      await adminApi.deleteSong(song.id);
      onChanged();
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除失败');
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await adminApi.updateSong(editing.id, {
        title: editing.title,
        artist: editing.artist,
        album: editing.album,
        externalUrl: editing.externalUrl,
        playable: editing.playable,
      });
      setEditing(null);
      onChanged();
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-filters">
        <input
          className="adm-input"
          value={keyword}
          placeholder="按歌名 / 歌手 / 专辑搜索"
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="adm-input"
          value={playable}
          onChange={(e) => {
            setPlayable(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部</option>
          <option value="1">仅可播放</option>
          <option value="0">仅元数据（无音源）</option>
        </select>
        <button type="button" className="adm-btn" onClick={() => void load()}>
          刷新
        </button>
      </div>

      {error ? <p className="adm-error">{error}</p> : null}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>歌曲</th>
              <th>歌手</th>
              <th>专辑</th>
              <th>时长</th>
              <th>来源</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((song) => (
              <tr key={song.id}>
                <td>
                  <div className="adm-song-cell">
                    <Cover src={song.cover} name={song.title} size={36} radius={6} />
                    <span>{song.title}</span>
                  </div>
                </td>
                <td>{song.artist}</td>
                <td className="adm-dim">{song.album || '—'}</td>
                <td className="adm-dim">{formatDuration(song.duration)}</td>
                <td>
                  <span className="adm-tag is-muted">{SOURCE_LABEL[song.source] || song.source}</span>
                </td>
                <td>
                  {song.playable ? <span className="adm-tag is-ok">可播放</span> : <span className="adm-tag is-warn">仅元数据</span>}
                  {song.lrc ? <span className="adm-tag is-muted">歌词</span> : null}
                </td>
                <td>
                  <div className="adm-row-actions">
                    <button type="button" className="adm-btn is-sm" onClick={() => setEditing(song)}>
                      编辑
                    </button>
                    {song.externalUrl ? (
                      <a className="adm-btn is-sm" href={song.externalUrl} target="_blank" rel="noreferrer">
                        官方
                      </a>
                    ) : null}
                    <button type="button" className="adm-btn is-sm is-danger" onClick={() => void remove(song)}>
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && !loading ? <p className="adm-empty-note">没有符合条件的曲目</p> : null}
      </div>

      <div className="adm-pager">
        <button type="button" className="adm-btn is-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          上一页
        </button>
        <span>
          {page} / {totalPages}（共 {data.total} 首）
        </span>
        <button type="button" className="adm-btn is-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          下一页
        </button>
      </div>

      {editing ? (
        <div className="adm-modal-mask" onClick={() => setEditing(null)} role="presentation">
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="adm-modal-close" onClick={() => setEditing(null)} aria-label="关闭">
              <CloseIcon size={16} />
            </button>
            <h2>编辑曲目</h2>
            <p className="adm-modal-sub">修改元数据不会影响已下载的音频文件</p>
            <label className="adm-field">
              <span>歌名</span>
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <label className="adm-field">
              <span>歌手</span>
              <input value={editing.artist} onChange={(e) => setEditing({ ...editing, artist: e.target.value })} />
            </label>
            <label className="adm-field">
              <span>专辑</span>
              <input value={editing.album} onChange={(e) => setEditing({ ...editing, album: e.target.value })} />
            </label>
            <label className="adm-field">
              <span>官方外链（无音源时跳转）</span>
              <input value={editing.externalUrl} onChange={(e) => setEditing({ ...editing, externalUrl: e.target.value })} />
            </label>
            <label className="adm-check">
              <input
                type="checkbox"
                checked={editing.playable}
                onChange={(e) => setEditing({ ...editing, playable: e.target.checked })}
              />
              <span>标记为可播放</span>
            </label>
            <button type="button" className="adm-btn is-primary is-block" onClick={() => void saveEdit()}>
              保存
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ────────────────────────── 账号管理 ────────────────────────── */

interface UserFormState {
  mode: 'create' | 'edit';
  id?: number;
  username: string;
  nickname: string;
  role: Role;
  password: string;
}

function UsersTab({ current, onSelfChanged }: { current: AdminUser; onSelfChanged: (user: AdminUser) => void }) {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [form, setForm] = useState<UserFormState | null>(null);
  const [pwdTarget, setPwdTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.users();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '读取账号失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 当前登录者的角色以服务端返回为准（JWT 里的 role 可能与库中不一致）
  const selfRole = items.find((u) => u.id === current.id)?.role ?? current.role;
  const isSuper = selfRole === 'superadmin';
  const superCount = items.filter((u) => u.role === 'superadmin').length;
  const adminCount = items.filter((u) => u.role === 'admin').length;

  const filtered = items.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    return u.username.toLowerCase().includes(q) || u.nickname.toLowerCase().includes(q);
  });

  /**
   * 前端预判某个操作是否被允许，用于禁用按钮并给出原因。
   * 真正的裁决仍在后端（checkRoleChange），这里只是避免用户点了才报错。
   */
  const reasonFor = (user: AdminUser, action: 'role' | 'password' | 'delete'): string => {
    const isSelf = user.id === current.id;
    if (action === 'role') {
      if (isSelf) return '不能修改自己的角色';
      if (user.role === 'superadmin') return '超级管理员不能被降级';
      if (!isSuper) return '只有超级管理员可以授予或撤销管理员权限';
      return '';
    }
    if (action === 'password') {
      if (user.role !== 'user' && !isSuper) return '只有超级管理员可以重置管理员账号的密码';
      return '';
    }
    if (action === 'delete') {
      if (isSelf) return '不能删除当前登录账号';
      if (user.role === 'superadmin') return '超级管理员不能被删除';
      if (user.role === 'admin' && !isSuper) return '只有超级管理员可以删除管理员账号';
      if (user.role === 'admin' && adminCount <= 1) return '至少要保留一个管理员';
      return '';
    }
    return '';
  };

  const submitForm = async () => {
    if (!form) return;
    setError('');
    setNotice('');
    try {
      if (form.mode === 'create') {
        await adminApi.createUser({
          username: form.username,
          password: form.password,
          nickname: form.nickname,
          role: form.role,
        });
        setNotice(`已创建账号「${form.username}」（${ROLE_META[form.role].text}）`);
      } else if (form.id) {
        const { user } = await adminApi.updateUser(form.id, { nickname: form.nickname, role: form.role });
        if (user.id === current.id) onSelfChanged({ ...current, nickname: user.nickname, role: user.role });
        setNotice(`已更新账号「${user.username}」`);
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    }
  };

  const submitPassword = async () => {
    if (!pwdTarget) return;
    setError('');
    setNotice('');
    try {
      await adminApi.resetPassword(pwdTarget.id, newPassword);
      setNotice(`已重置「${pwdTarget.username}」的密码`);
      setPwdTarget(null);
      setNewPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '重置失败');
    }
  };

  /** 设置角色：user / admin / superadmin 之间的切换 */
  const setRole = async (user: AdminUser, nextRole: Role) => {
    setError('');
    setNotice('');
    try {
      const { user: updated } = await adminApi.updateUser(user.id, { role: nextRole });
      if (updated.id === current.id) onSelfChanged({ ...current, role: updated.role });
      setNotice(`「${user.username}」已设为${ROLE_META[nextRole].text}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败');
    }
  };

  const remove = async (user: AdminUser) => {
    if (!window.confirm(`确认删除账号「${user.username}」？该操作不可恢复。`)) return;
    setError('');
    setNotice('');
    try {
      await adminApi.deleteUser(user.id);
      setNotice(`已删除账号「${user.username}」`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除失败');
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-filters">
        <button
          type="button"
          className="adm-btn is-primary"
          onClick={() => setForm({ mode: 'create', username: '', nickname: '', role: 'user', password: '' })}
        >
          <PlusIcon size={15} />
          新建账号
        </button>
        <button type="button" className="adm-btn" onClick={() => void load()}>
          刷新
        </button>
        <input
          className="adm-input adm-search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索账号或昵称"
        />
        <select className="adm-input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">全部角色</option>
          <option value="superadmin">超级管理员</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
        <span className="adm-dim adm-user-summary">
          共 {items.length} 个账号 · {superCount} 个超管 · {adminCount} 个管理员 · 当前登录：
          {current.nickname}（{ROLE_META[selfRole].text}）
        </span>
      </div>

      {error ? <p className="adm-error">{error}</p> : null}
      {notice ? <p className="adm-hint">{notice}</p> : null}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>账号</th>
              <th>昵称</th>
              <th>角色</th>
              <th>注册时间</th>
              <th>最后登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const isSelf = item.id === current.id;
              const meta = ROLE_META[item.role];
              const nextRole: Role = item.role === 'user' ? 'admin' : 'user';
              const roleReason = reasonFor(item, 'role');
              const pwdReason = reasonFor(item, 'password');
              const delReason = reasonFor(item, 'delete');
              return (
                <tr key={item.id}>
                  <td>
                    <div className="adm-song-cell">
                      <span className="avatar avatar-sm">{item.nickname.slice(0, 1)}</span>
                      <span>
                        {item.username}
                        {isSelf ? <span className="adm-tag is-ok">当前登录</span> : null}
                      </span>
                    </div>
                  </td>
                  <td>{item.nickname}</td>
                  <td>
                    <span className={`adm-tag ${meta.tone}`}>{meta.text}</span>
                  </td>
                  <td className="adm-dim">{formatDateTime(item.createdAt)}</td>
                  <td className="adm-dim">{formatDateTime(item.lastLoginAt)}</td>
                  <td>
                    <div className="adm-row-actions">
                      <button
                        type="button"
                        className="adm-btn is-sm"
                        onClick={() =>
                          setForm({
                            mode: 'edit',
                            id: item.id,
                            username: item.username,
                            nickname: item.nickname,
                            role: item.role,
                            password: '',
                          })
                        }
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="adm-btn is-sm"
                        disabled={Boolean(roleReason)}
                        title={roleReason || (nextRole === 'admin' ? '授予管理员权限' : '降为普通用户')}
                        onClick={() => void setRole(item, nextRole)}
                      >
                        {item.role === 'user' ? '设为管理员' : '降为普通'}
                      </button>
                      {/* 超管专属：把管理员提升为超级管理员 */}
                      {isSuper && item.role === 'admin' ? (
                        <button
                          type="button"
                          className="adm-btn is-sm"
                          title="提升为超级管理员（可授予/撤销管理员权限）"
                          onClick={() => void setRole(item, 'superadmin')}
                        >
                          设为超管
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="adm-btn is-sm"
                        disabled={Boolean(pwdReason)}
                        title={pwdReason}
                        onClick={() => {
                          setPwdTarget(item);
                          setNewPassword('');
                        }}
                      >
                        改密码
                      </button>
                      <button
                        type="button"
                        className="adm-btn is-sm is-danger"
                        disabled={Boolean(delReason)}
                        title={delReason}
                        onClick={() => void remove(item)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && !loading ? (
          <p className="adm-empty-note">{items.length ? '没有匹配的账号' : '还没有账号'}</p>
        ) : null}
      </div>

      <p className="adm-empty-note adm-note-left">
        这里列出**全部账号**，包括音乐站主站注册的普通用户（主站与管理台共用同一张 users 表）。
        权限规则：只有<strong>超级管理员</strong>能授予或撤销管理员权限；超级管理员自身不可被降级或删除；
        系统始终保留至少一个超级管理员。
      </p>

      {form ? (
        <div className="adm-modal-mask" onClick={() => setForm(null)} role="presentation">
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="adm-modal-close" onClick={() => setForm(null)} aria-label="关闭">
              <CloseIcon size={16} />
            </button>
            <h2>{form.mode === 'create' ? '新建账号' : `编辑账号：${form.username}`}</h2>
            <p className="adm-modal-sub">
              {form.mode === 'create'
                ? '可直接指定角色；只有超级管理员能创建管理员账号'
                : '账号名不可修改'}
            </p>

            {form.mode === 'create' ? (
              <label className="adm-field">
                <span>账号</span>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="2-16 位中文、字母、数字或下划线"
                />
              </label>
            ) : null}

            <label className="adm-field">
              <span>昵称</span>
              <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="选填" />
            </label>

            {form.mode === 'create' ? (
              <label className="adm-field">
                <span>初始密码</span>
                <input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="至少 6 位"
                />
              </label>
            ) : null}

            <label className="adm-field">
              <span>角色</span>
              <select
                className="adm-input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {isSuper ? <option value="superadmin">超级管理员（可授予/撤销管理员）</option> : null}
                <option value="admin" disabled={!isSuper}>
                  管理员{isSuper ? '' : '（需要超级管理员权限）'}
                </option>
                <option value="user">普通用户</option>
              </select>
            </label>

            <button type="button" className="adm-btn is-primary is-block" onClick={() => void submitForm()}>
              {form.mode === 'create' ? '创建账号' : '保存修改'}
            </button>
          </div>
        </div>
      ) : null}

      {pwdTarget ? (
        <div className="adm-modal-mask" onClick={() => setPwdTarget(null)} role="presentation">
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="adm-modal-close" onClick={() => setPwdTarget(null)} aria-label="关闭">
              <CloseIcon size={16} />
            </button>
            <h2>重置密码</h2>
            <p className="adm-modal-sub">
              账号：{pwdTarget.username}
              {pwdTarget.id === current.id ? '（这是你自己，可直接把默认密码改掉）' : ''}
            </p>
            <label className="adm-field">
              <span>新密码</span>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
                autoFocus
              />
            </label>
            <button type="button" className="adm-btn is-primary is-block" onClick={() => void submitPassword()}>
              确认重置
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
