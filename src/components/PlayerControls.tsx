import { useState } from 'react';
import Slider from './Slider';
import {
  ListIcon,
  LoopIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RandomIcon,
  SingleIcon,
  VolumeIcon,
  VolumeMuteIcon,
} from './Icons';
import { playModeLabel, usePlayer } from '../store/player';
import { formatTime } from '../utils/format';
import type { PlayMode } from '../types';

const MODE_ICON: Record<PlayMode, (props: { size?: number }) => JSX.Element> = {
  loop: LoopIcon,
  single: SingleIcon,
  random: RandomIcon,
};

/** 播放控制按钮：模式 / 上一首 / 播放暂停 / 下一首 / 队列 */
export function ControlButtons() {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const mode = usePlayer((s) => s.mode);
  const drawerOpen = usePlayer((s) => s.drawerOpen);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const cycleMode = usePlayer((s) => s.cycleMode);
  const setDrawer = usePlayer((s) => s.setDrawer);
  const ModeIcon = MODE_ICON[mode];

  return (
    <div className="player-controls">
      <button type="button" className="ctrl" title={playModeLabel[mode]} onClick={cycleMode}>
        <ModeIcon size={19} />
      </button>
      <button type="button" className="ctrl" title="上一首" onClick={prev}>
        <PrevIcon size={21} />
      </button>
      <button type="button" className="play-btn" title={isPlaying ? '暂停' : '播放'} onClick={toggle}>
        {isPlaying ? <PauseIcon size={21} /> : <PlayIcon size={21} />}
      </button>
      <button type="button" className="ctrl" title="下一首" onClick={() => next()}>
        <NextIcon size={21} />
      </button>
      <button
        type="button"
        className={`ctrl ${drawerOpen ? 'is-active' : ''}`}
        title="播放队列"
        onClick={() => setDrawer(!drawerOpen)}
      >
        <ListIcon size={19} />
      </button>
    </div>
  );
}

/** 进度条 + 时间：拖动时只预览时间且暂停播放，松手才真正跳转并继续（避免杂音与“实时切换”） */
export function ProgressBar() {
  const progress = usePlayer((s) => s.progress);
  const duration = usePlayer((s) => s.duration);
  const current = usePlayer((s) => s.current);
  const seek = usePlayer((s) => s.seek);
  const beginScrub = usePlayer((s) => s.beginScrub);
  const endScrub = usePlayer((s) => s.endScrub);
  const [preview, setPreview] = useState<number | null>(null);

  const total = duration || current?.duration || 0;
  const display = preview ?? progress;

  return (
    <div className="player-progress">
      <span className="player-time">{formatTime(display)}</span>
      <Slider
        className="progress-slider"
        value={progress}
        max={total || 1}
        onChange={setPreview}
        onScrubStart={beginScrub}
        onCommit={(next) => {
          setPreview(null);
          endScrub();
          seek(next);
        }}
        ariaLabel="播放进度"
        tip={(ratio) => formatTime(ratio * (total || 0))}
      />
      <span className="player-time">{formatTime(total)}</span>
    </div>
  );
}

/** 音量 + 队列数量 */
export function VolumeControl({ withQueueCount = true }: { withQueueCount?: boolean }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const queue = usePlayer((s) => s.queue);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);

  return (
    <div className="player-volume">
      {withQueueCount && queue.length ? <span className="queue-count">队列 {queue.length} 首</span> : null}
      <button type="button" className="ctrl" title={muted ? '取消静音' : '静音'} onClick={toggleMute}>
        {muted || volume === 0 ? <VolumeMuteIcon size={19} /> : <VolumeIcon size={19} />}
      </button>
      <Slider
        className="volume-slider"
        value={muted ? 0 : volume}
        max={1}
        onChange={setVolume}
        ariaLabel="音量"
        tip={(ratio) => `${Math.round(ratio * 100)}%`}
      />
    </div>
  );
}

/** 控制按钮 + 进度条（播放条中部、歌词页底部共用） */
export default function PlayerControls() {
  return (
    <div className="player-controls-wrap">
      <ControlButtons />
      <ProgressBar />
    </div>
  );
}
