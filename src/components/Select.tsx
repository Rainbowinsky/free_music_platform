import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronRightIcon } from './Icons';

export interface SelectOption {
  value: string;
  label: string;
  /** 选项右侧的小标签，例如「即将上线」 */
  tag?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** 按钮上的前缀，例如「排序」 */
  prefix?: string;
  ariaLabel: string;
}

/**
 * 自绘下拉选择器。
 *
 * 原生 <select> 的下拉面板样式由系统接管，深色主题下无法保持一致观感，
 * 也做不了展开动画，所以 album 页的排序换成了它。
 * 面板始终挂载、用 class 切换可见性 —— 这样展开与收起两个方向都有过渡动画。
 */
export default function Select({ value, options, onChange, prefix, ariaLabel }: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // 收起后把焦点还给触发按钮，键盘用户不会「丢焦点」
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        {prefix ? <span className="select-prefix">{prefix}</span> : null}
        <span className="select-value">{current?.label}</span>
        {current?.tag ? <span className="select-tag">{current.tag}</span> : null}
        {/* 没有现成的向下箭头图标，用右箭头旋转 90° 代替，展开时转回 */}
        <ChevronRightIcon size={13} className="select-arrow" />
      </button>

      <div className="select-menu" role="listbox" aria-label={ariaLabel}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            className={`select-option ${option.value === value ? 'is-active' : ''}`}
            onClick={() => {
              setOpen(false);
              // 已选中的项不重复回调，避免无意义的请求与重渲染
              if (!option.disabled && option.value !== value) onChange(option.value);
            }}
          >
            <span className="select-option-label">{option.label}</span>
            {option.tag ? <span className="select-tag">{option.tag}</span> : null}
            {option.value === value ? <CheckIcon size={14} className="select-check" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
