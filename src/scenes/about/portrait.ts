import * as THREE from 'three';
import { assetUrl, loadImage, manifest } from '../../assets/assets';
import { disposeTree } from '../../shaders/fullscreen';
import { sampleSurface, normalizeBust } from './surface';

/**
 * Portrait point-cloud pipeline. Looks in public/assets/portrait/ in priority:
 *   1. portrait.glb                     → surface-sampled 3D points (full orbit OK)
 *   2. portrait.jpg/.png (+ portrait-depth.png)
 *                                       → photo point cloud displaced by the depth map
 *                                         (or by luminance) = a 2.5D interpretation;
 *                                         the camera orbit is limited accordingly.
 *   3. nothing                          → ABSTRACT PARTICLE SCULPTURE.
 *                                         *** TEMPORARY PLACEHOLDER *** — not a face,
 *                                         replaced automatically when you drop a file in.
 * Swapping in a real portrait is a file drop; no code changes.
 */

export type PortraitMode = 'glb' | 'photo' | 'placeholder';

export interface PortraitCloud {
  mode: PortraitMode;
  count: number;
  positions: Float32Array;
  normals: Float32Array; // zero vectors when unknown
  edge: Float32Array; // 0..1 rim/edge weight
  lum: Float32Array; // 0..1 brightness
  headY: number;
  headR: number;
  shoulderY: number;
  source: string;
}

const P = 'assets/portrait/';

export async function loadPortrait(count: number, report: (f: number) => void): Promise<PortraitCloud> {
  const glb = manifest.first([P + 'portrait.glb', P + 'portrait.gltf']);
  const photo = manifest.first([P + 'portrait.jpg', P + 'portrait.jpeg', P + 'portrait.png', P + 'portrait.webp']);
  const depth = manifest.first([P + 'portrait-depth.png', P + 'portrait-depth.jpg']);

  if (glb) {
    try {
      return await fromGlb(assetUrl(glb), count, report);
    } catch (e) {
      console.warn('[portrait] GLB failed, trying photo/placeholder', e);
    }
  }
  if (photo) {
    try {
      return await fromPhoto(assetUrl(photo), depth ? assetUrl(depth) : null, count, report);
    } catch (e) {
      console.warn('[portrait] photo failed, using placeholder', e);
    }
  }
  return placeholder(count);
}

/* ------------------------------------------------------------------ */
/* 1. GLB → surface samples                                            */
/* ------------------------------------------------------------------ */
async function fromGlb(url: string, count: number, report: (f: number) => void): Promise<PortraitCloud> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url, (e) => {
    if (e.total) report((e.loaded / e.total) * 0.7);
  });
  try {
    const { positions, normals, bounds } = sampleSurface(gltf.scene, count);
    report(0.9);
    const dimensions = normalizeBust(positions, bounds);
    const lum = new Float32Array(count).fill(0.6);
    const edge = new Float32Array(count);
    report(1);
    return { mode: 'glb', count, positions, normals, edge, lum, ...dimensions, source: url };
  } finally {
    // Only sampled arrays survive. Release the original model/materials/textures too.
    disposeTree(gltf.scene);
  }
}

/* ------------------------------------------------------------------ */
/* 2. Photo (+ optional depth) → 2.5D point cloud                      */
/* ------------------------------------------------------------------ */
async function fromPhoto(url: string, depthUrl: string | null, count: number, report: (f: number) => void): Promise<PortraitCloud> {
  const img = await loadImage(url);
  report(0.4);
  const depthImg = depthUrl ? await loadImage(depthUrl).catch(() => null) : null;
  report(0.55);

  const W = 420;
  const H = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const read = (im: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(im, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
  };
  const px = read(img);
  const dp = depthImg ? read(depthImg) : null;
  const N = W * H;

  // background colour estimate from the border
  let br = 0, bg = 0, bb = 0, bn = 0;
  let hasAlpha = false;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (px[i + 3] < 250) hasAlpha = true;
      if (x < 3 || y < 3 || x >= W - 3) {
        br += px[i]; bg += px[i + 1]; bb += px[i + 2]; bn++;
      }
    }
  }
  br /= bn; bg /= bn; bb /= bn;

  const mask = new Float32Array(N);
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (hasAlpha) mask[i] = px[i * 4 + 3] / 255;
    else {
      const d = Math.hypot(r - br, g - bg, b - bb) / 441;
      mask[i] = THREE.MathUtils.smoothstep(d, 0.07, 0.18);
    }
  }
  // top edge per column (brightest rim along the top of the hair)
  const topY = new Int32Array(W).fill(H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) if (mask[y * W + x] > 0.5) { topY[x] = y; break; }
  }
  // sobel on mask*lum → edges
  const edgeMap = new Float32Array(N);
  const v = (x: number, y: number) => {
    const i = Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x));
    return mask[i] * (0.4 + lum[i]);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = v(x + 1, y - 1) + 2 * v(x + 1, y) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x - 1, y) - v(x - 1, y + 1);
      const gy = v(x - 1, y + 1) + 2 * v(x, y + 1) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x, y - 1) - v(x + 1, y - 1);
      edgeMap[y * W + x] = Math.min(1, Math.hypot(gx, gy) * 0.9);
    }
  }
  // importance sampling CDF
  const cdf = new Float32Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += mask[i] * (0.25 + lum[i]) + edgeMap[i] * 0.3;
    cdf[i] = acc;
  }
  if (acc <= 0) throw new Error('portrait mask empty');
  report(0.75);

  const worldH = 2.5;
  const worldW = (worldH * W) / H;
  const top = 2.75;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const edge = new Float32Array(count);
  const lumOut = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const r = Math.random() * acc;
    let lo = 0, hi = N - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const x = lo % W;
    const y = (lo / W) | 0;
    const fx = (x + Math.random()) / W;
    const fy = (y + Math.random()) / H;
    const wx = (fx - 0.5) * worldW;
    const d = dp ? (0.299 * dp[lo * 4] + 0.587 * dp[lo * 4 + 1] + 0.114 * dp[lo * 4 + 2]) / 255 : lum[lo] * 0.7;
    const bulge = 0.3 * Math.sqrt(Math.max(0, 1 - (wx / (0.42 * worldW)) ** 2));
    positions[k * 3] = wx;
    positions[k * 3 + 1] = top - fy * worldH;
    positions[k * 3 + 2] = (d - 0.5) * (dp ? 0.7 : 0.3) + bulge + (Math.random() - 0.5) * 0.015;
    const topness = Math.exp(-Math.max(0, y - topY[x]) / (H * 0.02));
    edge[k] = Math.min(1, Math.max(edgeMap[lo] * 1.4, topness));
    lumOut[k] = lum[lo];
  }
  report(1);
  return { mode: 'photo', count, positions, normals, edge, lum: lumOut, headY: top - worldH * 0.3, headR: 0.42, shoulderY: top - worldH * 0.58, source: url };
}

/* ------------------------------------------------------------------ */
/* 3. *** TEMPORARY PLACEHOLDER *** abstract particle sculpture          */
/*    (a head-and-shoulders silhouette of particles and flowing          */
/*     strands — deliberately featureless, never a fake face)            */
/* ------------------------------------------------------------------ */
function placeholder(count: number): PortraitCloud {
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const edge = new Float32Array(count);
  const lum = new Float32Array(count);
  const headY = 1.62;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  const head = (u: number, v: number) => {
    const th = u * Math.PI * 2;
    const ph = Math.acos(2 * v - 1);
    n.set(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    p.set(n.x * 0.33, n.y * 0.43 + headY, n.z * 0.37);
    // flatten the back of the skull slightly / chin taper
    if (n.y < -0.3) p.x *= 0.85 + 0.15 * (1 + n.y);
    n.set(n.x / 0.33, n.y / 0.43, n.z / 0.37).normalize();
  };
  const superE = (a: number, e: number) => Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** e;
  const superS = (a: number, e: number) => Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** e;

  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const u = Math.random();
    const v = Math.random();
    if (r < 0.4) {
      head(u, v);
    } else if (r < 0.46) {
      // neck
      const a = u * Math.PI * 2;
      const y = 1.0 + v * 0.32;
      p.set(Math.cos(a) * 0.14, y, Math.sin(a) * 0.13 - 0.02);
      n.set(Math.cos(a), 0, Math.sin(a));
    } else if (r < 0.86) {
      // shoulders + upper torso (superellipse section, rounded shoulder caps)
      const a = u * Math.PI * 2;
      const y = Math.pow(v, 0.7) * 1.12;
      const shoulder = THREE.MathUtils.smoothstep(y, 0.82, 1.12);
      const rx = 0.98 * (1 - shoulder * 0.55) * (0.86 + 0.14 * THREE.MathUtils.smoothstep(y, 0.0, 0.7));
      const rz = 0.36 * (1 - shoulder * 0.45);
      p.set(rx * superE(a, 0.55), y, rz * superS(a, 0.55));
      n.set(Math.cos(a), shoulder * 0.8, Math.sin(a)).normalize();
    } else {
      // abstract flowing strands rising around the figure
      const strand = Math.floor(u * 22);
      const t = v;
      const a0 = (strand / 22) * Math.PI * 2;
      const a = a0 + t * 2.4;
      const rad = 0.55 + 0.45 * Math.sin(strand * 1.7) * (1 - t) + 0.05;
      p.set(Math.cos(a) * rad, 0.1 + t * 2.3, Math.sin(a) * rad * 0.6);
      n.set(Math.cos(a), 0, Math.sin(a));
    }
    p.x += (Math.random() - 0.5) * 0.012;
    p.y += (Math.random() - 0.5) * 0.012;
    p.z += (Math.random() - 0.5) * 0.012;
    positions.set([p.x, p.y, p.z], i * 3);
    normals.set([n.x, n.y, n.z], i * 3);
    lum[i] = 0.45 + Math.random() * 0.35;
    edge[i] = r < 0.4 && n.y > 0.55 ? 0.6 : 0; // top of the head
  }
  return { mode: 'placeholder', count, positions, normals, edge, lum, headY, headR: 0.4, shoulderY: 1.04, source: 'placeholder' };
}
