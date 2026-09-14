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
  type AdminArtist,
  type AdminAlbum,
  type AdminFeaturedPlaylist,
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

type Tab = 'import' | 'upload' | 'library' | 'artists' | 'albums' | 'featured' | 'users';

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
            <em>Free音乐 · 学习项目</em>
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
          <button type="button" className={`adm-nav-item ${tab === 'artists' ? 'is-active' : ''}`} onClick={() => setTab('artists')}>
            <UserIcon size={17} />
            歌手设置
          </button>
          <button type="button" className={`adm-nav-item ${tab === 'albums' ? 'is-active' : ''}`} onClick={() => setTab('albums')}>
            <MusicNoteIcon size={17} />
            专辑设置
          </button>
          <button type="button" className={`adm-nav-item ${tab === 'featured' ? 'is-active' : ''}`} onClick={() => setTab('featured')}>
            <ListIcon size={17} />
            推荐歌单
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
                    : tab === 'artists'
                      ? '歌手设置'
                      : tab === 'albums'
                        ? '专辑设置'
                        : tab === 'featured'
                          ? '首页推荐歌单'
                          : '账号管理'}
            </h1>
            <p className="adm-sub">
              {tab === 'import'
                ? '输入歌名或「歌名 歌手」，模型会理解查询并裁决候选版本，确认后写入本地曲库'
                : tab === 'upload'
                  ? '上传 MP3、LRC 和封面，读取本地标签与管理员信息完成归档，不依赖在线音乐平台'
                  : tab === 'library'
                    ? '查看、编辑、删除曲库条目；无音源的曲目会标记为「仅元数据」并给出官方跳转'
                    : tab === 'artists'
                      ? '维护歌手展示名称与头像；修改后会同步反映在歌手页和关联歌曲'
                      : tab === 'albums'
                        ? '维护专辑名称、年份和封面；专辑下歌曲会自动关联展示'
                        : tab === 'featured'
                          ? '创建、编辑、隐藏或删除首页推荐歌单，并从现有曲库中选择歌曲'
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
          {tab === 'artists' ? <ArtistsAdminTab onChanged={() => setReloadKey((k) => k + 1)} /> : null}
          {tab === 'albums' ? <AlbumsAdminTab onChanged={() => setReloadKey((k) => k + 1)} /> : null}
          {tab === 'featured' ? <FeaturedPlaylistsTab /> : null}
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
  const [audio, setAudio] = useState<File | null>(null);
  const [lyrics, setLyrics] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [meta, setMeta] = useState({ title: '', artist: '', album: '', year: '' });
  const [history, setHistory] = useState<{ name: string; status: string; message: string; detail?: string }[]>([]);
  const audioRef = useRef<HTMLInputElement>(null);
  const lyricsRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const chooseAudio = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!/\.mp3$/i.test(file.name)) {
      setError('当前完整归档仅支持 MP3 音频');
      return;
    }
    setAudio(file);
    setError('');
  };

  const submit = async () => {
    if (!audio) {
      setError('请先选择 MP3 文件');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.upload({ audio, lyrics, cover, ...meta });
      const tags = (res.tags || {}) as Record<string, unknown>;
      setHistory((prev) => [
        {
          name: audio.name,
          status: res.status,
          message: res.message,
          detail: [
            `歌名：${tags.title ?? '-'}`,
            `歌手：${tags.artist || '-'}`,
            `专辑：${tags.album || '-'}`,
            `年份：${tags.albumYear || '-'}`,
            `时长：${tags.durationSec ? `${tags.durationSec}s` : '-'}`,
            `封面：${tags.cover ? `已获取（${tags.coverSource || 'MP3'}）` : '无'}`,
            `歌词：${tags.lyrics ? `已获取${tags.lyricsLines ? `，${tags.lyricsLines} 行` : ''}` : '无'}`,
            res.upgraded ? '处理方式：补齐已有曲目' : '处理方式：新建曲目',
          ].join(' · '),
        },
        ...prev,
      ]);
      if (res.status === 'success') {
        setAudio(null);
        setLyrics(null);
        setCover(null);
        setMeta({ title: '', artist: '', album: '', year: '' });
        onImported();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `上传失败：${err instanceof Error ? err.message : '请确认后端服务已启动（npm run server）'}`);
    } finally {
      setBusy(false);
      if (audioRef.current) audioRef.current.value = '';
      if (lyricsRef.current) lyricsRef.current.value = '';
      if (coverRef.current) coverRef.current.value = '';
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
          chooseAudio(e.dataTransfer.files);
        }}
        onClick={() => audioRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') audioRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        <input ref={audioRef} type="file" accept="audio/mpeg,.mp3" hidden onChange={(e) => chooseAudio(e.target.files)} />
        <PlusIcon size={26} />
        <p className="adm-drop-title">{audio ? audio.name : '选择或拖入 MP3 音频'}</p>
        <p className="adm-drop-note">
          系统会读取 MP3 标签、内嵌封面和时长；可在下方添加本地 LRC、独立封面或管理员信息，全程不依赖网易云
        </p>
      </div>

      <div className="adm-upload-assets">
        <input ref={lyricsRef} type="file" accept=".lrc,text/plain" hidden onChange={(e) => setLyrics(e.target.files?.[0] || null)} />
        <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => setCover(e.target.files?.[0] || null)} />
        <button type="button" className="adm-asset-picker" onClick={() => lyricsRef.current?.click()} disabled={busy}>
          <strong>{lyrics ? lyrics.name : '添加 LRC 歌词'}</strong>
          <span>{lyrics ? '将优先使用该本地歌词' : '可选，UTF-8 编码且包含时间标签'}</span>
        </button>
        <button type="button" className="adm-asset-picker" onClick={() => coverRef.current?.click()} disabled={busy}>
          <strong>{cover ? cover.name : '添加专辑封面'}</strong>
          <span>{cover ? '将覆盖 MP3 内嵌封面' : '可选，JPG / PNG / WebP，最大 10MB'}</span>
        </button>
      </div>

      <div className="adm-upload-meta">
        <div className="adm-upload-meta-head">
          <strong>管理员自定义信息</strong>
          <span>均为可选；填写后优先于 MP3 标签和 LRC 标签</span>
        </div>
        <div className="adm-upload-meta-grid">
          <label className="adm-field">
            <span>歌名</span>
            <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="标签缺失时填写" />
          </label>
          <label className="adm-field">
            <span>歌手</span>
            <input value={meta.artist} onChange={(e) => setMeta({ ...meta, artist: e.target.value })} placeholder="标签缺失时填写" />
          </label>
          <label className="adm-field">
            <span>专辑</span>
            <input value={meta.album} onChange={(e) => setMeta({ ...meta, album: e.target.value })} placeholder="默认未知专辑" />
          </label>
          <label className="adm-field">
            <span>发行年份</span>
            <input value={meta.year} onChange={(e) => setMeta({ ...meta, year: e.target.value })} placeholder="例如 2003" maxLength={8} />
          </label>
        </div>
      </div>

      <button type="button" className="adm-btn is-primary is-block" disabled={!audio || busy} onClick={() => void submit()}>
        {busy ? '正在解析并归档…' : '开始完整归档'}
      </button>
      <p className="adm-notice">
        信息优先级：管理员填写 &gt; 独立 LRC/封面 &gt; MP3 标签/内嵌封面 &gt; 文件名。若库中已有同名同歌手的仅元数据歌曲，会直接补齐其音频和资源。
      </p>

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

/* ────────────────────────── 歌手 / 专辑设置 ────────────────────────── */

function ArtistsAdminTab({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<AdminArtist[]>([]);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminArtist | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.artists(keyword);
      setItems(res.items);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '读取歌手失败');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      await adminApi.updateArtist(editing.id, { name: editing.name });
      setEditing(null);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存歌手失败');
    }
  };

  const uploadCover = async (file?: File) => {
    if (!editing || !file) return;
    try {
      const { cover } = await adminApi.uploadArtistCover(editing.id, file);
      setEditing({ ...editing, cover });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '上传歌手图片失败');
    } finally {
      if (coverRef.current) coverRef.current.value = '';
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-filters">
        <input className="adm-input" value={keyword} placeholder="按歌手名搜索" onChange={(e) => setKeyword(e.target.value)} />
        <button type="button" className="adm-btn" onClick={() => void load()}>{loading ? '读取中…' : '刷新'}</button>
      </div>
      {error ? <p className="adm-error">{error}</p> : null}
      <div className="adm-entity-grid">
        {items.map((artist) => (
          <article className="adm-entity-card" key={artist.id}>
            <Cover src={artist.cover} name={artist.name} size={68} rounded />
            <div className="adm-entity-info">
              <strong>{artist.name}</strong>
              <span>{artist.songCount} 首歌曲 · {artist.albumCount} 张专辑</span>
            </div>
            <button type="button" className="adm-btn is-sm" onClick={() => setEditing(artist)}>编辑</button>
          </article>
        ))}
      </div>
      {!items.length && !loading ? <p className="adm-empty-note adm-note-left">暂时没有歌手，可先通过搜歌或本地上传创建曲目。</p> : null}

      {editing ? (
        <div className="adm-modal-mask" onClick={() => setEditing(null)} role="presentation">
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="adm-modal-close" onClick={() => setEditing(null)} aria-label="关闭"><CloseIcon size={16} /></button>
            <h2>编辑歌手</h2>
            <div className="adm-cover-editor">
              <Cover src={editing.cover} name={editing.name} size={108} rounded />
              <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => void uploadCover(e.target.files?.[0])} />
              <button type="button" className="adm-btn is-sm" onClick={() => coverRef.current?.click()}>更换图片</button>
            </div>
            <label className="adm-field"><span>歌手名称</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <p className="adm-modal-sub">修改名称会同步更新单歌手曲目的展示；合唱歌曲会保留原署名文本。</p>
            <button type="button" className="adm-btn is-primary is-block" onClick={() => void save()}>保存歌手</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlbumsAdminTab({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<AdminAlbum[]>([]);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminAlbum | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.albums(keyword);
      setItems(res.items);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '读取专辑失败');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      await adminApi.updateAlbum(editing.id, { name: editing.name, year: editing.year });
      setEditing(null);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存专辑失败');
    }
  };

  const uploadCover = async (file?: File) => {
    if (!editing || !file) return;
    try {
      const { cover } = await adminApi.uploadAlbumCover(editing.id, file);
      setEditing({ ...editing, cover });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '上传专辑封面失败');
    } finally {
      if (coverRef.current) coverRef.current.value = '';
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-filters">
        <input className="adm-input" value={keyword} placeholder="按专辑或歌手搜索" onChange={(e) => setKeyword(e.target.value)} />
        <button type="button" className="adm-btn" onClick={() => void load()}>{loading ? '读取中…' : '刷新'}</button>
      </div>
      {error ? <p className="adm-error">{error}</p> : null}
      <div className="adm-entity-grid">
        {items.map((album) => (
          <article className="adm-entity-card" key={album.id}>
            <Cover src={album.cover} name={album.name} size={68} radius={9} />
            <div className="adm-entity-info">
              <strong>{album.name}</strong>
              <span>{album.artistName || '未知歌手'}{album.year ? ` · ${album.year}` : ''} · {album.songCount} 首歌曲</span>
            </div>
            <button type="button" className="adm-btn is-sm" onClick={() => setEditing(album)}>编辑</button>
          </article>
        ))}
      </div>
      {!items.length && !loading ? <p className="adm-empty-note adm-note-left">暂时没有专辑，可先通过搜歌或本地上传创建曲目。</p> : null}

      {editing ? (
        <div className="adm-modal-mask" onClick={() => setEditing(null)} role="presentation">
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="adm-modal-close" onClick={() => setEditing(null)} aria-label="关闭"><CloseIcon size={16} /></button>
            <h2>编辑专辑</h2>
            <p className="adm-modal-sub">归属歌手：{editing.artistName || '未知歌手'}；封面将用于专辑与未设置单曲封面的歌曲展示。</p>
            <div className="adm-cover-editor">
              <Cover src={editing.cover} name={editing.name} size={108} radius={12} />
              <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => void uploadCover(e.target.files?.[0])} />
              <button type="button" className="adm-btn is-sm" onClick={() => coverRef.current?.click()}>更换封面</button>
            </div>
            <label className="adm-field"><span>专辑名称</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="adm-field"><span>发行年份</span><input value={editing.year} maxLength={8} placeholder="例如 2003" onChange={(e) => setEditing({ ...editing, year: e.target.value })} /></label>
            <button type="button" className="adm-btn is-primary is-block" onClick={() => void save()}>保存专辑</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface FeaturedForm {
  id?: string;
  title: string;
  description: string;
  creator: string;
  tags: string;
  playCount: string;
  sortOrder: string;
  visible: boolean;
  songIds: string[];
  cover: string;
}

const emptyFeaturedForm = (): FeaturedForm => ({
  title: '', description: '', creator: 'Free音乐官方', tags: '', playCount: '0', sortOrder: '0', visible: true, songIds: [], cover: '',
});

function FeaturedPlaylistsTab() {
  const [items, setItems] = useState<AdminFeaturedPlaylist[]>([]);
  const [songs, setSongs] = useState<AdminSong[]>([]);
  const [songTotal, setSongTotal] = useState(0);
  const [songPage, setSongPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [songLoading, setSongLoading] = useState(false);
  const [form, setForm] = useState<FeaturedForm | null>(null);
  const [songKeyword, setSongKeyword] = useState('');
  const coverRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const playlists = await adminApi.featuredPlaylists();
      setItems(playlists.items);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '读取推荐歌单失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSongOptions = useCallback(async (keyword = songKeyword, page = songPage) => {
    setSongLoading(true);
    try {
      const library = await adminApi.songs({ keyword, page, size: 50 });
      setSongs(library.items);
      setSongTotal(library.total);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '读取曲库歌曲失败');
    } finally {
      setSongLoading(false);
    }
  }, [songKeyword, songPage]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = (item: AdminFeaturedPlaylist) => {
    setSongKeyword('');
    setSongPage(1);
    setForm({
      id: item.id,
      title: item.title,
      description: item.description,
      creator: item.creator,
      tags: item.tags.join(', '),
      playCount: String(item.playCount),
      sortOrder: String(item.sortOrder),
      visible: item.visible,
      songIds: item.songIds,
      cover: item.cover,
    });
    void loadSongOptions('', 1);
  };

  const save = async () => {
    if (!form || !form.title.trim()) {
      setError('请填写歌单标题');
      return;
    }
    try {
      const payload = {
        title: form.title,
        description: form.description,
        creator: form.creator,
        tags: form.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
        playCount: Number(form.playCount) || 0,
        sortOrder: Number(form.sortOrder) || 0,
        visible: form.visible,
      };
      const result = form.id
        ? await adminApi.updateFeaturedPlaylist(form.id, payload)
        : await adminApi.createFeaturedPlaylist(payload);
      await adminApi.replaceFeaturedPlaylistSongs(result.playlist.id, form.songIds);
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存推荐歌单失败');
    }
  };

  const uploadCover = async (file?: File) => {
    if (!form?.id || !file) return;
    try {
      const { cover } = await adminApi.uploadFeaturedCover(form.id, file);
      setForm({ ...form, cover });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '上传歌单封面失败');
    } finally {
      if (coverRef.current) coverRef.current.value = '';
    }
  };

  const remove = async (item: AdminFeaturedPlaylist) => {
    if (!window.confirm(`确认删除推荐歌单「${item.title}」？此操作不会删除曲库歌曲。`)) return;
    try {
      await adminApi.deleteFeaturedPlaylist(item.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除推荐歌单失败');
    }
  };

  const toggleSong = (sourceId: string) => {
    if (!form) return;
    const exists = form.songIds.includes(sourceId);
    setForm({ ...form, songIds: exists ? form.songIds.filter((id) => id !== sourceId) : [...form.songIds, sourceId] });
  };

  const searchSongOptions = () => {
    const nextPage = 1;
    setSongPage(nextPage);
    void loadSongOptions(songKeyword, nextPage);
  };

  const changeSongPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > Math.max(1, Math.ceil(songTotal / 50))) return;
    setSongPage(nextPage);
    void loadSongOptions(songKeyword, nextPage);
  };

  return (
    <div className="adm-panel">
      <div className="adm-row-actions">
        <button type="button" className="adm-btn is-primary" onClick={() => { setSongKeyword(''); setSongPage(1); setForm(emptyFeaturedForm()); void loadSongOptions('', 1); }}>新建推荐歌单</button>
        <button type="button" className="adm-btn" onClick={() => void load()}>{loading ? '读取中…' : '刷新'}</button>
      </div>
      <p className="adm-notice">首页优先展示这里已发布的歌单；若尚未创建任何推荐歌单，主站会继续展示内置示例歌单。</p>
      {error ? <p className="adm-error">{error}</p> : null}
      <div className="adm-featured-list">
        {items.map((item) => (
          <article className="adm-featured-card" key={item.id}>
            <Cover src={item.cover} name={item.title} size={86} radius={11} />
            <div className="adm-featured-info">
              <div><strong>{item.title}</strong>{!item.visible ? <span className="adm-tag is-warn">已隐藏</span> : <span className="adm-tag is-ok">已发布</span>}</div>
              <p>{item.description || '暂无简介'}</p>
              <span>{item.creator} · {item.songIds.length} 首歌曲 · 排序 {item.sortOrder}</span>
            </div>
            <div className="adm-row-actions"><button type="button" className="adm-btn is-sm" onClick={() => openEdit(item)}>编辑</button><button type="button" className="adm-btn is-sm is-danger" onClick={() => void remove(item)}><TrashIcon size={14} /></button></div>
          </article>
        ))}
      </div>
      {!items.length && !loading ? <p className="adm-empty-note adm-note-left">尚未创建可管理的首页推荐歌单。</p> : null}

      {form ? (
        <div className="adm-modal-mask" onClick={() => setForm(null)} role="presentation">
          <div className="adm-modal adm-featured-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="adm-modal-close" onClick={() => setForm(null)} aria-label="关闭"><CloseIcon size={16} /></button>
            <h2>{form.id ? '编辑推荐歌单' : '新建推荐歌单'}</h2>
            <div className="adm-cover-editor">
              <Cover src={form.cover} name={form.title || '歌单'} size={100} radius={12} />
              {form.id ? <><input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => void uploadCover(e.target.files?.[0])} /><button type="button" className="adm-btn is-sm" onClick={() => coverRef.current?.click()}>上传封面</button></> : <span className="adm-modal-sub">先保存歌单后可上传封面</span>}
            </div>
            <div className="adm-upload-meta-grid">
              <label className="adm-field"><span>标题</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label className="adm-field"><span>创建者</span><input value={form.creator} onChange={(e) => setForm({ ...form, creator: e.target.value })} /></label>
              <label className="adm-field"><span>标签（逗号分隔）</span><input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="流行, 热歌" /></label>
              <label className="adm-field"><span>播放量</span><input value={form.playCount} inputMode="numeric" onChange={(e) => setForm({ ...form, playCount: e.target.value })} /></label>
              <label className="adm-field"><span>首页排序（数字越小越靠前）</span><input value={form.sortOrder} inputMode="numeric" onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
              <label className="adm-check"><input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} /><span>发布到首页</span></label>
            </div>
            <label className="adm-field"><span>简介</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="介绍这个推荐歌单" /></label>
            <div className="adm-song-picker">
              <div className="adm-song-picker-head">
                <strong>选择曲库歌曲（已选 {form.songIds.length} 首）</strong>
                <div className="adm-song-picker-search">
                  <input
                    className="adm-input"
                    value={songKeyword}
                    onChange={(e) => setSongKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchSongOptions(); } }}
                    placeholder="按歌名、歌手或专辑搜索"
                  />
                  <button type="button" className="adm-btn is-sm" onClick={searchSongOptions} disabled={songLoading}>搜索</button>
                </div>
              </div>
              <div className="adm-song-picker-list">
                {songs.map((song) => <label className="adm-song-check" key={song.sourceId}><input type="checkbox" checked={form.songIds.includes(song.sourceId)} onChange={() => toggleSong(song.sourceId)} /><Cover src={song.cover} name={song.title} size={28} radius={5} /><span>{song.title} <em>{song.artist}</em></span></label>)}
                {!songLoading && !songs.length ? <p className="adm-song-picker-empty">没有找到可添加的曲库歌曲</p> : null}
                {songLoading ? <p className="adm-song-picker-empty">正在读取曲库…</p> : null}
              </div>
              <div className="adm-song-picker-page">
                <button type="button" className="adm-btn is-sm" disabled={songLoading || songPage <= 1} onClick={() => changeSongPage(songPage - 1)}>上一页</button>
                <span>第 {songPage} / {Math.max(1, Math.ceil(songTotal / 50))} 页 · 共 {songTotal} 首</span>
                <button type="button" className="adm-btn is-sm" disabled={songLoading || songPage >= Math.max(1, Math.ceil(songTotal / 50))} onClick={() => changeSongPage(songPage + 1)}>下一页</button>
              </div>
            </div>
            <button type="button" className="adm-btn is-primary is-block" onClick={() => void save()}>{form.id ? '保存歌单与歌曲' : '创建歌单'}</button>
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
