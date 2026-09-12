import { useCallback, useEffect, useRef, useState } from 'react';

interface SliderProps {
  /** 非拖动状态下显示的值 */
  value: number;
  max: number;
  /**
   * 拖动过程中的回调：只用来更新 UI 预览，
   * 不要在这里做 seek / setVolume 这类重操作，否则会每帧触发导致音频卡顿。
   */
  onChange?: (value: number) => void;
  /** 松手（或点击、键盘操作）后的回调：真正生效的操作放这里，只会调用一次 */
  onCommit?: (value: number) => void;
  /** 开始按住拖动时触发（可用它暂停播放，实现“松手才切换”） */
  onScrubStart?: () => void;
  tip?: (ratio: number) => string;
  className?: string;
  ariaLabel?: string;
  /** 键盘左右方向键单次调整的步长（value 单位） */
  step?: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 可拖拽的进度/音量条：拖动时本地预览，松手才提交，避免高频 seek */
export default function Slider({
  value,
  max,
  onChange,
  onCommit,
  onScrubStart,
  tip,
  className = '',
  ariaLabel,
  step,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  const onScrubStartRef = useRef(onScrubStart);
  onChangeRef.current = onChange;
  onCommitRef.current = onCommit;
  onScrubStartRef.current = onScrubStart;

  // 拖动中优先用本地比例渲染，因此进度条不依赖 store 的高频更新
  const ratio = dragRatio ?? (max > 0 ? clamp01(value / max) : 0);

  const ratioFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      const next = ratioFromClientX(event.clientX);
      setDragRatio(next);
      onChangeRef.current?.(next * max);
    };
    const handleUp = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove('is-dragging');
      const next = ratioFromClientX(event.clientX);
      setDragRatio(null);
      // 整个拖动过程只在这里真正提交一次
      onCommitRef.current?.(next * max);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [max, ratioFromClientX]);

  const handleDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    document.body.classList.add('is-dragging');
    const next = ratioFromClientX(event.clientX);
    setDragRatio(next);
    onScrubStartRef.current?.();
    onChangeRef.current?.(next * max);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onCommit) return;
    const delta = step ?? max / 20;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onCommit(Math.min(max, value + delta));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onCommit(Math.max(0, value - delta));
    }
  };

  return (
    <div className={`slider ${className}`.trim()}>
      <div
        ref={trackRef}
        className="slider-track"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(value)}
        onPointerDown={handleDown}
        onKeyDown={handleKeyDown}
        onPointerMove={(event) => {
          if (!draggingRef.current) setHoverRatio(ratioFromClientX(event.clientX));
        }}
        onPointerLeave={() => setHoverRatio(null)}
      >
        <div className="slider-rail" />
        <div className="slider-fill" style={{ width: `${ratio * 100}%` }} />
        <div className="slider-thumb" style={{ left: `${ratio * 100}%` }} />
        {hoverRatio !== null && tip && dragRatio === null ? (
          <div className="slider-tip" style={{ left: `${hoverRatio * 100}%` }}>
            {tip(hoverRatio)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
