import * as THREE from 'three';
import { site } from '../../content/site.config';
import { assetUrl, loadImage, manifest } from '../../assets/assets';
import { clamp, smoothstep } from '../../app/state';
import { CameraPath, tanHalfHFov } from '../../camera/camera';
import { createDust } from '../../particles/dust';
import type { QualitySettings } from '../../quality/quality';
import { FULLSCREEN_VERT, NOISE, PALETTE } from '../../shaders/chunks';
import { backgroundMesh } from '../../shaders/fullscreen';
import { BaseScene, type SceneContext } from '../BaseScene';
import { Panel3D } from '../shared/panel3d';
import { blurredCover, drawCover } from './covers';

const PW = 3.6;
const GAP = 14;
const Z0 = -8;
const MARGIN = 0.3; // plane extends beyond the image for the bloom halo + smears
const PROJECT_Y = 0.35;
// projects float at different positions in the corridor (reference); the camera only
// partly follows them, so distant ones appear in different parts of the frame
const XOFF = [0.9, -1.4, 1.5, -0.6];
const YOFF = [0.4, -0.35, 0.55, 0.1];
const FOLLOW = 0.6;

interface ProjectView {
  y: number;
  plane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  label: Panel3D;
  z: number;
  x: number;
  hover: number;
  video: HTMLVideoElement | null;
  cover: THREE.Texture;
  coverAspect: number;
  videoTexture: THREE.VideoTexture | null;
  playAttempted: boolean;
}

/**
 * WORK — a dotted perspective grid corridor; projects are planes placed one
 * behind another along -Z. Scroll flies the camera forward; planes show
 * velocity-driven slice glitches / smear / RGB split, the active one is full
 * colour, the others blue-tinted. The last one fills the screen before Contact.
 */
export class WorkScene extends BaseScene {
  readonly id = 'work' as const;
  private projects: ProjectView[] = [];
  private path!: CameraPath;
  private dwell: number[] = [];
  private segments = 1;
  private grid!: THREE.ShaderMaterial;
  private lines!: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private dots!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private hud: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private ghosts: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private haze!: THREE.ShaderMaterial;
  private raycaster = new THREE.Raycaster();
  private pickTargets: THREE.Object3D[] = [];
  private hits: THREE.Intersection[] = [];
  private hovered = -1;
  private vel = 0;
  private reducedCameraIndex = -1;
  private tmpP = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  onOpen: (index: number) => void = () => {};

  constructor(ctx: SceneContext) {
    super(ctx, 45);
  }

  async build(report: (f: number) => void): Promise<void> {
    const q = this.ctx.quality;

    this.haze = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uEnd: { value: 0 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        uniform float uTime, uEnd;
        varying vec2 vUv;
        void main(){
          float g = smoothstep(0.9, 0.0, length((vUv - 0.5) * vec2(1.0, 1.4)));
          vec3 col = mix(C_HAZE_LO, C_HAZE_HI * 1.05, g);
          col += vec3(0.01, 0.025, 0.07) * fbm(vUv * 2.5 + uTime * 0.01);
          col = mix(col, C_HAZE_HI * 1.3, uEnd);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(backgroundMesh(this.haze));

    this.buildCorridor();
    report(0.2);

    // project planes + labels
    const covers: HTMLCanvasElement[] = [];
    for (let i = 0; i < site.projects.length; i++) {
      const p = site.projects[i];
      const { texture, aspect, cover } = await this.coverFor(p.slug);
      covers.push(cover);
      const video = this.videoFor(p.slug, p.video);
      const videoTexture = video ? new THREE.VideoTexture(video) : null;
      texture.userData.shared = true;
      if (videoTexture) videoTexture.userData.shared = true;
      // A valid poster stays visible during buffering, autoplay refusal or media errors.
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.planeMaterial(texture, aspect));
      const w = PW;
      const h = PW / aspect;
      plane.scale.set(w * (1 + MARGIN * 2), h * (1 + MARGIN * 2), 1);
      plane.userData.index = i;
      plane.userData.h = h;
      plane.renderOrder = 5;
      this.scene.add(plane);

      const label = new Panel3D({
        width: 1.2,
        height: 0.24,
        bend: 0,
        lines: [{ text: p.title, role: 'label' }],
        align: 'center',
        textScale: Math.min(1, q.textScale * 0.6),
        cut: [0.32, 0, 0.32, 0],
        fill: 0.5,
      });
      label.reveal = label.target = 1;
      label.mesh.userData.index = i;
      label.mesh.renderOrder = 5; // same as planes → depth-sorted together (far labels never draw over near planes)
      this.scene.add(label.mesh);
      this.projects.push({ plane, label, z: Z0 - i * GAP, x: XOFF[i % XOFF.length], y: YOFF[i % YOFF.length], hover: 0, video, cover: texture, coverAspect: aspect, videoTexture, playAttempted: false });
      report(0.2 + ((i + 1) / site.projects.length) * 0.5);
    }

    this.buildGhosts(covers, q.ghostCovers);
    this.buildHud();
    this.layout();
    report(1);
  }

  /* ---------------- covers ---------------- */
  private async coverFor(slug: string): Promise<{ texture: THREE.Texture; aspect: number; cover: HTMLCanvasElement }> {
    const imgs = manifest.projectImages(slug);
    const preferred = imgs.find((f) => /\/cover\.[a-z]+$/i.test(f)) ?? imgs[0];
    if (preferred) {
      try {
        const img = await loadImage(assetUrl(preferred));
        const c = document.createElement('canvas');
        const max = 1600;
        const s = Math.min(1, max / img.naturalWidth);
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        const t = new THREE.CanvasTexture(c);
        t.anisotropy = 8;
        return { texture: t, aspect: c.width / c.height, cover: c };
      } catch (e) {
        console.warn('[work] screenshot failed, using generated cover', e);
      }
    }
    const c = drawCover(slug, 1024, 640);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return { texture: t, aspect: 1024 / 640, cover: c };
  }

  private videoFor(slug: string, name: string | null): HTMLVideoElement | null {
    const src = manifest.projectVideo(slug, name);
    if (!src) return null;
    const v = document.createElement('video');
    v.src = assetUrl(src);
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    return v;
  }

  private planeMaterial(tex: THREE.Texture, aspect: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: tex },
        uActive: { value: 0 },
        uVel: { value: 0 },
        uTime: { value: 0 },
        uHover: { value: 0 },
        uOpacity: { value: 1 },
        uMargin: { value: MARGIN },
        uAspect: { value: aspect },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        uniform sampler2D uTex;
        uniform float uActive, uVel, uTime, uHover, uOpacity, uMargin, uAspect;
        varying vec2 vUv;
        void main(){
          vec2 uv = (vUv - 0.5) * (1.0 + uMargin * 2.0) + 0.5;
          float v = clamp(abs(uVel), 0.0, 1.0);
          float dir = uVel >= 0.0 ? 1.0 : -1.0;

          // horizontal slice displacement (glitch), only while moving
          float band = floor(uv.y * 30.0);
          float tick = floor(uTime * 16.0);
          float on = step(0.62, hash12(vec2(band, tick)));
          float shift = (hash12(vec2(band * 1.7, tick + 3.0)) - 0.5) * 0.18 * v * on;
          vec2 suv = uv + vec2(shift, 0.0);

          // motion smear along x
          vec3 col = vec3(0.0);
          float ws = 0.0;
          for (int i = 0; i < 6; i++) {
            float k = float(i) / 5.0;
            float w = 1.0 - k * 0.75;
            col += texture2D(uTex, suv - vec2(k * 0.06 * v * dir, 0.0)).rgb * w;
            ws += w;
          }
          col /= ws;
          // slight RGB split proportional to speed
          float rs = 0.008 * v;
          col.r = mix(col.r, texture2D(uTex, suv + vec2(rs, 0.0)).r, v);
          col.b = mix(col.b, texture2D(uTex, suv - vec2(rs, 0.0)).b, v);

          // inactive → desaturated toward blue and dimmed
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          vec3 blue = mix(vec3(0.02, 0.05, 0.14), C_P1 * 0.95, smoothstep(0.0, 0.9, l));
          col = mix(blue, col, uActive);
          col *= mix(0.5, 1.0, uActive) * (1.0 + uHover * 0.18);

          // image rect mask + edge bloom outside it
          vec2 q = abs(uv - 0.5) * 2.0;           // 0 at centre, 1 at the image edge
          float inside = step(q.x, 1.0) * step(q.y, 1.0);
          vec2 o = max(q - 1.0, 0.0) * vec2(uAspect, 1.0);
          float dOut = length(o);
          float bloom = exp(-dOut * 4.2) * (1.0 - inside) * (0.13 + uHover * 0.35 + v * 0.9) * (0.3 + uActive * 0.7);
          // 1px luminous rim on the image edge
          float edgeD = (1.0 - max(q.x, q.y));
          float fw = fwidth(edgeD);
          float rim = inside * (1.0 - smoothstep(fw * 0.5, fw * 1.8, edgeD));

          float a = inside * uOpacity;
          vec3 rimCol = mix(C_BORDER, C_HOVER * 1.3, uHover);
          vec3 outRgb = col * a + rimCol * rim * (0.08 + uHover * 0.5 + v * 0.12) * uOpacity;
          outRgb += mix(C_P2 * 0.9, C_FLARE, v * 0.4) * bloom * uOpacity;
          // horizontal light smears streaming out of the image edges while moving (reference)
          if (inside < 0.5 && q.y < 1.0 && v > 0.01) {
            float rowOn = step(0.5, hash12(vec2(floor(uv.y * 46.0), floor(uTime * 10.0))));
            float ex = uv.x < 0.0 ? 0.0 : 1.0;
            vec3 edgeCol = texture2D(uTex, vec2(clamp(uv.x, 0.002, 0.998), uv.y)).rgb;
            float smear = exp(-abs(uv.x - ex) * 6.0 / max(v, 0.05)) * rowOn * v;
            outRgb += edgeCol * mix(0.45, 1.0, uActive) * smear * 0.9 * uOpacity;
          }
          gl_FragColor = vec4(outRgb, a);
        }
      `,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    });
  }

  /* ---------------- corridor environment ---------------- */
  private buildCorridor(): void {
    this.grid = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vView;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        uniform float uTime, uOpacity;
        varying vec3 vWorld;
        varying vec3 vView;
        float lineMask(float c, float spacing){
          float g = abs(fract(c / spacing - 0.5) - 0.5) * spacing;
          float fw = fwidth(c);
          return 1.0 - smoothstep(fw * 0.5, fw * 1.6, g);
        }
        void main(){
          // pick the 2 in-plane axes from the dominant normal
          vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          vec2 c = abs(n.y) > 0.5 ? vWorld.xz : abs(n.x) > 0.5 ? vWorld.yz : vWorld.xy;
          float layer = abs(n.z) > 0.5 ? 0.24 : 1.0;
          float lx = lineMask(c.x, 1.25);
          float ly = lineMask(c.y, 2.5);
          // dotted: dots along each line
          float dx = smoothstep(0.32, 0.0, abs(fract(c.y * 2.2) - 0.5));
          float dy = smoothstep(0.32, 0.0, abs(fract(c.x * 2.2) - 0.5));
          float major = max(lineMask(c.x, 5.0), lineMask(c.y, 10.0));
          float g = max(lx * dx, ly * dy) * 0.55 + major * 0.35;
          float dist = length(vView);
          float fog = exp(-dist * 0.045) * smoothstep(0.5, 3.0, dist);
          float tw = 0.75 + 0.25 * vnoise(c * 0.7 + uTime * 0.2);
          vec3 col = mix(C_P4, C_P1, major) * g * fog * tw * 0.55 * uOpacity * layer;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const len = 150;
    const zc = -50;
    const mk = (w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.grid);
      m.frustumCulled = false;
      m.renderOrder = 1;
      this.scene.add(m);
      return m;
    };
    const floor = mk(16, len);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.6, zc);
    const ceil = mk(16, len);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 4.4, zc);
    const left = mk(len, 7);
    left.rotation.y = Math.PI / 2;
    left.position.set(-8, 0.9, zc);
    const right = mk(len, 7);
    right.rotation.y = -Math.PI / 2;
    right.position.set(8, 0.9, zc);

    // Faint cross-sections extend the existing grid through depth, as in the
    // reference lattice. These remain real world-space planes with parallax.
    for (let z = 10; z >= -110; z -= 12) {
      mk(16, 7).position.set(0, 0.9, z);
    }

    // long light lines converging to the vanishing point
    const pos: number[] = [];
    const t: number[] = [];
    const seed: number[] = [];
    const add = (a: THREE.Vector3, b: THREE.Vector3) => {
      const s = Math.random();
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      t.push(0, 1);
      seed.push(s, s);
    };
    for (let i = 0; i < 26; i++) {
      const side = i % 4;
      const u = Math.random();
      const x = side < 2 ? (side === 0 ? -8 : 8) : THREE.MathUtils.lerp(-8, 8, u);
      const y = side >= 2 ? (side === 2 ? -2.6 : 4.4) : THREE.MathUtils.lerp(-2.6, 4.4, u);
      add(new THREE.Vector3(x, y, 20), new THREE.Vector3(x, y, -120));
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 6;
      add(
        new THREE.Vector3(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.7 + 0.8, 14),
        new THREE.Vector3(Math.cos(a) * 0.6, Math.sin(a) * 0.4 + 0.8, -120),
      );
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    lg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    this.lines = new THREE.LineSegments(
      lg,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aT;
          attribute float aSeed;
          varying float vT;
          varying float vSeed;
          varying float vDist;
          void main(){
            vT = aT; vSeed = aSeed;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          ${PALETTE}
          uniform float uTime, uOpacity;
          varying float vT;
          varying float vSeed;
          varying float vDist;
          void main(){
            float pulse = pow(fract(vT * 4.0 - uTime * (0.05 + vSeed * 0.06) + vSeed * 7.0), 18.0);
            float base = 0.05 + 0.08 * vSeed;
            float fog = exp(-max(vDist, 0.0) * 0.022);
            vec3 col = mix(C_P3, C_FLARE, pulse) * (base + pulse * 0.9) * fog * uOpacity;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);

    // sparse bright dots
    this.dots = createDust({
      count: 320,
      min: new THREE.Vector3(-7.5, -2.5, -120),
      max: new THREE.Vector3(7.5, 4.2, 18),
      size: 2.6,
      opacity: 0.9,
      drift: 0.1,
      flares: 0.35,
    });
    this.scene.add(this.dots);
  }

  private buildGhosts(covers: HTMLCanvasElement[], count: number): void {
    const mat = (tex: THREE.Texture, op: number) =>
      new THREE.ShaderMaterial({
        uniforms: { uTex: { value: tex }, uOpacity: { value: op }, uBase: { value: op } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          ${PALETTE}
          uniform sampler2D uTex;
          uniform float uOpacity;
          varying vec2 vUv;
          void main(){
            float l = dot(texture2D(uTex, vUv).rgb, vec3(0.299, 0.587, 0.114));
            vec2 e = smoothstep(vec2(0.0), vec2(0.18), vUv) * smoothstep(vec2(0.0), vec2(0.18), 1.0 - vUv);
            gl_FragColor = vec4(mix(C_P5, C_P1, l) * e.x * e.y * uOpacity, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    const blurred = covers.map((c) => {
      const t = new THREE.CanvasTexture(blurredCover(c, 96));
      return t;
    });
    for (let i = 0; i < count; i++) {
      const tex = blurred[i % blurred.length];
      const w = 1.3 + Math.random() * 1.6;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 1.6), mat(tex, 0.16 + Math.random() * 0.14));
      const side = i % 2 === 0 ? -1 : 1;
      m.position.set(side * (3.6 + Math.random() * 3.4), -1.6 + Math.random() * 4.6, 6 - Math.random() * 70);
      m.rotation.y = -side * (0.15 + Math.random() * 0.3);
      m.renderOrder = 2;
      this.ghosts.push(m);
      this.scene.add(m);
    }
  }

  private buildHud(): void {
    const ring = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d')!;
      g.translate(256, 256);
      g.strokeStyle = '#9fc8ff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 230, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, 200, -0.4, 1.3);
      g.stroke();
      g.lineWidth = 1.5;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r0 = i % 6 === 0 ? 168 : 178;
        g.beginPath();
        g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        g.lineTo(Math.cos(a) * 186, Math.sin(a) * 186);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, 120, 2.2, 5.6);
      g.stroke();
      g.font = '600 26px Antonio, sans-serif';
      g.fillStyle = '#9fc8ff';
      g.textAlign = 'center';
      g.fillText('26.7458° N', 0, -6);
      g.fillText('94.2506° E', 0, 26);
      return c;
    };
    const block = (lines: string[]) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = '#9fc8ff';
      g.font = '600 30px Antonio, sans-serif';
      lines.forEach((l, i) => g.fillText(l, 12, 44 + i * 42));
      g.fillRect(12, 8, 80, 3);
      return c;
    };
    const items: [HTMLCanvasElement, number][] = [
      [ring(), 2.4],
      [block(['WORK / INDEX', 'PROJECTS 01—04', 'JORHAT · ASSAM']), 2.2],
      [ring(), 1.8],
      [block(['SCROLL TO FLY', 'CLICK TO OPEN', '← → TO SWITCH']), 2.0],
      [ring(), 2.8],
      [block(['JEC · CSE', 'BUILD · SHIP · LEARN']), 2.0],
    ];
    items.forEach(([c, size], i) => {
      const t = new THREE.CanvasTexture(c);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, (size * c.height) / c.width),
        new THREE.MeshBasicMaterial({
          map: t,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color('#6bb0f9'),
        }),
      );
      const side = i % 2 === 0 ? 1 : -1;
      m.position.set(side * (4.6 + (i % 3) * 0.9), (i % 3) * 1.4 - 1.2, -4 - i * 11);
      m.rotation.y = -side * 0.35;
      m.userData.spin = c.width === c.height ? (i % 2 ? 0.05 : -0.04) : 0;
      m.renderOrder = 2;
      this.hud.push(m);
      this.scene.add(m);
    });
  }

  /* ---------------- camera path ---------------- */
  private layout(): void {
    const cam = this.camera;
    const narrow = cam.aspect < 1;
    // reference: a project at rest spans ~25–30% of a desktop viewport
    const frac = narrow ? 0.88 : THREE.MathUtils.lerp(0.55, 0.28, THREE.MathUtils.smoothstep(cam.aspect, 1, 1.6));
    const follow = narrow ? 1 : FOLLOW;
    const th = tanHalfHFov(cam);
    const dd = PW / (frac * 2 * th);
    const camY = PROJECT_Y - 0.15;
    const lookY = PROJECT_Y - 0.3;

    this.projects.forEach((p) => {
      p.plane.position.set(p.x, PROJECT_Y + p.y, p.z);
      const h = p.plane.userData.h as number;
      p.label.mesh.position.set(p.x, PROJECT_Y + p.y - h / 2 - 0.26, p.z + 0.01);
    });

    const pos: THREE.Vector3[] = [];
    const look: THREE.Vector3[] = [];
    const first = this.projects[0];
    const last = this.projects[this.projects.length - 1];
    pos.push(new THREE.Vector3(0, camY + 0.3, first.z + dd + 16));
    look.push(new THREE.Vector3(0, lookY, first.z - 4));
    pos.push(new THREE.Vector3(0, camY + 0.15, first.z + dd + 6));
    look.push(new THREE.Vector3(first.x * 0.5, lookY, first.z - 2));
    this.dwell = [];
    this.projects.forEach((p, i) => {
      const zd = p.z + dd;
      this.dwell.push(zd);
      const cx = p.x * follow;
      const cy = p.y * follow;
      pos.push(new THREE.Vector3(cx, camY + cy, zd + 0.5));
      look.push(new THREE.Vector3(cx, lookY + cy, p.z));
      pos.push(new THREE.Vector3(cx, camY + cy, zd - 0.5));
      look.push(new THREE.Vector3(cx, lookY + cy, p.z));
      if (i < this.projects.length - 1) {
        const n = this.projects[i + 1];
        // sweep slightly sideways while flying through
        pos.push(new THREE.Vector3((p.x + n.x) / 2 + (i % 2 ? -0.6 : 0.6), camY + 0.25, p.z - 3));
        look.push(new THREE.Vector3(n.x, lookY, n.z - 6));
      }
    });
    // last project scales up toward full screen
    const full = (PW * 0.92) / (2 * th);
    const ly = PROJECT_Y + last.y;
    pos.push(new THREE.Vector3(last.x, ly - 0.05, last.z + Math.max(full, 1.2)));
    look.push(new THREE.Vector3(last.x, ly, last.z));
    pos.push(new THREE.Vector3(last.x, ly, last.z + 0.35));
    look.push(new THREE.Vector3(last.x, ly, last.z - 2));
    this.path = new CameraPath(pos, look);
    this.segments = pos.length - 1;
    this.rig.reset();
  }

  /** Local progress at which project i is centred (for deep links / keyboard). */
  dwellProgress(i: number): number {
    // control-point index of the dwell pair midpoint: 2 + i*3 + 0.5
    const idx = 2 + i * 3 + 0.5;
    return clamp(idx / this.segments);
  }

  get activeIndex(): number {
    const z = this.camera.position.z;
    let best = 0;
    let bd = Infinity;
    this.dwell.forEach((d, i) => {
      const dist = Math.abs(z - d);
      if (dist < bd) {
        bd = dist;
        best = i;
      }
    });
    return best;
  }

  update(dt: number, time: number): void {
    const p = this.progress;
    const reduced = this.ctx.reducedMotion;
    if (reduced) {
      const index = Math.min(this.projects.length - 1, Math.floor(p * this.projects.length));
      if (index !== this.reducedCameraIndex) this.rig.reset();
      this.reducedCameraIndex = index;
      this.path.sample(this.dwellProgress(index), this.tmpP, this.tmpL);
    } else {
      this.reducedCameraIndex = -1;
      this.path.sample(p, this.tmpP, this.tmpL);
    }
    // very subtle pointer parallax only
    const ptr = this.ctx.input.pointer;
    const amt = reduced || this.ctx.isTouch ? 0 : THREE.MathUtils.degToRad(0.8);
    this.rig.update(dt, this.tmpP, this.tmpL, -ptr.x * amt, ptr.y * amt * 0.6);

    // velocity (units/s) → 0..1, damped so it settles smoothly to a clean image
    const target = reduced ? 0 : clamp(this.velocity / 1.4, -1, 1);
    this.vel += (target - this.vel) * (1 - Math.exp(-dt * 10));
    if (Math.abs(this.vel) < 0.002) this.vel = 0;

    const camZ = this.camera.position.z;
    const n = this.projects.length;
    this.projects.forEach((pv, i) => {
      const u = pv.plane.material.uniforms;
      const dz = camZ - this.dwell[i];
      const active = 1 - smoothstep(1.0, 6.0, Math.abs(dz));
      const last = i === n - 1;
      const pass = last ? smoothstep(pv.z + 0.2, pv.z + 1.0, camZ) : smoothstep(pv.z + 0.4, pv.z + 2.2, camZ);
      const far = 1 - smoothstep(30, 52, camZ - pv.z);
      // the last project fills the screen, then fades to haze before Contact (reference)
      const lastFade = last ? 1 - smoothstep(0.86, 0.94, this.progress) : 1;
      const op = pass * Math.max(far, 0.0) * lastFade;
      pv.hover += ((this.hovered === i ? 1 : 0) - pv.hover) * (1 - Math.exp(-dt * (this.hovered === i ? 6.7 : 8.5)));
      u.uActive.value = active;
      u.uVel.value = this.vel;
      u.uTime.value = time;
      u.uHover.value = pv.hover;
      u.uOpacity.value = op;
      pv.plane.visible = op > 0.002;
      pv.label.hoverTarget = this.hovered === i ? 1 : 0;
      pv.label.mesh.material.uniforms.uOpacity.value = op * (0.45 + active * 0.55);
      pv.label.update(dt, time);
      pv.label.mesh.visible = op > 0.002;
      // videos only play when near the camera
      if (pv.video) {
        const near = this.active && Math.abs(dz) < 9;
        if (near && !reduced && !pv.playAttempted) {
          pv.playAttempted = true;
          void pv.video.play().catch(() => { /* retain cover if autoplay is unavailable */ });
        } else if (!near || reduced) {
          pv.video.pause();
          pv.playAttempted = false;
        }
        const playable = !reduced && !pv.video.error && pv.video.readyState >= 2 && !pv.video.paused;
        u.uTex.value = playable ? pv.videoTexture : pv.cover;
        if (playable && pv.video.videoWidth && pv.video.videoHeight) {
          const aspect = pv.video.videoWidth / pv.video.videoHeight;
          if (u.uAspect.value !== aspect) {
            u.uAspect.value = aspect;
            const h = PW / aspect;
            pv.plane.scale.y = h * (1 + MARGIN * 2);
            pv.plane.userData.h = h;
            pv.label.mesh.position.y = PROJECT_Y + pv.y - h / 2 - 0.26;
          }
        } else if (u.uAspect.value !== pv.coverAspect) {
          const aspect = pv.coverAspect;
          u.uAspect.value = aspect;
          pv.plane.scale.y = PW / aspect * (1 + MARGIN * 2);
          pv.plane.userData.h = PW / aspect;
          pv.label.mesh.position.y = PROJECT_Y + pv.y - PW / aspect / 2 - 0.26;
        }
      }
    });

    const endFade = smoothstep(0.84, 0.96, p);
    this.haze.uniforms.uTime.value = time;
    this.haze.uniforms.uEnd.value = endFade * 0.5;
    this.grid.uniforms.uTime.value = time;
    this.grid.uniforms.uOpacity.value = 1 - endFade;
    this.lines.material.uniforms.uTime.value = time;
    this.lines.material.uniforms.uOpacity.value = 1 - endFade;
    this.dots.material.uniforms.uTime.value = time;
    this.dots.material.uniforms.uPixelRatio.value = this.ctx.dpr;
    for (const h of this.hud) {
      h.rotation.z += (h.userData.spin as number) * dt * (reduced ? 0 : 1);
      h.material.opacity = 0.1 * (1 - endFade);
    }
    for (const g of this.ghosts) {
      const d = camZ - g.position.z;
      g.material.uniforms.uOpacity.value = (g.material.uniforms.uBase.value as number) * smoothstep(-2, 6, d) * (1 - smoothstep(40, 60, d)) * (1 - endFade);
    }
  }

  pick(ndc: THREE.Vector2): boolean {
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = this.pickTargets;
    targets.length = 0;
    for (const p of this.projects) {
      if ((p.plane.material.uniforms.uOpacity.value as number) > 0.3) targets.push(p.plane, p.label.mesh);
    }
    this.hits.length = 0;
    this.raycaster.intersectObjects(targets, false, this.hits);
    const margin = MARGIN / (1 + MARGIN * 2);
    const hit = this.hits.find((candidate) => {
      const pv = this.projects[candidate.object.userData.index as number];
      if (candidate.object !== pv.plane) return true;
      const uv = candidate.uv;
      return uv && uv.x >= margin && uv.x <= 1 - margin && uv.y >= margin && uv.y <= 1 - margin;
    });
    this.hovered = hit ? (hit.object.userData.index as number) : -1;
    return this.hovered >= 0;
  }

  click(ndc: THREE.Vector2): boolean {
    if (!this.pick(ndc)) return false;
    this.onOpen(this.hovered);
    return true;
  }

  clearHover(): void {
    this.hovered = -1;
  }

  resize(w: number, h: number, dpr: number): void {
    super.resize(w, h, dpr);
    if (this.projects.length) this.layout();
  }

  applyQuality(q: QualitySettings): void {
    super.applyQuality(q);
    this.ghosts.forEach((g, i) => (g.visible = i < q.ghostCovers));
  }

  setActive(on: boolean): void {
    super.setActive(on);
    if (!on) this.pauseMedia();
  }

  pauseMedia(): void {
    for (const p of this.projects) {
      p.video?.pause();
      p.playAttempted = false;
    }
  }

  dispose(): void {
    for (const p of this.projects) {
      p.video?.pause();
      p.video?.removeAttribute('src');
      p.video?.load();
      p.cover.dispose();
      p.videoTexture?.dispose();
      p.label.dispose();
    }
    super.dispose();
  }
}
