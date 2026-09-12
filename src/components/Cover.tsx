import { useState } from 'react';
import { coverInitial, gradientOf } from '../utils/format';

interface CoverProps {
  src?: string;
  name: string;
  size?: number;
  radius?: number;
  className?: string;
  rounded?: boolean;
}

/** 专辑封面：加载失败或缺失时退化为渐变色 + 首字占位 */
export default function Cover({ src, name, size = 48, radius = 6, className = '', rounded = false }: CoverProps) {
  const [broken, setBroken] = useState(false);
  const style = {
    width: size,
    height: size,
    borderRadius: rounded ? '50%' : radius,
    fontSize: Math.max(12, Math.round(size * 0.36)),
  };

  if (!src || broken) {
    return (
      <div
        className={`cover cover-fallback ${className}`.trim()}
        style={{ ...style, background: gradientOf(name) }}
        aria-hidden="true"
      >
        <span>{coverInitial(name)}</span>
      </div>
    );
  }

  return (
    <img
      className={`cover ${className}`.trim()}
      style={style}
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
