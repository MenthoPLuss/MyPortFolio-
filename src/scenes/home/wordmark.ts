import * as THREE from 'three';
import { NOISE, PALETTE } from '../../shaders/chunks';

/**
 * Wordmark mask: "ASIMANGKAN" rendered with Excon Bold onto a canvas, packed
 * into a DataTexture:
 *   R = sharp letters
 *   G = soft blur (glow / out-of-focus when the camera flies in)
 *   B = wide horizontal blur (light streaks bleeding sideways)
 *   A = "BORO" + subtitle, crisp (always legible, low contrast)
 */
export interface WordmarkMask {
  texture: THREE.DataTexture;
  /** Fraction of the texture width covered by the main word. */
  textFrac: number;
  /** Texture aspect (h / w). */
  aspect: number;
  /** Main-word cap height in texture-uv units (y). */
  capFrac: number;
  /** Top of the second line (BORO), as a fraction of the texture height from the top. */
  subTop: number;
}

const W = 2048;
const H = 768;

function blurCanvas(src: HTMLCanvasElement, sx: number, sy: number, passes = 2): HTMLCanvasElement {
  let cur = src;
  // downsample step by step, then upsample — cheap gaussian-ish blur
  const steps: HTMLCanvasElement[] = [];
  let w = src.width;
  let h = src.height;
  for (let i = 0; i < passes; i++) {
    w = Math.max(4, Math.round(w / sx));
    h = Math.max(4, Math.round(h / sy));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, w, h);
    steps.push(c);
    cur = c;
  }
  for (let i = steps.length - 2; i >= -1; i--) {
    const tw = i >= 0 ? steps[i].width : src.width;
    const th = i >= 0 ? steps[i].height : src.height;
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, tw, th);
    cur = c;
  }
  return cur;
}

export function buildWordmarkMask(word: string, second: string, subtitle: string): WordmarkMask {
  const main = document.createElement('canvas');
  main.width = W;
  main.height = H;
  const ctx = main.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // fit the long word by design: size so letters + tracking span ~74% of width
  const target = W * 0.74;
  const trackingEm = 0.07;
  ctx.font = `700 200px Excon, "Arial Black", sans-serif`;
  const letters = word.split('');
  const widths200 = letters.map((ch) => ctx.measureText(ch).width);
  const total200 = widths200.reduce((a, b) => a + b, 0) + trackingEm * 200 * (letters.length - 1);
  const F = (200 * target) / total200;
  ctx.font = `700 ${F}px Excon, "Arial Black", sans-serif`;
  const capH = ctx.measureText('H').actualBoundingBoxAscent || F * 0.72;
  const widths = letters.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + trackingEm * F * (letters.length - 1);
  const cy = H * 0.44;
  const baseline = cy + capH / 2;
  ctx.fillStyle = '#fff';
  let x = (W - total) / 2;
  letters.forEach((ch, i) => {
    ctx.fillText(ch, x, baseline);
    x += widths[i] + trackingEm * F;
  });

  // crisp secondary line(s)
  const sub = document.createElement('canvas');
  sub.width = W;
  sub.height = H;
  const sctx = sub.getContext('2d')!;
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, W, H);
  sctx.fillStyle = '#fff';
  sctx.textAlign = 'center';
  const f2 = F * 0.2;
  sctx.font = `700 ${f2}px Excon, "Arial Black", sans-serif`;
  const spaced = second.split('').join('   ');
  const y2 = baseline + F * 0.36;
  sctx.fillText(spaced, W / 2, y2);
  const f3 = F * 0.085;
  sctx.font = `400 ${f3}px Excon, system-ui, sans-serif`;
  if ('letterSpacing' in sctx) (sctx as unknown as { letterSpacing: string }).letterSpacing = `${(f3 * 0.06).toFixed(1)}px`;
  sctx.fillText(subtitle, W / 2, y2 + F * 0.22);

  const soft = blurCanvas(main, 3, 3, 3);
  const streak = blurCanvas(main, 6, 1.6, 3);

  const read = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, W, H).data;
  const r = read(main);
  const g = read(soft);
  const b = read(streak);
  const a = read(sub);

  // normalise blurred channels so their peak is 255
  let gMax = 1;
  let bMax = 1;
  for (let i = 0; i < r.length; i += 4) {
    if (g[i] > gMax) gMax = g[i];
    if (b[i] > bMax) bMax = b[i];
  }
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const srcRow = y * W * 4;
    const dstRow = (H - 1 - y) * W * 4; // flip so uv.y = 1 is the top
    for (let xx = 0; xx < W; xx++) {
      const s = srcRow + xx * 4;
      const d = dstRow + xx * 4;
      data[d] = r[s];
      data[d + 1] = Math.min(255, (g[s] * 255) / gMax);
      data[d + 2] = Math.min(255, (b[s] * 255) / bMax);
      data[d + 3] = a[s];
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { texture: tex, textFrac: total / W, aspect: H / W, capFrac: capH / H, subTop: (y2 - f2 * 0.8) / H };
}

/**
 * Volumetric wordmark material on a single plane: the fragment shader marches a
 * short slab behind the plane through stacked depth layers of the mask (fake
 * extrusion with real parallax), adds horizontal streaks + radial god-rays, and
 * is lit by the fluid dye (reveal where the pointer has been).
 */
export function wordmarkMaterial(steps: number, godRays: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: { STEPS: steps, GOD_RAYS: godRays ? 1 : 0 },
    uniforms: {
      uMask: { value: null },
      uDye: { value: null },
      uVel: { value: null },
      uHasFluid: { value: 1 },
      uPlaneSize: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uDepth: { value: 0.4 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uFade: { value: 0 },
      uBlur: { value: 0 },
      uBase: { value: 0.1 },
      uLight: { value: new THREE.Vector2(0.5, 0.5) },
      uSub: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${PALETTE}
      ${NOISE}
      uniform sampler2D uMask, uDye, uVel;
      uniform float uHasFluid, uDepth, uTime, uIntro, uFade, uBlur, uBase, uSub;
      uniform vec2 uPlaneSize, uRes, uLight, uCenter;
      varying vec3 vWorld;

      vec2 toUv(vec2 xy){ return (xy - uCenter) / uPlaneSize + 0.5; }

      void main(){
        vec2 suv = gl_FragCoord.xy / uRes;
        vec2 vel = texture2D(uVel, suv).xy * uHasFluid;
        // dye lives in screen space; sample slightly upstream so the glow trails
        float dye = texture2D(uDye, suv - vel * 0.00003).r * uHasFluid;
        float dyeSoft = texture2D(uDye, suv, 2.0).r * uHasFluid;
        dye = clamp(dye, 0.0, 2.5);

        vec3 rd = normalize(vWorld - cameraPosition);
        float rz = max(-rd.z, 0.08);
        vec2 warp = vel * 0.000035;               // letters wobble inside the fluid
        vec2 uv0 = toUv(vWorld.xy) + warp;

        vec4 m0 = texture2D(uMask, uv0);
        float face = mix(m0.r, m0.g * 0.8, uBlur);

        // march the slab: stacked depth layers of the mask (fake extrusion)
        float side = 0.0;
        for (int i = 1; i <= STEPS; i++) {
          float f = float(i) / float(STEPS);
          vec2 q = vWorld.xy + rd.xy * (f * uDepth / rz);
          vec4 m = texture2D(uMask, toUv(q) + warp);
          float a = mix(m.r, m.g * 0.8, uBlur);
          side += a * (1.0 - f) * (1.0 - face);
        }
        side = clamp(side * 2.2 / float(STEPS), 0.0, 1.0);

        // light: base fog level + fluid reveal
        float light = (uBase + dye * 1.35) * uIntro;
        float lit = clamp(light, 0.0, 1.0);
        float hot = max(light - 0.85, 0.0);

        // fog swallowing the letters (except where lit)
        float fogN = fbm3(vec2(suv.x * 3.0 + uTime * 0.02, suv.y * 5.0 - uTime * 0.015));
        float vis = clamp(0.06 + fogN * 0.16 + dye * 1.7, 0.0, 1.0) * uIntro;

        vec3 faceCol = mix(vec3(0.035, 0.08, 0.20), C_P1, lit) + C_FLARE * hot * 0.55;
        vec3 sideCol = mix(vec3(0.02, 0.05, 0.13), C_P4, lit * 0.8);
        float rim = clamp(fwidth(m0.r) * 2.2, 0.0, 1.0) * (1.0 - uBlur);

        vec3 col = faceCol * face * vis + sideCol * side * vis;
        col += C_RIM * rim * (0.15 + lit * 1.3) * vis;

        // soft glow + horizontal light streaks bleeding sideways
        float streakN = 0.65 + 0.35 * vnoise(vec2(uv0.y * 40.0, uTime * 0.4));
        col += C_P3 * m0.g * (0.025 + dyeSoft * 0.5) * uIntro;
        col += C_P3 * m0.b * (0.035 + dyeSoft * 0.7) * streakN * uIntro;

        // fine shimmering filaments near the letters
        float fil = pow(vnoise(vec2(uv0.x * 5.0 + uTime * 0.08, uv0.y * 160.0)), 9.0);
        col += C_P1 * fil * m0.b * (0.25 + dyeSoft) * uIntro;

      #if GOD_RAYS
        // radial god-rays: blur the soft mask away from the light source
        vec2 dir = uv0 - uLight;
        float rays = 0.0;
        float wsum = 0.0;
        for (int i = 0; i < 10; i++) {
          float k = float(i) / 10.0;
          float w = 1.0 - k;
          rays += texture2D(uMask, uv0 - dir * k * 0.22).g * w;
          wsum += w;
        }
        rays /= wsum;
        float near = exp(-length((uv0 - uLight) * vec2(1.0, 2.6)) * 2.2);
        col += C_P2 * rays * near * (0.05 + dyeSoft * 0.7) * uIntro;
      #endif

        // crisp second line + subtitle (low contrast, always legible)
        col += C_TEXT * m0.a * 0.36 * uIntro * (1.0 - uBlur) * uSub;

        col *= 1.0 - uFade;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}
