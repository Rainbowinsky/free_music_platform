import { useEffect } from 'react';
import { usePlayer } from '../store/player';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';

/**
 * 全局播放快捷键
 *
 *   Space        播放 / 暂停
 *   ← / →        快退 / 快进 5 秒
 *   ↑ / ↓        音量 ±5%
 *   M            静音开关
 *   L            展开 / 收起全屏歌词
 *   T            显示 / 隐藏歌词译文
 *
 * 以下情况不接管按键，避免干扰用户：
 *   - 焦点在输入框 / 文本域 / 下拉框 / contenteditable 里（例如搜索框、歌单重命名）
 *   - 按下了 Ctrl / Cmd / Alt（留给浏览器与系统快捷键）
 *   - 有弹窗打开（登录、新建歌单、添加到歌单）
 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const SEEK_STEP = 5;
const VOLUME_STEP = 0.05;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  return target.isContentEditable;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditable(event.target)) return;

      const auth = useAuth.getState();
      const ui = useUi.getState();
      if (auth.modalOpen || ui.addSongId || ui.playlistModal) return;

      const player = usePlayer.getState();

      switch (event.code) {
        case 'Space':
          // 焦点在按钮上时，空格默认会再触发一次该按钮，必须拦掉
          event.preventDefault();
          player.toggle();
          break;

        case 'ArrowLeft':
          if (!player.current) return;
          event.preventDefault();
          player.seek(Math.max(0, player.progress - SEEK_STEP));
          break;

        case 'ArrowRight':
          if (!player.current) return;
          event.preventDefault();
          player.seek(player.progress + SEEK_STEP);
          break;

        case 'ArrowUp':
          event.preventDefault();
          player.setVolume(player.volume + VOLUME_STEP);
          break;

        case 'ArrowDown':
          event.preventDefault();
          player.setVolume(player.volume - VOLUME_STEP);
          break;

        case 'KeyM':
          player.toggleMute();
          break;

        case 'KeyL':
          player.setLyricsOpen(!player.lyricsOpen);
          break;

        case 'KeyT':
          useUi.getState().toggleTranslation();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
