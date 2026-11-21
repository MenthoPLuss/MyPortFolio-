/**
 * HONEST ABSTRACT COVERS, generated procedurally on a canvas.
 * Used only when no real screenshot exists in public/assets/projects/<slug>/.
 * They are illustrations of the idea — never fake product UI.
 *   jecverse  → campus map lines + isometric blocks
 *   plugora   → charger network nodes
 *   m-phish   → network / shield graph
 *   tender-ai → document pages with analysis highlights
 */

type Ctx = CanvasRenderingContext2D;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bg(ctx: Ctx, w: number, h: number, a: string, b: string, glow: string) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = ctx.createRadialGradient(w * 0.62, h * 0.45, 0, w * 0.62, h * 0.45, w * 0.6);
  r.addColorStop(0, glow);
  r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
}

function grain(ctx: Ctx, w: number, h: number, rand: () => number, amount = 0.05) {
  ctx.save();
  ctx.globalAlpha = amount;
  for (let i = 0; i < (w * h) / 90; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(rand() * w, rand() * h, 1, 1);
  }
  ctx.restore();
}

/* ---------------- JECVERSE ---------------- */
function jecverse(ctx: Ctx, w: number, h: number) {
  const r = rng(11);
  bg(ctx, w, h, '#06142e', '#0b2f45', 'rgba(40,200,220,0.22)');
  const cx = w * 0.52;
  const cy = h * 0.5;
  const s = w / 26;
  const iso = (x: number, y: number, z = 0): [number, number] => [
    cx + (x - y) * s * 0.866,
    cy + (x + y) * s * 0.5 - z * s,
  ];
  // ground grid (map lines)
  ctx.lineWidth = 1;
  for (let i = -12; i <= 12; i++) {
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(90,220,235,0.32)' : 'rgba(90,180,235,0.10)';
    let [x1, y1] = iso(i, -12);
    let [x2, y2] = iso(i, 12);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    [x1, y1] = iso(-12, i);
    [x2, y2] = iso(12, i);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // walking paths
  ctx.strokeStyle = 'rgba(255,190,90,0.85)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  const path: [number, number][] = [[-10, 3], [-5, 3], [-5, -2], [1, -2], [1, 4], [7, 4], [7, -6]];
  path.forEach(([x, y], i) => {
    const [px, py] = iso(x, y);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  // isometric blocks (buildings)
  const blocks: [number, number, number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const x = Math.round(-9 + r() * 18);
    const y = Math.round(-9 + r() * 18);
    blocks.push([x, y, 1 + Math.round(r() * 2), 1 + Math.round(r() * 2), 0.6 + r() * 2.6]);
  }
  blocks.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  blocks.forEach(([x, y, bw, bd, bh], i) => {
    const hot = i === 9;
    const top = [iso(x, y, bh), iso(x + bw, y, bh), iso(x + bw, y + bd, bh), iso(x, y + bd, bh)];
    const left = [iso(x, y + bd, 0), iso(x + bw, y + bd, 0), iso(x + bw, y + bd, bh), iso(x, y + bd, bh)];
    const right = [iso(x + bw, y, 0), iso(x + bw, y + bd, 0), iso(x + bw, y + bd, bh), iso(x + bw, y, bh)];
    const poly = (pts: [number, number][], fill: string) => {
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = hot ? 'rgba(255,220,160,0.9)' : 'rgba(140,230,255,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    poly(left, hot ? '#b8612a' : '#0f4a66');
    poly(right, hot ? '#e08a3c' : '#16607f');
    poly(top, hot ? '#ffc278' : '#2a8fb0');
  });
  // location pin glow
  const [px, py] = iso(7, -6, 0);
  const g = ctx.createRadialGradient(px, py, 0, px, py, 46);
  g.addColorStop(0, 'rgba(255,200,120,0.9)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(px - 50, py - 50, 100, 100);
  grain(ctx, w, h, r);
}

/* ---------------- PLUGORA ---------------- */
function plugora(ctx: Ctx, w: number, h: number) {
  const r = rng(23);
  bg(ctx, w, h, '#04161c', '#0b3b33', 'rgba(80,255,170,0.18)');
  const nodes: { x: number; y: number; charger: boolean; s: number }[] = [];
  for (let i = 0; i < 30; i++) {
    nodes.push({ x: w * (0.08 + r() * 0.84), y: h * (0.1 + r() * 0.8), charger: r() < 0.3, s: 8 + r() * 10 });
  }
  const hub = { x: w * 0.55, y: h * 0.5, charger: true, s: 26 };
  nodes.push(hub);
  // links
  nodes.forEach((n, i) => {
    const others = nodes
      .map((m, j) => ({ m, j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    others.forEach(({ m }) => {
      const active = n.charger || m.charger;
      ctx.strokeStyle = active ? 'rgba(120,255,190,0.55)' : 'rgba(120,200,220,0.18)';
      ctx.lineWidth = active ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      const mx = (n.x + m.x) / 2 + (r() - 0.5) * 40;
      const my = (n.y + m.y) / 2 + (r() - 0.5) * 40;
      ctx.quadraticCurveTo(mx, my, m.x, m.y);
      ctx.stroke();
    });
  });
  // nodes = homes; chargers glow + bolt
  nodes.forEach((n) => {
    if (n.charger) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.s * 3.2);
      g.addColorStop(0, 'rgba(140,255,180,0.55)');
      g.addColorStop(1, 'rgba(140,255,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.s * 3.2, n.y - n.s * 3.2, n.s * 6.4, n.s * 6.4);
    }
    // house silhouette
    const s = n.s;
    ctx.beginPath();
    ctx.moveTo(n.x - s, n.y + s * 0.8);
    ctx.lineTo(n.x - s, n.y - s * 0.1);
    ctx.lineTo(n.x, n.y - s);
    ctx.lineTo(n.x + s, n.y - s * 0.1);
    ctx.lineTo(n.x + s, n.y + s * 0.8);
    ctx.closePath();
    ctx.fillStyle = n.charger ? '#0f5a45' : '#0c2c33';
    ctx.fill();
    ctx.strokeStyle = n.charger ? '#9dffc8' : 'rgba(150,220,230,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (n.charger) {
      ctx.fillStyle = '#e8ff7a';
      ctx.beginPath();
      ctx.moveTo(n.x + s * 0.15, n.y - s * 0.55);
      ctx.lineTo(n.x - s * 0.35, n.y + s * 0.15);
      ctx.lineTo(n.x - s * 0.02, n.y + s * 0.15);
      ctx.lineTo(n.x - s * 0.15, n.y + s * 0.65);
      ctx.lineTo(n.x + s * 0.35, n.y - s * 0.05);
      ctx.lineTo(n.x + s * 0.02, n.y - s * 0.05);
      ctx.closePath();
      ctx.fill();
    }
  });
  grain(ctx, w, h, r);
}

/* ---------------- M-PHISH ---------------- */
function mphish(ctx: Ctx, w: number, h: number) {
  const r = rng(37);
  bg(ctx, w, h, '#120612', '#2a0b16', 'rgba(255,70,80,0.20)');
  const cx = w * 0.5;
  const cy = h * 0.5;
  const nodes: { x: number; y: number; bad: boolean }[] = [];
  for (let i = 0; i < 44; i++) {
    const a = r() * Math.PI * 2;
    const d = 110 + r() * Math.min(w, h) * 0.55;
    nodes.push({ x: cx + Math.cos(a) * d * 1.45, y: cy + Math.sin(a) * d * 0.85, bad: r() < 0.22 });
  }
  // edges to centre + neighbours
  nodes.forEach((n, i) => {
    ctx.strokeStyle = n.bad ? 'rgba(255,90,90,0.45)' : 'rgba(255,190,200,0.12)';
    ctx.lineWidth = n.bad ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    const m = nodes[(i * 7 + 3) % nodes.length];
    ctx.strokeStyle = 'rgba(255,170,180,0.10)';
    ctx.beginPath();
    ctx.moveTo(n.x, n.y);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
  });
  nodes.forEach((n) => {
    ctx.fillStyle = n.bad ? '#ff4d5e' : '#f3c9cf';
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.bad ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (n.bad) {
      ctx.strokeStyle = 'rgba(255,77,94,0.6)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // shield
  const s = Math.min(w, h) * 0.24;
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.bezierCurveTo(cx + s * 0.6, cy - s * 0.78, cx + s * 0.82, cy - s * 0.82, cx + s * 0.86, cy - s * 0.7);
    ctx.bezierCurveTo(cx + s * 0.9, cy + s * 0.1, cx + s * 0.5, cy + s * 0.7, cx, cy + s);
    ctx.bezierCurveTo(cx - s * 0.5, cy + s * 0.7, cx - s * 0.9, cy + s * 0.1, cx - s * 0.86, cy - s * 0.7);
    ctx.bezierCurveTo(cx - s * 0.82, cy - s * 0.82, cx - s * 0.6, cy - s * 0.78, cx, cy - s);
    ctx.closePath();
  };
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.6);
  g.addColorStop(0, 'rgba(255,120,110,0.35)');
  g.addColorStop(1, 'rgba(255,120,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - s * 2, cy - s * 2, s * 4, s * 4);
  shield();
  ctx.fillStyle = 'rgba(40,8,18,0.85)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffb0a8';
  ctx.stroke();
  // check / scan lines inside shield
  ctx.save();
  shield();
  ctx.clip();
  for (let y = cy - s; y < cy + s; y += 7) {
    ctx.fillStyle = `rgba(255,140,140,${0.05 + 0.08 * Math.abs(Math.sin(y * 0.05))})`;
    ctx.fillRect(cx - s, y, s * 2, 2);
  }
  ctx.restore();
  ctx.strokeStyle = '#ffd7a8';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.32, cy + s * 0.02);
  ctx.lineTo(cx - s * 0.06, cy + s * 0.28);
  ctx.lineTo(cx + s * 0.38, cy - s * 0.24);
  ctx.stroke();
  grain(ctx, w, h, r);
}

/* ---------------- tender.ai ---------------- */
function tender(ctx: Ctx, w: number, h: number) {
  const r = rng(53);
  bg(ctx, w, h, '#17100a', '#3a2510', 'rgba(255,190,90,0.22)');
  const pages = 5;
  for (let p = 0; p < pages; p++) {
    const pw = w * 0.28;
    const ph = pw * 1.32;
    const x = w * 0.16 + p * w * 0.13;
    const y = h * 0.5 - ph / 2 + (p % 2 ? 18 : -14);
    const rot = (p - 2) * 0.06;
    ctx.save();
    ctx.translate(x + pw / 2, y + ph / 2);
    ctx.rotate(rot);
    ctx.translate(-pw / 2, -ph / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = p === pages - 1 ? '#f6efe2' : `rgba(236,226,208,${0.55 + p * 0.08})`;
    ctx.fillRect(0, 0, pw, ph);
    ctx.shadowBlur = 0;
    // header block
    ctx.fillStyle = 'rgba(60,45,30,0.75)';
    ctx.fillRect(pw * 0.1, ph * 0.07, pw * 0.5, ph * 0.035);
    // text lines + highlights
    for (let i = 0; i < 20; i++) {
      const ly = ph * 0.15 + i * ph * 0.04;
      const lw = pw * (0.55 + r() * 0.3);
      const hl = p === pages - 1 && (i === 3 || i === 4 || i === 9 || i === 14 || i === 15);
      if (hl) {
        ctx.fillStyle = i >= 14 ? 'rgba(80,200,255,0.55)' : 'rgba(255,196,40,0.7)';
        ctx.fillRect(pw * 0.08, ly - 3, lw + pw * 0.04, ph * 0.028);
      }
      ctx.fillStyle = 'rgba(70,58,44,0.55)';
      ctx.fillRect(pw * 0.1, ly, lw, ph * 0.012);
    }
    ctx.restore();
  }
  // scan beam
  const sx = w * 0.78;
  const g = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
  g.addColorStop(0, 'rgba(255,210,120,0)');
  g.addColorStop(0.5, 'rgba(255,210,120,0.35)');
  g.addColorStop(1, 'rgba(255,210,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(sx - 60, 0, 120, h);
  grain(ctx, w, h, r);
}

const DRAW: Record<string, (ctx: Ctx, w: number, h: number) => void> = {
  jecverse,
  plugora,
  'm-phish': mphish,
  'tender-ai': tender,
};

export function drawCover(slug: string, w = 1024, h = 640, target?: HTMLCanvasElement): HTMLCanvasElement {
  const c = target ?? document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  (DRAW[slug] ?? jecverse)(ctx, w, h);
  return c;
}

/** Small, blurred version used for the ghost copies floating in the corridor. */
export function blurredCover(src: HTMLCanvasElement, w = 96): HTMLCanvasElement {
  const h = Math.round((w * src.height) / src.width);
  const small = document.createElement('canvas');
  small.width = Math.max(8, w >> 2);
  small.height = Math.max(5, h >> 2);
  small.getContext('2d')!.drawImage(src, 0, 0, small.width, small.height);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);
  return out;
}
