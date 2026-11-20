'use client';

/**
 * Confeti en un <canvas> encima de todo, sin librerías. Dura ~2,5 s y se borra solo.
 * También vibra suave en el celular. No hace nada si el usuario pidió menos movimiento.
 */
export function confeti() {
  if (typeof window === 'undefined') return;
  navigator.vibrate?.([30, 40, 30]);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const c = document.createElement('canvas');
  c.className = 'confeti';
  c.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  if (!ctx) return c.remove();
  ctx.scale(dpr, dpr);

  const colores = ['#fcd116', '#003893', '#ce1126', '#7f95ff', '#a37bff', '#4fd18a', '#ffb547'];
  const piezas = Array.from({ length: 140 }, (_, i) => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 6,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    color: colores[i % colores.length],
  }));
  const inicio = performance.now();
  const cuadro = (t: number) => {
    const pasado = t - inicio;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of piezas) {
      p.vy += 0.38;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - pasado / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (pasado < 2600) requestAnimationFrame(cuadro);
    else c.remove();
  };
  requestAnimationFrame(cuadro);
}
