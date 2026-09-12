# QQ音乐 Web 复刻版（React + TypeScript）+ 曲库管理后端

一个参考 [QQ音乐](https://y.qq.com/) 视觉与交互风格实现的音乐站，包含登录注册、首页推荐、歌单、收藏、喜欢、搜索、完整播放能力（进度条 / 音量 / 播放模式 / 队列 / 歌词），以及一套**曲库管理台**：用模型辅助裁决版本后自动下载入库、本地上传自动识别归档。

音乐资源全部存放在**本地磁盘**（`public/music`、`public/covers`、`public/lyrics`），MySQL 只保存元数据与相对路径，播放不依赖任何第三方接口。

## 技术栈

| 能力 | 选型 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite 5 + react-router-dom 6 + zustand |
| 样式 | 原生 CSS（CSS 变量 + 分文件组织），无 UI 库 |
| 后端 | Node 22 + Express 5 + mysql2 + JWT + bcryptjs + multer + music-metadata |
| 数据库 | MySQL 8（库名 `qqmusic`，账号见 `server/.env.local`） |
| 模型 | DeepSeek（`deepseek-flash`），只用于查询理解 / 实体归一化 / 版本裁决 |
| 前端账号 | 音乐站主站仍用 localStorage 模拟；管理台走后端真实 JWT + 角色 |

## 快速开始

```bash
npm install        # 若安装脚本被安全策略拦截，可用 npm install --ignore-scripts

npm run server     # 启动曲库后端 → http://127.0.0.1:4000（会自动建库建表）
npm run dev        # 启动前端 → http://127.0.0.1:5173

npm run build      # 类型检查 + 生产构建，产物在 dist/
npm run typecheck  # 仅做 TypeScript 类型检查
```

首次启动后端会自动建库建表，并创建一个管理员：**admin / admin123456**（请及时修改）。
管理台地址：<http://127.0.0.1:5173/admin>

配置在 `server/.env.local`（已被 .gitignore 忽略），可覆盖数据库、端口、模型与 Key：

```ini
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=123456
DB_NAME=qqmusic
PORT=4000
DEEPSEEK_API_KEY=sk-xxxx
DEEPSEEK_MODEL=deepseek-flash
```

## 曲库管理台

进入方式（三处入口，都在主站上）：
- **侧边栏底部**「曲库管理台 →」——始终可见；
- **顶栏**绿色的「管理台」按钮——浏览器里登录过管理台后出现，一键直达；
- **用户下拉菜单**里的「曲库管理台」——登录主站后可见，已登录管理台时会标注「已登录」。

网址：<http://127.0.0.1:5173/admin>（未登录时会先要求用管理台账号登录）

- **搜歌入库**：输入「歌名 歌手」甚至口语化描述（如"周杰伦那首关于妈妈的歌"），后端多源召回候选 → 模型裁决版本 → 展示候选卡片（封面 / 专辑 / 时长 / 体积 / 来源 / 置信度 / 模型理由 / 风险标记），确认后才下载入库；**曲库已有会直接提示**并高亮。
  - **可随时停止**：搜索过程（多源召回 + 音源探测 + 模型裁决）通常 5–12 秒，期间按钮变为红色「停止搜索」，点击后前端中断请求、后端通过 `searchId` 立即中止整条流水线（不再继续消耗模型与音源请求）；服务端另有 40 秒超时兜底（`SEARCH_TIMEOUT_MS` 可配），保证任务不会一直跑。
- **本地上传**：拖入音频文件，自动读取 ID3 标签；标签缺失时用文件名 + 在线检索补全专辑、封面、歌词，并自动归档到对应歌手与专辑；重复上传会命中去重。
- **曲库管理**：列表 / 搜索 / 按"可播放 / 仅元数据"筛选、编辑元数据、删除（同时清理本地文件）。
- **账号管理**：账号列表（角色、注册时间、最后登录）、新建账号并直接指定角色、提升 / 降级管理员、重置密码、删除账号。安全护栏：不能取消自己的管理员权限、不能删除当前登录账号、系统始终保留至少一个管理员。
- **无音源曲目的处理**：条目存在但音源取不到（例如周杰伦在网易云整库缺失）时，候选会被标成 **音源不可用**、置信度封顶 35 且不可入库，可用「仅元数据入库」保留专辑结构 + 官方跳转链接，或走本地上传补齐音频。

### 音源策略（依据实测）

| 源 | 搜索条目 | 音源下载 | 用途 |
| --- | --- | --- | --- |
| 网易云 | ✅ | ✅ 全曲（含 VIP，实测 fee=1 也能取到 12MB 全曲） | 主力入库源 |
| 酷狗 / QQ音乐 | ✅（含网易云缺失的曲目） | ❌ 当前中转解析不通 | 仅用于发现条目与补元数据 |

降级链：**网易云全曲 → 仅元数据 + 官方跳转 → 本地上传归档**。

## 曲库数据流（重要）

```
管理台入库 ──写入──▶ MySQL songs/artists/albums + public/music|covers|lyrics
                              │
前端主站 ◀──GET /api/library/songs──┘   （后端未启动时自动回退 src/data/songs.ts 静态数据）
```

- 前端曲库由 `src/store/catalog.ts` 统一提供：启动时拉一次 `/api/library/songs`，**管理台新入库的歌会立刻出现在首页「最新音乐」、搜索、歌手页里**。
- 老的静态曲库（20 首）通过 `npm run backfill` 一次性登记进 MySQL，之后数据库就是唯一数据源；`src/data/songs.ts` 仅作为后端不可用时的兜底。
- **无音源曲目**（例如周杰伦这类独家版权、库里只有元数据）在列表里会显示「无音源」标签和「官方收听」外链，点击播放会给提示而不是报错。

## 功能一览

- **登录 / 注册**：弹窗式表单，账号校验（2-16 位）、密码长度校验、错误提示、登录态持久化；未登录时点击收藏/喜欢/建歌单会引导登录。
- **首页**：自动轮播 Banner（每日推荐 / 新歌速递 / 摇滚现场）、推荐歌单网格、最新音乐列表、排行榜卡片，均支持直接播放。
- **歌单**：
  - 8 个官方主题歌单（详情页含封面、创建者、标签、播放量、播放全部与收藏）；
  - **创建歌单**：侧边栏「我的歌单」右侧 `+` 或任意弹窗里的「新建歌单」，可填写名称与简介；
  - **编辑歌单**：歌单页「编辑歌单」可改名、改简介、删除歌单；
  - **添加 / 移除歌曲**：歌曲行悬停出现 `+`（添加到歌单），我创建的歌单里悬停出现 `×`（移出歌单）；所有操作都有轻提示反馈。
- **喜欢 / 收藏**：歌曲红心、歌单收藏，均跟随账号保存；侧边栏分「我的歌单」「收藏的歌单」两组。
- **搜索**：顶部搜索框 + 结果页，支持「单曲 / 歌单 / 歌手」三个维度与搜索历史、热门搜索。
- **播放**：底部固定播放条，封面旋转环、红心、上一首/下一首、播放/暂停、**可拖拽进度条（含时间气泡、点击跳转）**、音量条与静音、播放模式（列表循环 / 单曲循环 / 随机播放）。
- **全屏歌词页**（点击播放条左侧的歌曲卡片进入，也可从队列抽屉点「全屏歌词」）：
  - 封面模糊作为背景，**黑胶唱片样式**的旋转封面（暂停时停止旋转）；
  - 歌词按时间轴逐行高亮、自动居中滚动，**点击任意一句可跳转到该时间点**，手动滚动后短暂暂停自动滚动；
  - 顶部歌曲信息 + 喜欢 / 添加到歌单，底部完整播放控制（进度、模式、上一首/下一首、音量）；
  - 支持 `Esc` 或左上角「收起」退出，浏览器返回键同样可以关闭。
- **播放队列抽屉**：队列列表（单曲移除、清空）+ 歌词面板（可点击跳转、一键切到全屏歌词）。
- **深色模式**：顶栏右上角月亮/太阳按钮可切换「浅色 / 深色 / 跟随系统」，选择记在 localStorage；跟随系统时会实时响应系统的深浅色变化；`index.html` 里有内联脚本在首屏渲染前落好主题，深色下刷新不会白屏闪一下。
- **其它**：最近播放（未登录按设备记录、登录后同步账号）、歌手列表与歌手详情、404 页、响应式布局。

## 目录结构

```
src/
├─ components/     # TopBar、Sidebar、PlayerBar、PlayerControls、SongList、QueueDrawer、
│                  # LyricsView（全屏歌词页）、AuthModal、PlaylistModal、AddToPlaylistModal、
│                  # Toaster、Slider、Cover、Icons…
├─ data/           # songs.ts（20 首本地曲库）、playlists.ts（8 个官方歌单）
├─ hooks/          # useRequireLogin（登录守卫）、useLyrics（LRC 加载与解析）
├─ lib/            # db.ts（主站 localStorage 数据层）、adminApi.ts（管理台接口客户端）
├─ pages/          # Home、Search、PlaylistDetail、Likes、Collection、Recent、Ranking、Artists…
│  └─ admin/       # AdminConsole（搜歌入库 / 本地上传 / 曲库管理）
├─ store/          # auth / library / player / ui / theme
├─ styles/         # base / layout / components / pages / lyrics / theme-dark / admin
└─ utils/          # 时间与数字格式化、LRC 解析
server/
├─ .env.local      # 本机配置（数据库、端口、模型 Key），已被 gitignore
└─ src/
   ├─ index.js     # Express 入口：鉴权、曲库 API、管理端 API、静态媒体
   ├─ db.js        # MySQL 连接池 + 建库建表（users/artists/albums/songs/import_tasks）
   ├─ auth.js      # JWT + bcrypt + 角色中间件 + 种子管理员
   ├─ music/       # sources（多源适配）· normalize（实体归一化与打分）· agent（模型裁决）
   │               # importer（候选召回 / 下载入库 / 本地上传归档）
   └─ routes/      # library.js（曲库读）· admin.js（搜索、入库、上传、管理、封面代理）
public/
├─ music/          # 音频（本地存储）
├─ covers/         # 专辑封面
└─ lyrics/         # LRC 歌词
scripts/           # 曲库抓取与数据生成脚本（可选，已生成好数据无需运行）
```

## 音乐资源

`public/` 下的音频、封面、歌词既可由 `scripts/` 的脚本一次性抓取，也可以直接在管理台里搜索入库或本地上传归档：

```bash
node scripts/fetch-songs.mjs 14     # 批量抓取（含封面与歌词）→ scripts/songs.json
node scripts/gen-songs-data.mjs     # 生成 src/data/songs.ts
```

> 资源仅用于本地学习与演示，版权归各权利人所有，请勿用于任何商业用途。

## 说明与后续计划

- 音乐站主站的账号仍是 localStorage 演示实现；**管理台走后端真实 JWT + 角色**（第一个注册的账号或种子 admin 为管理员）。
- 媒体文件全部在本地磁盘，MySQL 只存元数据与相对路径；管理台删歌会同时清理本地文件。
- 后端接口：`/api/health`、`/api/auth/*`、`/api/library/*`（曲库读）、`/api/admin/*`（搜索/入库/上传/管理/封面代理），前端通过 Vite 代理走同源 `/api`。
- 数据表：`users`（账号与角色）、`artists`、`albums`、`songs`（含 `playable` / `external_url` / `source`）、`import_tasks`（入库任务与进度）。
- 播放器使用单例 `HTMLAudioElement`，路由切换时播放不中断；刷新页面会重置播放状态。
- **进度条交互**：按住拖动时音乐 60ms 淡出并暂停、进度条与时间只做预览（不会边拖边切歌、也不会有杂音），**松手才定位一次**并淡入继续播放；原本暂停时拖动则保持暂停。单次定位会先 45ms 淡出、等 `seeked` 后再 90ms 淡入，用来盖住 MP3 解码器定位的预卷残响与切换爆音（`src/store/player.ts` 的 `beginScrub` / `endScrub` / `seek`）。
- 主题通过 `<html data-theme="dark">` + CSS 变量实现（`src/styles/theme-dark.css` 只覆盖变量与少量组件），没有引入任何 UI 库或 CSS-in-JS。
- 后续可扩展：把主站账号迁到后端、入库任务改用 SSE 推送、多歌手（合唱）关系表、歌单封面自选与拖拽排序、MV、评论、每日推荐个性化、移动端适配打磨。

> 本项目仅用于本地学习与非商用演示；音频资源的版权归各权利人所有。曲库管理台只对接公开可访问的音源，不包含任何绕过版权保护的措施。
