/**
 * Chamfered (cut-corner) frame for HTML controls.
 *
 * Inserts two decorative layers into the element:
 *   .chamfer-bg  – translucent fill + backdrop blur, clipped to the polygon
 *   svg.chamfer  – the 1px luminous stroke + small corner accents
 * The element itself is NOT clipped, so focus outlines stay visible.
 * Paths are recomputed in exact pixels on resize (corner cuts never stretch).
 */
export interface Cuts {
  tl?: number;
  tr?: number;
  br?: number;
  bl?: number;
  /** Draw small accent ticks next to cut corners. */
  ticks?: boolean;
}

const NS = 'http://www.w3.org/2000/svg';
const observers = new WeakMap<HTMLElement, ResizeObserver>();

function polygon(w: number, h: number, c: Required<Omit<Cuts, 'ticks'>>, inset = 0): string {
  const i = inset;
  const pts: [number, number][] = [
    [c.tl + i, i],
    [w - c.tr - i, i],
    [w - i, c.tr + i],
    [w - i, h - c.br - i],
    [w - c.br - i, h - i],
    [c.bl + i, h - i],
    [i, h - c.bl - i],
    [i, c.tl + i],
  ];
  return pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}

export function chamfer(el: HTMLElement, cuts: Cuts = {}): void {
  const c = { tl: cuts.tl ?? 0, tr: cuts.tr ?? 0, br: cuts.br ?? 0, bl: cuts.bl ?? 0 };
  el.classList.add('chamfered');

  const bg = document.createElement('span');
  bg.className = 'chamfer-bg';
  bg.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'chamfer');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const stroke = document.createElementNS(NS, 'polygon');
  stroke.setAttribute('class', 'chamfer__stroke');
  svg.appendChild(stroke);
  const ticks = document.createElementNS(NS, 'path');
  ticks.setAttribute('class', 'chamfer__ticks');
  if (cuts.ticks) svg.appendChild(ticks);

  el.prepend(svg);
  el.prepend(bg);

  const update = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    stroke.setAttribute('points', polygon(w, h, c, 0.5));
    bg.style.clipPath = `polygon(${polygon(w, h, c)
      .split(' ')
      .map((p) => p.split(',').map((n) => n + 'px').join(' '))
      .join(', ')})`;
    if (cuts.ticks) {
      const t = 5;
      let d = '';
      if (c.tl) d += `M${c.tl + 3},${3} h${t} `;
      if (c.br) d += `M${w - c.br - 3},${h - 3} h${-t} `;
      if (c.tr) d += `M${w - 3},${c.tr + 3} v${t} `;
      if (c.bl) d += `M${3},${h - c.bl - 3} v${-t} `;
      ticks.setAttribute('d', d.trim());
    }
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(el);
  observers.set(el, ro);
}
