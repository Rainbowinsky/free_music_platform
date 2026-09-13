import type { Song } from '../types';

/**
 * 播放队列的下标运算
 *
 * 这些逻辑单独抽出来有两个原因：
 *   1. 队列里可能同时存在"当前曲目"和"被操作曲目"，两者的下标会互相影响，
 *      混在 store 里很容易算错，单独放一处便于推敲和测试；
 *   2. 不依赖 Audio / window，可以直接跑单元测试。
 */

/** 按 id 找某首歌在队列中的位置，找不到返回 -1 */
export function indexOfSong(queue: Song[], songId: string | undefined): number {
  if (!songId) return -1;
  return queue.findIndex((item) => item.id === songId);
}

/**
 * 「下一首播放」：把 song 插到当前曲目之后。
 *
 * 队列里已经有这首歌时先摘出来再插，避免出现两条重复；
 * 摘除位置在当前曲目之前时，当前曲目的下标会前移一位，插入点要相应回退。
 */
export function insertAfterCurrent(queue: Song[], currentId: string | undefined, song: Song): Song[] {
  const next = [...queue];
  const existing = indexOfSong(next, song.id);
  const currentIndex = indexOfSong(next, currentId);

  let insertAt: number;
  if (existing >= 0) {
    next.splice(existing, 1);
    const shifted = existing < currentIndex ? currentIndex - 1 : currentIndex;
    insertAt = shifted + 1;
  } else {
    // 没有正在播放的曲目时追加到队尾
    insertAt = currentIndex < 0 ? next.length : currentIndex + 1;
  }

  next.splice(insertAt, 0, song);
  return next;
}

/** 把 from 位置的曲目拖到 to 位置；下标非法或原地不动时返回原数组 */
export function moveInQueue(queue: Song[], from: number, to: number): Song[] {
  if (from === to) return queue;
  if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return queue;
  const next = [...queue];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
