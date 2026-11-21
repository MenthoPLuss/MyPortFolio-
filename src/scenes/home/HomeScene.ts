import * as THREE from 'three';
import { site } from '../../content/site.config';
import { smoothstep } from '../../app/state';
import { CameraPath } from '../../camera/camera';
import { createDust } from '../../particles/dust';
import type { QualitySettings } from '../../quality/quality';
import { FULLSCREEN_VERT, NOISE, PALETTE } from '../../shaders/chunks';
import { backgroundMesh } from '../../shaders/fullscreen';
import { BaseScene, type SceneContext } from '../BaseScene';
import { Fluid, type FluidMode } from './fluid';
import { buildWordmarkMask, wordmarkMaterial, type WordmarkMask } from './wordmark';

/**
 * HOME — volumetric wordmark sunk in haze, revealed by a GPU fluid driven by
 * the pointer (light source moving through a fluid), 3 parallax particle layers.
 * Scroll dollies the camera into the letters.
 */
export class HomeScene extends BaseScene {
  readonly id = 'home' as const;
  private fluid: Fluid | null = null;
  private mask!: WordmarkMask;
  private word!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private haze!: THREE.ShaderMaterial;
  private layers: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private path!: CameraPath;
  private tmpP = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  private intro = 0;
  private introStarted = false;
  private auto = { t: 0, x: 0.5, y: 0.5 };
  private lastSplat = new THREE.Vector2(0.5, 0.5);
  private activity = 0;
  private corner0 = new THREE.Vector3();
  private corner1 = new THREE.Vector3();
  private light = new THREE.Vector2(0.5, 0.5);
  private wordWorldW = 6;
  private resTarget = new THREE.Vector2(1, 1);
  private subPt = new THREE.Vector3();
  /** On narrow screens BORO + subtitle are HTML (readable size), anchored here (CSS px). */
  readonly sub = { x: 0, y: 0, narrow: false };

  constructor(ctx: SceneContext) {
    super(ctx, 35);
  }

  async build(report: (f: number) => void): Promise<void> {
    const q = this.ctx.quality;
    this.mask = buildWordmarkMask(
      site.person.firstName.toUpperCase(),
      site.person.lastName.toUpperCase(),
      site.person.subtitle,
    );
    report(0.3);

    this.createFluid(q);

    // background haze
    this.haze = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDye: { value: this.fluid?.dyeTexture ?? null },
        uHasFluid: { value: this.fluid ? 1 : 0 },
        uIntro: { value: 0 },
        uDolly: { value: 0 },
        uHalo: { value: new THREE.Vector3(0.5, 0.5, 0) },
        uAspect: { value: 1 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        uniform sampler2D uDye;
        uniform float uTime, uHasFluid, uIntro, uDolly, uAspect;
        uniform vec3 uHalo;
        varying vec2 vUv;
        void main(){
          vec2 c = (vUv - vec2(0.5, 0.52)) * vec2(1.0, 1.5);
          float g = smoothstep(1.05, 0.0, length(c));
          vec3 col = mix(C_HAZE_LO, C_HAZE_HI * 0.88, g);
          // horizontal haze band around the wordmark
          float band = exp(-pow((vUv.y - 0.53) * 4.2, 2.0));
          float f = fbm(vec2(vUv.x * 2.2 + uTime * 0.012, vUv.y * 3.4 - uTime * 0.008));
          col += vec3(0.02, 0.045, 0.12) * band * (0.55 + f * 0.9);
          col += vec3(0.012, 0.028, 0.075) * f;
          // the fluid wake glowing in the fog (curls + fades)
          float d = texture2D(uDye, vUv).r * uHasFluid;
          col += vec3(0.05, 0.11, 0.30) * clamp(d, 0.0, 1.0) * 0.05 * uIntro;
          // soft halo where the light currently is (reference: bloom behind lit letters, no smoke)
          vec2 hq = (vUv - uHalo.xy) * vec2(uAspect, 1.0);
          col += vec3(0.04, 0.07, 0.2) * exp(-dot(hq, hq) * 22.0) * uHalo.z * uIntro;
          // flying in → brighter, denser fog
          col += C_P5 * 0.22 * uDolly * (0.5 + f);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(backgroundMesh(this.haze));

    // wordmark plane
    const mat = wordmarkMaterial(q.wordmarkSteps, q.godRays, q.tier === 'high' ? 16 : 10);
    mat.uniforms.uMask.value = this.mask.texture;
    mat.uniforms.uDye.value = this.fluid?.dyeTexture ?? null;
    mat.uniforms.uVel.value = this.fluid?.velocityTexture ?? null;
    mat.uniforms.uHasFluid.value = this.fluid ? 1 : 0;
    this.word = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.word.renderOrder = 1;
    this.word.frustumCulled = false;
    this.scene.add(this.word);
    report(0.6);

    // 3 particle layers (fg / mid / bg) — parallax via real depth
    const [fg, mid, bg] = q.homeParticles;
    const mk = (count: number, z0: number, z1: number, spread: number, size: number, opacity: number) => {
      const p = createDust({
        count,
        min: new THREE.Vector3(-spread, -spread * 0.6, z0),
        max: new THREE.Vector3(spread, spread * 0.6, z1),
        size,
        opacity,
        drift: 0.35,
        flares: 0.05,
      });
      p.material.uniforms.uVel.value = this.fluid?.velocityTexture ?? null;
      p.material.uniforms.uVelScale.value = this.fluid ? 0.00009 : 0;
      p.renderOrder = 2;
      this.scene.add(p);
      this.layers.push(p);
    };
    mk(bg, -30, -6, 26, 1.3, 0.75);
    mk(mid, -6, 4, 9, 1.6, 0.8);
    mk(fg, 4, 9, 3.2, 2.4, 0.55);

    this.layout();
    report(1);
  }

  private createFluid(q: QualitySettings): void {
    this.fluid?.dispose();
    this.fluid = null;
    if (this.ctx.reducedMotion) return; // fluid off for reduced motion
    const float = Fluid.supportsFloat(this.ctx.renderer);
    const mode: FluidMode = !float ? 'trail' : q.pressureIterations > 0 ? 'full' : 'lite';
    this.fluid = new Fluid(this.ctx.renderer, {
      simRes: q.fluidSim,
      dyeRes: q.fluidDye,
      pressureIterations: q.pressureIterations,
      mode,
    });
    this.fluid.resize(this.ctx.width / this.ctx.height);
  }

  private bindFluid(): void {
    const dye = this.fluid?.dyeTexture ?? null;
    const vel = this.fluid?.velocityTexture ?? null;
    const has = this.fluid ? 1 : 0;
    const wu = this.word.material.uniforms;
    wu.uDye.value = dye;
    wu.uVel.value = vel;
    wu.uHasFluid.value = has;
    this.haze.uniforms.uDye.value = dye;
    this.haze.uniforms.uHasFluid.value = has;
    for (const l of this.layers) {
      l.material.uniforms.uVel.value = vel;
      l.material.uniforms.uVelScale.value = has ? 0.00009 : 0;
    }
  }

  /** Size the wordmark to the viewport width (fit by design, generous margins). */
  private layout(): void {
    const cam = this.camera;
    const dist = 10;
    const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const visW = visH * cam.aspect;
    const frac = cam.aspect < 0.8 ? 0.9 : cam.aspect < 1.2 ? 0.8 : 0.64;
    this.wordWorldW = visW * frac;
    const planeW = this.wordWorldW / this.mask.textFrac;
    const planeH = planeW * this.mask.aspect;
    this.word.scale.set(planeW, planeH, 1);
    // slab depth proportional to letter height
    const capWorld = planeH * this.mask.capFrac;
    const u = this.word.material.uniforms;
    u.uPlaneSize.value.set(planeW, planeH);
    u.uDepth.value = capWorld * 0.55;
    // slight lift so the CTA has room below on tall screens
    this.word.position.set(0, cam.aspect < 0.8 ? 0.35 : 0.15, 0);
    u.uCenter.value.set(this.word.position.x, this.word.position.y);

    const y = this.word.position.y;
    this.path = new CameraPath(
      [
        new THREE.Vector3(0, y, 10),
        new THREE.Vector3(0, y - 0.02, 8.2),
        new THREE.Vector3(0, y - 0.06, 5.2),
        new THREE.Vector3(0, y - 0.1, 2.6),
        new THREE.Vector3(0, y - 0.14, 1.0),
      ],
      [
        new THREE.Vector3(0, y, 0),
        new THREE.Vector3(0, y - 0.02, -1),
        new THREE.Vector3(0, y - 0.08, -3),
        new THREE.Vector3(0, y - 0.14, -6),
        new THREE.Vector3(0, y - 0.2, -9),
      ],
    );
  }

  /** Called when the loader hands over: wordmark emerges from the fog. */
  startIntro(instant = false): void {
    this.introStarted = true;
    this.auto.t = instant ? 3 : 0;
    if (instant) this.intro = 1;
  }

  update(dt: number, time: number): void {

    const p = this.progress;
    const input = this.ctx.input.pointer;
    const reduced = this.ctx.reducedMotion;

    if (this.introStarted) this.intro = Math.min(1, this.intro + dt / (reduced ? 0.6 : 2.4));
    const introE = smoothstep(0, 1, this.intro);

    // ---- fluid input: pointer splats, plus an autonomous wisp when idle/touch ----
    if (this.fluid) {
      if (input.active && input.idle < 0.05 && (input.du !== 0 || input.dv !== 0)) {
        const du = input.du;
        const dv = input.dv;
        const speed = Math.hypot(du, dv);
        this.fluid.splat(input.u, input.v, du, dv, 0.09 + Math.min(0.32, speed * 6));
        this.activity = Math.min(1, this.activity + speed * 9);
        this.lastSplat.set(input.u, input.v);
      }
      // intro sweep across the wordmark, then gentle idle wandering
      // reference: with a mouse, the letters fall back into the fog when you stop.
      // The autonomous wisp only runs before the first pointer move, or on touch.
      const idle = !input.active || (this.ctx.isTouch && input.idle > 2.5);
      if (this.introStarted && (this.auto.t < 2.6 || idle)) {
        this.auto.t += dt;
        const t = this.auto.t;
        let x: number;
        let y: number;
        if (t < 2.6) {
          const k = smoothstep(0.2, 2.4, t);
          x = 0.12 + k * 0.76;
          y = 0.53 + Math.sin(t * 3.2) * 0.04;
        } else {
          x = 0.5 + Math.sin(t * 0.37) * 0.33 + Math.sin(t * 0.83) * 0.06;
          y = 0.53 + Math.sin(t * 0.61) * 0.05;
        }
        const dx = x - this.auto.x;
        const dy = y - this.auto.y;
        this.auto.x = x;
        this.auto.y = y;
        if (t > 0.05) this.fluid.splat(x, y, dx, dy, t < 2.6 ? 0.13 : 0.04);
        if (idle) this.lastSplat.set(x, y);
      }
      this.fluid.step(dt);
      // ping-pong swapped the read targets → rebind every frame
      this.bindFluid();
    }

    // ---- camera: dolly into the letters with scroll; damped pointer yaw/pitch ----
    this.path.sample(p, this.tmpP, this.tmpL);
    const maxYaw = THREE.MathUtils.degToRad(this.ctx.isTouch || reduced ? 0 : 2.6);
    const yaw = -input.x * maxYaw * (1 - p);
    const pitch = input.y * maxYaw * 0.6 * (1 - p);
    this.rig.update(dt, this.tmpP, this.tmpL, yaw, pitch);

    // light source (screen uv) follows the last splat; activity decays like the wake
    this.light.lerp(this.lastSplat, 1 - Math.exp(-dt * 6));
    this.activity *= Math.exp(-dt * 1.3);
    this.updateMaskXform();

    const camZ = this.camera.position.z;
    const wu = this.word.material.uniforms;
    wu.uTime.value = time;
    wu.uIntro.value = introE;
    wu.uBlur.value = smoothstep(5.5, 1.6, camZ);
    wu.uFade.value = smoothstep(0.86, 1, p) * 0.6;
    wu.uBase.value = reduced ? 0.55 : 0.1 + smoothstep(0.2, 0.9, p) * 0.35;
    wu.uLightS.value.copy(this.light);
    wu.uAspect.value = this.camera.aspect;
    wu.uRes.value.copy(this.resTarget);
    this.sub.narrow = this.camera.aspect < 0.8;
    wu.uSub.value = this.sub.narrow ? 0 : 1;
    if (this.sub.narrow) {
      const size = wu.uPlaneSize.value as THREE.Vector2;
      this.subPt.set(0, this.word.position.y + (0.5 - this.mask.subTop) * size.y, 0).project(this.camera);
      this.sub.x = (this.subPt.x * 0.5 + 0.5) * this.ctx.width;
      this.sub.y = (-this.subPt.y * 0.5 + 0.5) * this.ctx.height;
    }

    const hu = this.haze.uniforms;
    hu.uTime.value = time;
    hu.uIntro.value = introE;
    hu.uDolly.value = smoothstep(0.3, 1, p);
    hu.uHalo.value.set(this.light.x, this.light.y, this.activity * (1 - p));
    hu.uAspect.value = this.camera.aspect;

    for (const l of this.layers) {
      l.material.uniforms.uTime.value = time;
      l.material.uniforms.uPixelRatio.value = this.ctx.dpr;
      l.material.uniforms.uOpacity.value = (l.userData.base ?? (l.userData.base = l.material.uniforms.uOpacity.value)) * introE;
    }
  }

  /** Affine screen-uv → mask-uv transform from the projected plane corners (for screen-space rays). */
  private updateMaskXform(): void {
    this.word.updateMatrixWorld();
    const c0 = this.corner0.set(-0.5, -0.5, 0).applyMatrix4(this.word.matrixWorld).project(this.camera);
    const c1 = this.corner1.set(0.5, 0.5, 0).applyMatrix4(this.word.matrixWorld).project(this.camera);
    const ax = c0.x * 0.5 + 0.5;
    const ay = c0.y * 0.5 + 0.5;
    const sx = 1 / Math.max(1e-4, c1.x * 0.5 + 0.5 - ax);
    const sy = 1 / Math.max(1e-4, c1.y * 0.5 + 0.5 - ay);
    (this.word.material.uniforms.uMaskXform.value as THREE.Vector4).set(sx, sy, -ax * sx, -ay * sy);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    this.resTarget.set(target.width, target.height);
    this.word.material.uniforms.uRes.value.copy(this.resTarget);
    super.render(renderer, target);
  }

  resize(w: number, h: number, dpr: number): void {
    super.resize(w, h, dpr);
    this.fluid?.resize(w / h);
    this.bindFluid();
    this.layout();
    this.rig.reset();
  }

  applyQuality(q: QualitySettings): void {
    super.applyQuality(q);
    this.createFluid(q);
    this.bindFluid();
    const [fg, mid, bg] = q.homeParticles;
    const counts = [bg, mid, fg];
    this.layers.forEach((l, i) => l.geometry.setDrawRange(0, counts[i]));
    const mat = wordmarkMaterial(q.wordmarkSteps, q.godRays, q.tier === 'high' ? 16 : 10);
    const old = this.word.material;
    for (const k of Object.keys(old.uniforms)) mat.uniforms[k].value = old.uniforms[k].value;
    this.word.material = mat;
    old.dispose();
    this.bindFluid();
  }

  dispose(): void {
    super.dispose();
    this.fluid?.dispose();
    this.fluid = null;
  }
}
