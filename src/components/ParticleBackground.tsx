import { useEffect, useRef } from 'react';

/**
 * 登录/注册弹窗的动态粒子背景：
 * - 大号「散景光斑」：径向渐变模拟失焦模糊，缓慢漂移、呼吸明暗
 * - 小号「微尘」：细小亮点，轻微闪烁，增加空间层次
 * - 鼠标视差：光斑随指针轻微偏移，营造深度
 * - 尊重 prefers-reduced-motion（只渲染一帧静态画面）
 * 纯 Canvas 实现，无依赖，卸载时完整清理。
 */

interface Orb {
  /** 基准位置（0-1 相对坐标） */
  bx: number;
  by: number;
  /** 半径（相对较短边的比例） */
  r: number;
  hue: [number, number, number];
  alpha: number;
  /** 漂移参数 */
  ax: number;
  ay: number;
  speed: number;
  phase: number;
  /** 视差强度 */
  parallax: number;
}

interface Dust {
  bx: number;
  by: number;
  r: number;
  alpha: number;
  speed: number;
  phase: number;
  parallax: number;
}

const PALETTE: Array<[number, number, number]> = [
  [49, 194, 124], // 品牌绿
  [45, 212, 191], // 青
  [56, 132, 255], // 蓝
  [139, 92, 246], // 紫
  [35, 168, 102], // 深绿
];

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

    // 按屏幕面积生成粒子，密度适中
    const orbCount = Math.max(10, Math.min(18, Math.round((window.innerWidth * window.innerHeight) / 110000)));
    const dustCount = Math.max(36, Math.min(80, Math.round((window.innerWidth * window.innerHeight) / 22000)));

    const orbs: Orb[] = Array.from({ length: orbCount }, () => ({
      bx: Math.random(),
      by: Math.random(),
      r: random(0.06, 0.2),
      hue: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      alpha: random(0.1, 0.26),
      ax: random(0.02, 0.09),
      ay: random(0.02, 0.09),
      speed: random(0.00008, 0.00022),
      phase: Math.random() * Math.PI * 2,
      parallax: random(6, 26),
    }));

    const dust: Dust[] = Array.from({ length: dustCount }, () => ({
      bx: Math.random(),
      by: Math.random(),
      r: random(0.6, 1.8),
      alpha: random(0.15, 0.5),
      speed: random(0.0004, 0.0012),
      phase: Math.random() * Math.PI * 2,
      parallax: random(2, 10),
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawOrb = (orb: Orb, t: number) => {
      const base = Math.min(width, height);
      const x = (orb.bx + Math.cos(t * orb.speed + orb.phase) * orb.ax) * width + (mouse.x - 0.5) * orb.parallax;
      const y = (orb.by + Math.sin(t * orb.speed * 1.2 + orb.phase) * orb.ay) * height + (mouse.y - 0.5) * orb.parallax;
      const radius = orb.r * base;
      // 呼吸：alpha 随时间缓慢起伏
      const breathe = 0.75 + 0.25 * Math.sin(t * 0.0004 + orb.phase * 2);
      const [r, g, b] = orb.hue;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${(orb.alpha * breathe).toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${(orb.alpha * 0.45 * breathe).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawDust = (d: Dust, t: number) => {
      // 微尘缓慢上浮，到顶后回到底部
      const drift = (t * d.speed + d.phase) % 1;
      const x = d.bx * width + Math.sin(t * 0.0003 + d.phase) * 8 + (mouse.x - 0.5) * d.parallax;
      const y = (1 - drift) * height + (mouse.y - 0.5) * d.parallax;
      const twinkle = 0.5 + 0.5 * Math.sin(t * 0.001 + d.phase * 3);
      ctx.fillStyle = `rgba(255,255,255,${(d.alpha * twinkle).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = (t: number) => {
      if (!running) return;
      // 鼠标位置缓动逼近，视差更顺滑
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;

      ctx.clearRect(0, 0, width, height);
      // 光斑用叠加混合，交叠处更透亮
      ctx.globalCompositeOperation = 'lighter';
      for (const orb of orbs) drawOrb(orb, t);
      ctx.globalCompositeOperation = 'source-over';
      for (const d of dust) drawDust(d, t);

      if (!reduced) raf = requestAnimationFrame(frame);
    };

    const onPointerMove = (event: PointerEvent) => {
      mouse.tx = event.clientX / window.innerWidth;
      mouse.ty = event.clientY / window.innerHeight;
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    // reduced-motion 模式下 frame 只执行一次（静态画面）
    raf = requestAnimationFrame(frame);

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="particle-bg" aria-hidden="true">
      {/* CSS 极光渐变底层，与 Canvas 光斑叠加出层次 */}
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <div className="aurora aurora-c" />
      <canvas ref={canvasRef} className="particle-canvas" />
      {/* 暗角，让视线聚焦到中央卡片 */}
      <div className="particle-vignette" />
    </div>
  );
}
