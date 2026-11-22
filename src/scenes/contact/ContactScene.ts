import * as THREE from 'three';
import { site } from '../../content/site.config';
import { smoothstep } from '../../app/state';
import { CameraPath, tanHalfHFov } from '../../camera/camera';
import { createDust } from '../../particles/dust';
import type { QualitySettings } from '../../quality/quality';
import { FULLSCREEN_VERT, NOISE, PALETTE } from '../../shaders/chunks';
import { backgroundMesh } from '../../shaders/fullscreen';
import { BaseScene, type SceneContext } from '../BaseScene';
import { Panel3D } from '../shared/panel3d';

const TOP = 16;
const BANNER_W = 2.5;
const BANNER_Z = 2.6;

/** Fibre path: vertical column → quarter-circle bend → fanning out on the ground. */
const FIBRE_GLSL = /* glsl */ `
attribute vec4 aFibre; // phi, ox, oz, seed
uniform float uTime, uPixelRatio, uOpacity, uMotion, uTop, uDensity;
void fibreDims(out float rb, out float L, out float Hc, out float Sb){
  rb = mix(1.0, 4.2, fract(aFibre.w * 7.13)); // wide, root-like flare at the base (reference)
  L = mix(3.0, 30.0, pow(fract(aFibre.w * 3.71), 1.25));
  Hc = uTop - rb;
  Sb = 1.5707963 * rb;
}
vec3 fibreAt(float s, float rb, float Hc, float Sb, out float zone){
  float phi = aFibre.x;
  vec2 o = aFibre.yz;
  vec2 dir = vec2(cos(phi), sin(phi));
  if (s < Hc) {
    float y = uTop - s;
    // Zero value AND slope at the column/bend joint (no jump in moving glints).
    float w = sin(y * 0.8 + aFibre.w * 40.0) * 0.035 * smoothstep(0.0, 1.5, y - rb);
    zone = 0.0;
    return vec3(o.x + w, y, o.y + w * 0.6);
  } else if (s < Hc + Sb) {
    float a = (s - Hc) / rb;
    float r = rb * (1.0 - cos(a));
    zone = a / 1.5707963;
    return vec3(o.x + dir.x * r, rb - rb * sin(a), o.y + dir.y * r);
  }
  float g = s - Hc - Sb;
  float bend = (fract(aFibre.w * 5.3) - 0.5) * 0.04 * g;
  vec2 d2 = vec2(cos(phi + bend), sin(phi + bend));
  zone = 1.0;
  return vec3(o.x + dir.x * rb + d2.x * g, 0.0, o.y + dir.y * rb + d2.y * g);
}
// position by zone (0 column, 1 bend, 2 ground) + fraction inside the zone
vec3 fibreZone(float z, float u, out float S, out float zone, out float s){
  float rb, L, Hc, Sb;
  fibreDims(rb, L, Hc, Sb);
  S = Hc + Sb + L;
  s = z < 0.5 ? u * Hc : z < 1.5 ? Hc + u * Sb : Hc + Sb + u * L;
  s = min(s, S - 1e-3);
  return fibreAt(s, rb, Hc, Sb, zone);
}
// position by fraction of the total length
vec3 fibreT(float t, out float S, out float zone, out float s){
  float rb, L, Hc, Sb;
  fibreDims(rb, L, Hc, Sb);
  S = Hc + Sb + L;
  s = t * S;
  return fibreAt(s, rb, Hc, Sb, zone);
}
`;

/**
 * CONTACT — a dense column of thin glowing particle fibres falling from the top
 * of the frame, fanning out across the ground plane toward the viewer, with
 * bright glints travelling along them; a curved banner with the contact line;
 * HTML icon buttons in a shallow arc (positioned from a 3D anchor).
 */
export class ContactScene extends BaseScene {
  readonly id = 'contact' as const;
  private fibres!: THREE.Group;
  private inflow!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private dust!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private haze!: THREE.ShaderMaterial;
  private banner!: Panel3D;
  private path!: CameraPath;
  private tmpP = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  private anchor = new THREE.Vector3();
  private fibreCount = 0;
  /** Screen position (CSS px) of the button arc + reveal state, read by the UI. */
  readonly buttons = { x: 0, y: 0, show: false, scale: 1 };

  constructor(ctx: SceneContext) {
    super(ctx, 40);
  }

  async build(report: (f: number) => void): Promise<void> {
    const q = this.ctx.quality;
    this.haze = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        uniform float uTime;
        varying vec2 vUv;
        void main(){
          float g = smoothstep(1.0, 0.0, length((vUv - vec2(0.5, 0.6)) * vec2(1.1, 1.3)));
          vec3 col = mix(C_HAZE_LO, C_HAZE_HI * 1.12, g);
          // column glow
          col += C_P5 * 0.16 * exp(-pow((vUv.x - 0.5) * 7.0, 2.0)) * smoothstep(0.35, 1.0, vUv.y);
          col += vec3(0.01, 0.025, 0.07) * fbm(vUv * 2.2 + uTime * 0.01);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(backgroundMesh(this.haze));

    this.fibres = this.makeFibres(q.fibres, q.fibrePoints);
    this.scene.add(this.fibres);
    report(0.5);

    this.inflow = this.makeInflow(1400);
    this.scene.add(this.inflow);
    this.dust = createDust({
      count: Math.round(q.dust * 0.5),
      min: new THREE.Vector3(-14, -1, -14),
      max: new THREE.Vector3(14, 12, 14),
      size: 1.2,
      opacity: 0.5,
    });
    this.scene.add(this.dust);

    const [l1, l2] = site.contact.bannerLines;
    this.banner = new Panel3D({
      width: BANNER_W,
      bend: -1.9, // strongly curved, like a section of a cylinder (reference)
      lines: [
        { text: l1, role: 'lead' },
        { text: l2, role: 'strong' },
      ],
      align: 'center',
      textScale: Math.min(2, q.textScale * 1.25),
      cut: [0.22, 0, 0.22, 0],
      fill: 0.62,
    });
    this.banner.mesh.position.set(0, 2.25, BANNER_Z);
    this.scene.add(this.banner.mesh);
    this.layout();
    report(1);
  }

  /**
   * Fibres = thin 1px line strips (static curves, with travelling glow pulses)
   * + bright glint points flowing along them (down the column, then outward).
   * The curve is evaluated in the vertex shader from per-fibre params.
   */
  private makeFibres(fibres: number, segments: number): THREE.Group {
    this.fibreCount = fibres;
    const group = new THREE.Group();
    const params: number[][] = [];
    for (let f = 0; f < fibres; f++) {
      const r = 0.62 * Math.sqrt(Math.random()); // column ~15% of the frame wide (reference)
      const a = Math.random() * Math.PI * 2;
      // fan direction biased toward the viewer (+z ↔ phi = PI/2) but covering all directions
      const u = Math.random() * 2 - 1;
      const phi = Math.PI / 2 + u * u * u * Math.PI;
      params.push([phi, Math.cos(a) * r, Math.sin(a) * r, Math.random()]);
    }

    // ---- line strips: segments split across column / bend / ground zones ----
    const colSeg = Math.max(6, Math.round(segments * 0.25));
    const bendSeg = Math.max(6, Math.round(segments * 0.2));
    const groundSeg = Math.max(8, segments - colSeg - bendSeg);
    const zones: [number, number][] = [];
    const pushZone = (z: number, n: number) => {
      for (let i = 0; i < n; i++) zones.push([z, i / n], [z, (i + 1) / n]);
    };
    pushZone(0, colSeg);
    pushZone(1, bendSeg);
    pushZone(2, groundSeg);
    const vPer = zones.length;
    const lf = new Float32Array(fibres * vPer * 4);
    const lz = new Float32Array(fibres * vPer * 2);
    for (let f = 0; f < fibres; f++) {
      for (let v = 0; v < vPer; v++) {
        lf.set(params[f], (f * vPer + v) * 4);
        lz.set(zones[v], (f * vPer + v) * 2);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fibres * vPer * 3), 3));
    lg.setAttribute('aFibre', new THREE.BufferAttribute(lf, 4));
    lg.setAttribute('aZone', new THREE.BufferAttribute(lz, 2));
    const uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 1 },
      uMotion: { value: 1 },
      uTop: { value: TOP },
      uDensity: { value: 1 },
    };
    const lines = new THREE.LineSegments(
      lg,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          ${PALETTE}
          ${FIBRE_GLSL}
          attribute vec2 aZone;
          varying vec3 vColor;
          varying float vAlpha;
          void main(){
            float S, zone, s;
            vec3 p = fibreZone(aZone.x, aZone.y, S, zone, s);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            // bright pulses travelling down and outward
            float pulse = pow(0.5 + 0.5 * sin(s * 0.5 - uTime * uMotion * 3.0 + aFibre.w * 40.0), 26.0);
            float col = 1.0 - zone;
            float far = 1.0 - smoothstep(12.0, 30.0, length(p.xz));
            float top = smoothstep(uTop, uTop - 3.0, p.y);
            // reference fibres read as dotted streams: the lines are only faint guides
            vAlpha = uOpacity * uDensity * far * top * (mix(0.008, 0.0035, col) + pulse * mix(0.045, 0.02, col));
            vColor = mix(C_P3, C_P1, col * 0.6 + 0.2) + C_FLARE * pulse * 0.6;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          void main(){ gl_FragColor = vec4(vColor * vAlpha, 1.0); }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    group.add(lines);

    // ---- glint points flowing along the fibres ----
    const per = Math.max(24, Math.round(segments * 0.6)); // dense dotted streams flowing along each fibre
    const pf = new Float32Array(fibres * per * 4);
    const pt = new Float32Array(fibres * per);
    for (let f = 0; f < fibres; f++) {
      for (let i = 0; i < per; i++) {
        pf.set(params[f], (f * per + i) * 4);
        pt[f * per + i] = (i + Math.random()) / per;
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fibres * per * 3), 3));
    pg.setAttribute('aFibre', new THREE.BufferAttribute(pf, 4));
    pg.setAttribute('aT', new THREE.BufferAttribute(pt, 1));
    const pts = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          ${PALETTE}
          ${FIBRE_GLSL}
          attribute float aT;
          varying vec3 vColor;
          varying float vAlpha;
          void main(){
            float speed = 0.6 + fract(aFibre.w * 11.0) * 0.6;
            float S, zone, s;
            float t0 = fract(aT + uTime * uMotion * speed * 0.025);
            vec3 p = fibreT(t0, S, zone, s);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float tw = 0.8 + 0.2 * sin(uTime * 3.0 + aT * 80.0);
            float glint = step(0.95, fract(aT * 13.7 + aFibre.w * 5.0)); // a few brighter travelling glints
            float ends = smoothstep(0.0, 0.04, t0) * (1.0 - smoothstep(0.75, 1.0, t0));
            float far = 1.0 - smoothstep(12.0, 28.0, length(p.xz));
            vAlpha = uOpacity * uDensity * ends * far * tw * (0.5 + zone * 0.35 + glint * 0.7);
            vColor = mix(C_P2, C_FLARE, 0.25 + glint * 0.5);
            gl_PointSize = clamp((2.0 + glint * 1.4) * uPixelRatio * (6.0 / max(-mv.z, 0.5)), 1.0, 4.0 * uPixelRatio);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vColor * smoothstep(0.5, 0.0, d) * vAlpha, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    group.add(pts);
    group.userData = { vPer, per };
    uniforms.uDensity.value = THREE.MathUtils.clamp(Math.sqrt(1600 / fibres), 0.8, 1.8);
    return group;
  }

  private get fibreUniforms(): Record<string, THREE.IUniform> {
    return ((this.fibres.children[0] as THREE.LineSegments).material as THREE.ShaderMaterial).uniforms;
  }

  private makeInflow(count: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const a = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      a.set([3 + Math.random() * 12, Math.random() * Math.PI * 2, Math.random() * 9, Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aIn', new THREE.BufferAttribute(a, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uMotion: { value: 1 } },
      vertexShader: /* glsl */ `
        ${PALETTE}
        attribute vec4 aIn; // r0, angle, y, seed
        uniform float uTime, uPixelRatio, uMotion;
        varying float vAlpha;
        varying vec3 vColor;
        void main(){
          float t = fract(uTime * uMotion * (0.025 + aIn.w * 0.03) + aIn.w);
          float r = aIn.x * (1.0 - t) + 0.25;
          float ang = aIn.y + t * 1.8;
          vec3 p = vec3(cos(ang) * r, aIn.z + t * 1.2, sin(ang) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vAlpha = sin(3.14159 * t) * 0.35;
          vColor = mix(C_P4, C_P1, t);
          gl_PointSize = clamp(2.4 * uPixelRatio * (6.0 / max(-mv.z, 0.5)), 0.6, 5.0 * uPixelRatio);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vColor * smoothstep(0.5, 0.0, d) * vAlpha, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  }

  private layout(): void {
    const cam = this.camera;
    const narrow = cam.aspect < 1;
    // reference banner is small (~15–20% of the width); kept slightly larger for readability
    const frac = narrow ? 0.9 : THREE.MathUtils.lerp(0.5, 0.25, THREE.MathUtils.smoothstep(cam.aspect, 1, 1.6));
    const d = BANNER_W / (frac * 2 * tanHalfHFov(cam));
    const zEnd = BANNER_Z + d;
    // slightly raised camera looking down: the ground fan fills the lower third (reference)
    const y = 2.05;
    this.path = new CameraPath(
      [
        new THREE.Vector3(0, 7.5, zEnd + 26),
        new THREE.Vector3(0, 5.0, zEnd + 15),
        new THREE.Vector3(0, 3.0, zEnd + 6.5),
        new THREE.Vector3(0, 2.1, zEnd + 1.8),
        new THREE.Vector3(0, y, zEnd),
      ],
      [
        new THREE.Vector3(0, 5.5, 0),
        new THREE.Vector3(0, 3.6, 0),
        new THREE.Vector3(0, 2.4, 0),
        new THREE.Vector3(0, 1.95, 0),
        new THREE.Vector3(0, 1.6, 0),
      ],
    );
    this.rig.reset();
  }

  update(dt: number, time: number): void {
    const p = this.progress;
    const reduced = this.ctx.reducedMotion;
    this.path.sample(reduced ? 1 : p, this.tmpP, this.tmpL);
    // pointer yaw only during the last ~20% of the approach
    const ptr = this.ctx.input.pointer;
    const k = smoothstep(0.8, 1.0, p) * (reduced ? 0 : this.ctx.isTouch ? 0.4 : 1);
    const amt = THREE.MathUtils.degToRad(2.4) * k;
    this.rig.update(dt, this.tmpP, this.tmpL, -ptr.x * amt, ptr.y * amt * 0.5);

    const motion = reduced ? 0.25 : 1;
    const fu = this.fibreUniforms;
    fu.uTime.value = time;
    fu.uPixelRatio.value = this.ctx.dpr;
    fu.uMotion.value = motion;
    const iu = this.inflow.material.uniforms;
    iu.uTime.value = time;
    iu.uPixelRatio.value = this.ctx.dpr;
    iu.uMotion.value = motion;
    this.dust.material.uniforms.uTime.value = time;
    this.dust.material.uniforms.uPixelRatio.value = this.ctx.dpr;
    this.haze.uniforms.uTime.value = time;

    this.banner.target = reduced || p > 0.8 ? 1 : 0;
    this.banner.speedIn = reduced ? 1 / 0.6 : 1 / 2.0;
    this.banner.update(dt, time);

    // anchor for the HTML icon arc (just below the banner)
    this.anchor.set(0, this.banner.mesh.position.y - this.banner.height / 2 - 0.3, BANNER_Z + 0.2);
    this.anchor.project(this.camera);
    this.buttons.x = (this.anchor.x * 0.5 + 0.5) * this.ctx.width;
    this.buttons.y = (-this.anchor.y * 0.5 + 0.5) * this.ctx.height;
    this.buttons.show = this.banner.reveal > 0.82 && this.banner.target === 1;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    this.banner.setResolution(target.width, target.height);
    super.render(renderer, target);
  }

  resize(w: number, h: number, dpr: number): void {
    super.resize(w, h, dpr);
    if (this.banner) this.layout();
  }

  applyQuality(q: QualitySettings): void {
    super.applyQuality(q);
    const fibres = Math.min(q.fibres, this.fibreCount);
    const { vPer, per } = this.fibres.userData as { vPer: number; per: number };
    (this.fibres.children[0] as THREE.LineSegments).geometry.setDrawRange(0, fibres * vPer);
    (this.fibres.children[1] as THREE.Points).geometry.setDrawRange(0, fibres * per);
    this.fibreUniforms.uDensity.value = THREE.MathUtils.clamp(Math.sqrt(1600 / fibres), 0.8, 1.8);
  }

  dispose(): void {
    this.banner?.dispose();
    super.dispose();
  }
}
