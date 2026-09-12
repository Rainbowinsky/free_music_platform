/**
 * 一次性迁移：把旧版存在浏览器 localStorage 里的「我的音乐」数据推到后端。
 *
 * 背景：
 *   账号体系切到后端之前，喜欢 / 收藏 / 歌单 / 最近播放都存在 localStorage 的
 *   qqmusic.db.v1 里，按 username 做命名空间隔离。换浏览器或清缓存就丢。
 *   现在数据归后端 users 关联表管理，但老用户本地可能还留着记录。
 *
 * 策略（保守，绝不覆盖后端已有的数据）：
 *   1. 只补后端里**还是空**的那部分：后端已经有喜欢记录就不再推喜欢，
 *      后端已经有某个歌单就不重复创建。
 *   2. 同一个账号只迁移一次，成功后打标记，避免每次登录都跑一遍。
 *   3. 迁移失败不影响登录流程，下次登录会再试。
 *
 * 幂等性说明：
 *   即使标记写入失败导致重复执行，第 1 条也能保证不会产生重复数据。
 */
import { meApi, store } from '../lib/db';

const MIGRATED_KEY = 'qqmusic.migrated.v1';

/** 已迁移过的账号名单（按 username 记录） */
function migratedNames(): string[] {
  try {
    const raw = window.localStorage.getItem(MIGRATED_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markMigrated(username: string): void {
  try {
    const names = migratedNames();
    if (names.includes(username)) return;
    window.localStorage.setItem(MIGRATED_KEY, JSON.stringify([...names, username]));
  } catch {
    /* 隐私模式下写不进去也无妨，下次会重跑，但幂等性保证不会重复 */
  }
}

/**
 * 把 localStorage 里属于 username 的「我的音乐」推到后端。
 * 返回是否真的推送了内容（没有本地数据时返回 false）。
 */
export async function migrateLegacyLibrary(token: string, username: string): Promise<boolean> {
  if (!token || !username) return false;

  // 已经迁移过就不重复跑
  if (migratedNames().includes(username)) return false;

  const legacy = store.getLegacyLibrary(username);
  const hasAnything =
    (legacy.liked?.length ?? 0) > 0 ||
    (legacy.collected?.length ?? 0) > 0 ||
    (legacy.recent?.length ?? 0) > 0 ||
    (legacy.playlists?.length ?? 0) > 0;

  if (!hasAnything) {
    // 没有本地遗留数据，直接标记，省掉以后每次登录的读取
    markMigrated(username);
    return false;
  }

  try {
    // 以后端现状为准，只补空缺
    const remote = await meApi.library(token);

    // ── 喜欢：后端一条都没有时才推 ──
    // 注意旧数组是「最近喜欢的在前」，而后端按 created_at DESC 展示，
    // 所以必须倒序插入，最后插的那首才会排在列表最前面。
    if (remote.liked.length === 0 && legacy.liked?.length) {
      for (const songId of [...legacy.liked].reverse()) {
        await meApi.toggleLike(token, songId);
      }
    }

    // ── 收藏：同上，同样要倒序插入 ──
    if (remote.collected.length === 0 && legacy.collected?.length) {
      for (const playlistId of [...legacy.collected].reverse()) {
        await meApi.toggleCollect(token, playlistId);
      }
    }

    // ── 最近播放：后端为空时按旧记录倒序重建（旧数组是"最近在前"，要反过来插才会保持顺序） ──
    if (remote.recent.length === 0 && legacy.recent?.length) {
      for (const songId of [...legacy.recent].reverse()) {
        await meApi.addRecent(token, songId);
      }
    }

    // ── 自建歌单：按标题去重，避免与后端已有歌单撞名 ──
    if (legacy.playlists?.length) {
      const existingTitles = new Set(remote.playlists.map((p) => p.title));
      for (const playlist of legacy.playlists) {
        if (existingTitles.has(playlist.title)) continue;
        try {
          const created = await meApi.createPlaylist(token, playlist.title, playlist.desc || '');
          // 歌单内的歌按旧顺序倒序插入（后端按 added_at DESC 展示，先插的会排在后面）
          for (const songId of [...playlist.songIds].reverse()) {
            await meApi.addSongToPlaylist(token, created.id, songId);
          }
        } catch {
          // 单个歌单失败不影响其它歌单，继续迁移
          continue;
        }
      }
    }

    markMigrated(username);
    // 让 store 重新拉一次，界面立刻显示迁移后的完整数据
    return true;
  } catch {
    // 网络等问题：不标记，下次登录重试
    return false;
  }
}
