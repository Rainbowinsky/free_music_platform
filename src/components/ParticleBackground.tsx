import { useEffect, useRef } from 'react';

/**
 * 登录/注册弹窗的动态背景：
 * - 大号「散景光斑」：径向渐变模拟失焦模糊，缓慢漂移、呼吸明暗
 * - 「雨丝」：细密雨滴从画面上方落下，长短快慢随深度分层，模拟夜间降雨
 * - 鼠标视差：光斑与雨滴随指针轻微偏移，营造深度
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

interface Drop {
  /** 横向基准位置（0-1） */
  bx: number;
  /** 下落相位（错峰出发） */
  phase: number;
  /** 下落速度（占屏高比例/毫秒） */
  speed: number;
  /** 雨丝长度（px） */
  len: number;
  /** 线宽（px） */
  lw: number;
  /** 头部亮度 */
  alpha: number;
  /** 轻微横向摆动幅度 */
  sway: number;
  /** 视差强度 */
  parallax: number;
}

const PALETTE: Array<[number, number, number]> = [
  [49, 194, 124], // 品牌绿
  [45, 212, 191], // 青
  [56, 132, 255], // 蓝
  [139, 92, 246], // 紫
  [35, 168, 102], // 深绿
];

/** 雨丝的轻微倾斜，模拟微风 */
const RAIN_SLANT = 0.12;

/** 雨丝颜色：带一点绿意的白 */
const DROP_RGB = '199, 236, 218';

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

    // 按屏幕面积生成粒子
    const orbCount = Math.max(10, Math.min(18, Math.round((window.innerWidth * window.innerHeight) / 110000)));
    // 雨滴密度拉高，模拟下雨
    const dropCount = Math.max(90, Math.min(240, Math.round((window.innerWidth * window.innerHeight) / 8500)));

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

    // 用同一个「深度」驱动长短/粗细/速度/亮度：近处的雨丝更长、更快、更亮
    const drops: Drop[] = Array.from({ length: dropCount }, () => {
      const depth = Math.random();
      return {
        bx: Math.random(),
        phase: Math.random(),
        speed: 0.0005 + depth * 0.0011,
        len: 9 + depth * 17,
        lw: 0.8 + depth * 0.9,
        alpha: 0.1 + depth * 0.32,
        sway: random(2, 10),
        parallax: random(4, 14),
      };
    });

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

    const drawDrop = (d: Drop, t: number) => {
      // 从画面上方落到下方，越界后回顶部重新出发
      const fall = (t * d.speed + d.phase) % 1;
      const x = d.bx * width + Math.sin(t * 0.00018 + d.phase * 7) * d.sway + (mouse.x - 0.5) * d.parallax;
      const y = fall * (height + d.len * 2) - d.len;
      const tailX = x - RAIN_SLANT * d.len;
      const tailY = y - d.len;
      // 尾部透明、头部更亮，呈雨丝拖尾
      const grad = ctx.createLinearGradient(tailX, tailY, x, y);
      grad.addColorStop(0, `rgba(${DROP_RGB}, 0)`);
      grad.addColorStop(1, `rgba(${DROP_RGB}, ${d.alpha.toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = d.lw;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.stroke();
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
      ctx.lineCap = 'round';
      for (const d of drops) drawDrop(d, t);

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
