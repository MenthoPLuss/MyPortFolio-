import * as THREE from 'three';
import { CHAMFER, NOISE, PALETTE } from '../../shaders/chunks';

/**
 * Curved, chamfered, frosted glass panel with canvas text (used by About panels,
 * the Contact banner and Work labels).
 *
 * Reveal sequence driven by `reveal` 0..1 (time-based, ~2s):
 *   0.00–0.22  border draws in (diagonal wipe) + surface appears
 *   0.06–0.46  bright white-cyan bar sweeps top→bottom with a ragged liquid lower
 *              edge, leaving the frosted fill behind it
 *   0.40–0.60  title wipes in
 *   0.50–1.00  body lines wipe in left→right, staggered ~80ms each
 * A panel parked at reveal ≈ 0.3 shows only the light bar (used for far panels).
 */

export interface PanelLine {
  text: string;
  role: 'title' | 'body' | 'lead' | 'strong' | 'label';
}

export interface PanelSpec {
  width: number;
  /** >0 convex (edges recede), <0 concave (edges come forward), 0 flat. Radius in world units. */
  bend: number;
  title?: string;
  body?: string;
  /** Explicit lines instead of title/body (banner). */
  lines?: PanelLine[];
  align?: 'left' | 'center';
  /** Corner cuts (tl, tr, br, bl) as a fraction of the panel height. */
  cut?: [number, number, number, number];
  textScale: number;
  backdrop?: THREE.Texture | null;
  /** Fixed height (labels). Otherwise auto from text. */
  height?: number;
  fill?: number;
}

const MAX_LINES = 12;

interface Layout {
  canvas: HTMLCanvasElement;
  rects: THREE.Vector4[];
  titleLines: number;
  aspect: number; // h / w
}

function fontFor(role: PanelLine['role'], cw: number): { font: string; size: number; upper: boolean; spacing: number } {
  switch (role) {
    case 'title':
      return { font: `600 ${Math.round(cw * 0.074)}px Antonio, "Arial Narrow", sans-serif`, size: cw * 0.074, upper: true, spacing: 0.02 };
    case 'label':
      return { font: `600 ${Math.round(cw * 0.083)}px Antonio, "Arial Narrow", sans-serif`, size: cw * 0.083, upper: true, spacing: 0.06 };
    case 'lead':
      return { font: `500 ${Math.round(cw * 0.045)}px Excon, system-ui, sans-serif`, size: cw * 0.045, upper: false, spacing: 0 };
    case 'strong':
      return { font: `700 ${Math.round(cw * 0.062)}px Excon, system-ui, sans-serif`, size: cw * 0.062, upper: false, spacing: 0 };
    default:
      return { font: `400 ${Math.round(cw * 0.049)}px Excon, system-ui, sans-serif`, size: cw * 0.049, upper: false, spacing: 0 };
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) out.push(cur);
  return out;
}

function layout(spec: PanelSpec): Layout {
  const cw = Math.min(2048, Math.round(1024 * spec.textScale));
  const pad = cw * 0.07;
  const maxW = cw - pad * 2;
  const measure = document.createElement('canvas').getContext('2d')!;

  // expand to concrete lines
  const lines: PanelLine[] = [];
  if (spec.lines) {
    for (const l of spec.lines) {
      const f = fontFor(l.role, cw);
      measure.font = f.font;
      for (const t of wrap(measure, f.upper ? l.text.toUpperCase() : l.text, maxW)) lines.push({ text: t, role: l.role });
    }
  } else {
    if (spec.title) {
      const f = fontFor('title', cw);
      measure.font = f.font;
      for (const t of wrap(measure, spec.title.toUpperCase(), maxW)) lines.push({ text: t, role: 'title' });
    }
    if (spec.body) {
      const f = fontFor('body', cw);
      measure.font = f.font;
      for (const t of wrap(measure, spec.body, maxW)) lines.push({ text: t, role: 'body' });
    }
  }
  const used = lines.slice(0, MAX_LINES);

  // vertical metrics
  const rows = used.map((l, i) => {
    const f = fontFor(l.role, cw);
    const lh = l.role === 'title' ? f.size * 1.18 : l.role === 'label' ? f.size * 1.1 : f.size * 1.5;
    const gapBefore = i > 0 && used[i - 1].role === 'title' && l.role !== 'title' ? f.size * 0.7 : 0;
    return { ...l, f, lh, gapBefore };
  });
  const textH = rows.reduce((s, r) => s + r.lh + r.gapBefore, 0);
  const ch = spec.height
    ? Math.round(cw * (spec.height / spec.width))
    : Math.round(pad * 1.7 + textH + pad * 0.5);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  const rects: THREE.Vector4[] = [];
  let y = spec.height ? (ch - textH) / 2 : pad * 1.15;
  for (const r of rows) {
    y += r.gapBefore;
    ctx.font = r.f.font;
    if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(r.f.size * r.f.spacing).toFixed(1)}px`;
    const m = ctx.measureText(r.text);
    const ascent = m.actualBoundingBoxAscent || r.f.size * 0.75;
    const descent = m.actualBoundingBoxDescent || r.f.size * 0.2;
    const baseline = y + (r.lh + ascent - descent) / 2;
    const x = spec.align === 'center' ? (cw - m.width) / 2 : pad;
    ctx.fillText(r.text, x, baseline);
    // uv rect: (x0, vBottom, x1, vTop) — CanvasTexture flipY → v=1 at canvas top
    const top = y;
    const bottom = y + r.lh;
    rects.push(new THREE.Vector4(x / cw, 1 - bottom / ch, (x + m.width) / cw, 1 - top / ch));
    y += r.lh;
  }
  const titleLines = rows.filter((r) => r.role === 'title' || r.role === 'lead').length;
  while (rects.length < MAX_LINES) rects.push(new THREE.Vector4(0, -1, 0, -1));
  return { canvas, rects, titleLines, aspect: ch / cw };
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
${PALETTE}
${NOISE}
${CHAMFER}
uniform sampler2D uText;
uniform sampler2D uBackdrop;
uniform float uUseBackdrop, uReveal, uTime, uHover, uOpacity, uFill;
uniform vec2 uSize, uRes;
uniform vec4 uCut;
uniform vec4 uLines[${MAX_LINES}];
uniform int uLineCount, uTitleLines;
varying vec2 vUv;

vec4 over(vec4 top, vec4 bot){ return top + bot * (1.0 - top.a); }

void main(){
  vec2 p = (vUv - 0.5) * uSize;
  vec2 b = uSize * 0.5 - vec2(0.003);
  float d = sdChamferRect(p, b, uCut);
  float aa = max(fwidth(d), 1e-5);
  float inside = 1.0 - smoothstep(-aa, aa * 0.5, d);
  float R = uReveal;
  if (R <= 0.0005) discard;

  float pBorder = smoothstep(0.0, 0.22, R);
  float pBar = clamp((R - 0.06) / 0.40, 0.0, 1.0);

  // border draws in with a diagonal wipe from the top-left corner
  float diag = (vUv.x + (1.0 - vUv.y)) * 0.5;
  float wipe = smoothstep(diag - 0.05, diag + 0.02, pBorder * 1.08);
  float line = 1.0 - smoothstep(aa * 0.55, aa * 1.5, abs(d + aa * 0.9));
  float glow = exp(-abs(d) / (aa * 6.0)) * 0.35;

  // corner accent ticks (inside, near the cut corners)
  float off = 0.014;
  float tl = step(abs(p.y - (b.y - off)), aa) * step(-b.x + uCut.x + 0.006, p.x) * step(p.x, -b.x + uCut.x + 0.05);
  float br = step(abs(p.y + (b.y - off)), aa) * step(p.x, b.x - uCut.z - 0.006) * step(b.x - uCut.z - 0.05, p.x);
  float ticks = (tl + br) * wipe;

  // bright light bar sweeping down with a ragged "liquid" lower edge
  float rag = (vnoise(vec2(vUv.x * 7.0, uTime * 1.6)) - 0.5) * 0.10
            + (vnoise(vec2(vUv.x * 23.0, uTime * 2.7)) - 0.5) * 0.04;
  float edgeY = 1.07 - pBar * 1.24 + rag;
  float filled = smoothstep(edgeY - 0.012, edgeY + 0.012, vUv.y);
  float band = filled * (1.0 - smoothstep(edgeY, edgeY + 0.17, vUv.y));
  float barLife = smoothstep(0.0, 0.04, pBar) * (1.0 - smoothstep(0.72, 1.0, pBar));
  float bar = band * barLife;
  float lip = (1.0 - smoothstep(0.0, 0.02, abs(vUv.y - edgeY))) * barLife; // hot liquid edge

  // frosted translucent blue fill
  vec3 fill = vec3(0.040, 0.098, 0.245);
  if (uUseBackdrop > 0.5) {
    vec2 suv = gl_FragCoord.xy / uRes;
    vec3 acc = vec3(0.0);
    for (int i = -2; i <= 2; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 o = vec2(float(i) * 0.006, float(j) * 0.009);
        o += (vec2(vnoise(vUv * 40.0 + float(i)), vnoise(vUv * 40.0 + float(j) + 7.0)) - 0.5) * 0.01;
        acc += texture2D(uBackdrop, suv + o).rgb;
      }
    }
    acc = min(acc / 15.0, vec3(0.32));
    fill = mix(fill, acc * 0.9 + vec3(0.02, 0.05, 0.12), 0.42);
  }
  fill += (vnoise(vUv * vec2(70.0, 34.0) + uTime * 0.05) - 0.5) * 0.03;
  fill += (hash12(gl_FragCoord.xy) - 0.5) * 0.018;
  fill += C_P4 * 0.10 * (1.0 - vUv.y);
  fill = mix(fill, fill * 1.35 + C_P5 * 0.08, uHover);
  float fillA = uFill * (1.0 + uHover * 0.18) * filled * pBorder * inside;

  // text: each line wipes in left → right
  vec4 tx = texture2D(uText, vUv);
  float textA = 0.0;
  float isTitle = 0.0;
  for (int i = 0; i < ${MAX_LINES}; i++) {
    if (i >= uLineCount) break;
    vec4 L = uLines[i];
    if (vUv.y >= L.y && vUv.y <= L.w) {
      bool t = i < uTitleLines;
      float st = t ? 0.40 + float(i) * 0.03 : 0.50 + float(i - uTitleLines) * 0.04;
      float lr = clamp((R - st) / 0.22, 0.0, 1.0);
      float x = mix(L.x - 0.08, L.z + 0.08, lr);
      textA = (1.0 - smoothstep(x - 0.08, x, vUv.x)) * step(0.0001, lr);
      isTitle = t ? 1.0 : 0.0;
    }
  }
  vec3 textCol = mix(C_TEXT, vec3(0.90, 0.95, 1.0), isTitle);
  textCol = mix(textCol, vec3(1.0), uHover * 0.35);

  vec4 col = vec4(fill * fillA, fillA);
  float ta = tx.a * textA * inside;
  col = over(vec4(textCol * ta, ta), col);
  float ba = clamp((line + ticks) * wipe, 0.0, 1.0) * (0.85 + uHover * 0.15);
  vec3 bc = mix(C_BORDER, C_HOVER * 1.25, uHover);
  col = over(vec4(bc * ba, ba), col);
  // additive light (premultiplied: add rgb)
  col.rgb += C_RIM * glow * pBorder * (0.35 + uHover * 0.6) * (1.0 - inside * 0.6);
  col.rgb += mix(C_FLARE, vec3(1.0), 0.55) * (bar * 0.95 + lip * 0.6) * inside;
  col.a = max(col.a, (bar * 0.5 + lip * 0.4) * inside);
  gl_FragColor = col * uOpacity;
}
`;

export class Panel3D {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly width: number;
  readonly height: number;
  readonly texture: THREE.CanvasTexture;
  reveal = 0;
  target = 0;
  hover = 0;
  hoverTarget = 0;
  speedIn = 1 / 2.0;
  speedOut = 1 / 1.6;

  constructor(spec: PanelSpec) {
    const lay = layout(spec);
    this.width = spec.width;
    this.height = spec.height ?? spec.width * lay.aspect;

    this.texture = new THREE.CanvasTexture(lay.canvas);
    this.texture.anisotropy = 8;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;

    const geo = new THREE.PlaneGeometry(this.width, this.height, 32, 1);
    if (spec.bend !== 0) {
      const R = Math.abs(spec.bend);
      const sign = spec.bend > 0 ? 1 : -1;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const a = x / R;
        pos.setX(i, R * Math.sin(a));
        pos.setZ(i, sign * (R * Math.cos(a) - R));
      }
      pos.needsUpdate = true;
      geo.computeBoundingSphere();
    }

    const cut = spec.cut ?? [0.12, 0, 0.12, 0];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uText: { value: this.texture },
        uBackdrop: { value: spec.backdrop ?? null },
        uUseBackdrop: { value: spec.backdrop ? 1 : 0 },
        uReveal: { value: 0 },
        uTime: { value: 0 },
        uHover: { value: 0 },
        uOpacity: { value: 1 },
        uFill: { value: spec.fill ?? 0.62 },
        uSize: { value: new THREE.Vector2(this.width, this.height) },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCut: {
          value: new THREE.Vector4(
            cut[0] * this.height,
            cut[1] * this.height,
            cut[2] * this.height,
            cut[3] * this.height,
          ),
        },
        uLines: { value: lay.rects },
        uLineCount: { value: Math.min(MAX_LINES, lay.rects.filter((r) => r.y >= 0).length) },
        uTitleLines: { value: lay.titleLines },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 10;
  }

  setBackdrop(tex: THREE.Texture | null): void {
    const u = this.mesh.material.uniforms;
    u.uBackdrop.value = tex;
    u.uUseBackdrop.value = tex ? 1 : 0;
  }

  setResolution(w: number, h: number): void {
    this.mesh.material.uniforms.uRes.value.set(w, h);
  }

  update(dt: number, time: number): void {
    const d = this.target - this.reveal;
    if (d > 0) this.reveal = Math.min(this.target, this.reveal + dt * this.speedIn);
    else if (d < 0) this.reveal = Math.max(this.target, this.reveal - dt * this.speedOut);
    this.hover += (this.hoverTarget - this.hover) * (1 - Math.exp(-dt * (this.hoverTarget > this.hover ? 1 / 0.15 : 1 / 0.12)));
    const u = this.mesh.material.uniforms;
    u.uReveal.value = this.reveal;
    u.uTime.value = time;
    u.uHover.value = this.hover;
    this.mesh.visible = this.reveal > 0.0005;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
