import * as THREE from 'three';
import { site } from '../../content/site.config';
import { smoothstep } from '../../app/state';
import { CameraPath, tanHalfHFov } from '../../camera/camera';
import { createDust } from '../../particles/dust';
import type { QualitySettings } from '../../quality/quality';
import { FULLSCREEN_VERT, NOISE, PALETTE } from '../../shaders/chunks';
import { backgroundMesh } from '../../shaders/fullscreen';
import { BaseScene, BG_COLOR, type SceneContext } from '../BaseScene';
import { Panel3D } from '../shared/panel3d';
import { loadPortrait, type PortraitCloud } from './portrait';

const DEG = Math.PI / 180;
// Reference capture: panels span ~16–19% of a desktop viewport and hug the head.
const PANEL_W = 0.46;
const RING_R = 0.62;
/** Approx. head width of the subject (placeholder/GLB are normalised to ~0.7). */
const HEAD_W = 0.7;

/**
 * ABOUT — particle-cloud portrait with rim light, a slowly rotating particle
 * disc at shoulder height, and curved panels on an arc around the head that
 * reveal one by one as the scroll-driven camera reaches them.
 * The pointer does NOT rotate this camera: the spline alone frames each shot.
 */
export class AboutScene extends BaseScene {
  readonly id = 'about' as const;
  private cloud!: PortraitCloud;
  private portrait!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private disc!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private dust!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private haze!: THREE.ShaderMaterial;
  private panels: Panel3D[] = [];
  private panelGroup = new THREE.Group();
  private path!: CameraPath;
  private dFocus = 2.2;
  private ring = { center: new THREE.Vector3(), radius: 1, angles: [] as number[] };
  private frostRT: THREE.WebGLRenderTarget | null = null;
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private tmpP = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  private tmpV = new THREE.Vector3();

  constructor(ctx: SceneContext) {
    super(ctx, 40);
  }

  get portraitMode(): PortraitCloud['mode'] {
    return this.cloud?.mode ?? 'placeholder';
  }

  async build(report: (f: number) => void): Promise<void> {
    const q = this.ctx.quality;

    this.haze = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        uniform float uTime, uFade;
        varying vec2 vUv;
        void main(){
          float g = smoothstep(1.15, 0.0, length((vUv - vec2(0.5, 0.58)) * vec2(1.0, 1.25)));
          vec3 col = mix(C_HAZE_LO, C_HAZE_HI * 1.1, g);
          float f = fbm(vUv * vec2(2.0, 2.6) + vec2(uTime * 0.01, -uTime * 0.006));
          col += vec3(0.012, 0.03, 0.08) * f;
          // reference: a teal cast across the right side / upper right of the About scene
          col += vec3(0.0, 0.06, 0.065) * smoothstep(0.35, 1.0, vUv.x) * (0.45 + 0.55 * vUv.y);
          col *= 0.92;
          col = mix(col, C_HAZE_HI * 1.25 + vec3(0.0, 0.02, 0.05) * f, uFade);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(backgroundMesh(this.haze));

    // ---- portrait ----
    this.cloud = await loadPortrait(q.portraitPoints, (f) => report(f * 0.6));
    if (this.cloud.mode === 'placeholder') {
      console.info('[about] No portrait found in public/assets/portrait/ — showing the abstract placeholder sculpture.');
    }
    this.portrait = this.makePortrait(this.cloud);
    this.scene.add(this.portrait);
    report(0.65);

    // ---- vortex disc at shoulder height ----
    this.disc = this.makeDisc(q.discPoints);
    // chest level, below the shoulders, so the camera sees it as a wide swirling plane
    this.disc.material.uniforms.uY.value = this.cloud.headY - 1.0;
    this.scene.add(this.disc);

    this.dust = createDust({
      count: Math.round(q.dust * 0.6),
      min: new THREE.Vector3(-9, -3, -9),
      max: new THREE.Vector3(9, 6, 9),
      size: 1.2,
      opacity: 0.55,
      drift: 0.2,
    });
    this.scene.add(this.dust);
    report(0.75);

    // ---- panels ----
    const contents = [site.about.intro, ...site.about.panels];
    for (const c of contents) {
      const p = new Panel3D({
        width: PANEL_W,
        // curvature matches the arc the panels sit on (see layout())
        bend: this.cloud.mode === 'photo' ? 9.2 : RING_R,
        title: c.title,
        body: c.body,
        textScale: q.textScale,
        cut: [0.1, 0, 0.1, 0],
        fill: 0.46, // reference panels are quite transparent
      });
      this.panels.push(p);
      this.panelGroup.add(p.mesh);
    }
    this.scene.add(this.panelGroup);
    this.setupFrost(q);
    this.layout();
    report(1);
  }

  private makePortrait(c: PortraitCloud): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
    g.setAttribute('aNormal', new THREE.BufferAttribute(c.normals, 3));
    g.setAttribute('aEdge', new THREE.BufferAttribute(c.edge, 1));
    g.setAttribute('aLum', new THREE.BufferAttribute(c.lum, 1));
    const rnd = new Float32Array(c.count * 4);
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: 5.2 },
        uOpacity: { value: 1 },
        uDensity: { value: 1 },
        uHeadY: { value: c.headY },
        uHasNormals: { value: c.mode === 'photo' ? 0 : 1 },
        uMotion: { value: 1 },
      },
      vertexShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        attribute vec3 aNormal;
        attribute float aEdge;
        attribute float aLum;
        attribute vec4 aRand;
        uniform float uTime, uPixelRatio, uSize, uOpacity, uDensity, uHeadY, uHasNormals, uMotion;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vec3 p = position;
          float t = uTime * uMotion;
          vec2 rad = p.xz;
          float rl = length(rad);
          rad = rl > 1e-4 ? rad / rl : vec2(0.0);
          // gentle radial drift (breathing)
          p.xz += rad * (sin(t * 0.7 + aRand.x * 6.2831) * 0.5 + 0.5) * 0.012 * aRand.y;
          // small vortex around the vertical axis
          float ang = 0.025 * sin(t * 0.35 + p.y * 2.3);
          float s = sin(ang), c = cos(ang);
          p.xz = mat2(c, -s, s, c) * p.xz;
          // fine curl-noise wandering
          p += curlish(p * 2.2 + aRand.xyz * 3.0, t * 0.4) * 0.008;
          // a few particles detach, drift upward and fade
          float riser = step(0.94, aRand.w);
          float life = fract(t * (0.05 + aRand.y * 0.06) + aRand.x);
          p.y += riser * life * 0.55;
          p.xz += riser * rad * life * 0.18;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;

          // rim light: fresnel from normals, or the edge attribute for photos
          vec3 nV = normalize(normalMatrix * aNormal + vec3(1e-5));
          vec3 vd = normalize(-mv.xyz);
          float fres = uHasNormals * pow(1.0 - abs(dot(nV, vd)), 2.6);
          float top = smoothstep(uHeadY + 0.05, uHeadY + 0.42, position.y) * max(aNormal.y, 0.0) * uHasNormals;
          // fixed key light from upper-left-front: the bust reads as a lit volume
          // (reference: face filled, brightest on hair/edges) rather than a glowing shell
          float key = uHasNormals * max(dot(normalize(aNormal + vec3(1e-5)), normalize(vec3(-0.35, 0.75, 0.55))), 0.0);
          float rim = clamp(max(aEdge, fres * 0.6) + top * 0.55, 0.0, 1.0);

          // occasional bright flares travelling across the surface
          float cyc = t * 0.06 + 0.25;
          float bandY = mix(-0.3, 3.1, fract(cyc));
          float sel = step(0.6, hash11(aRand.z * 97.0 + floor(cyc) * 13.0));
          float flare = exp(-pow((p.y - bandY + sin(p.x * 3.0 + t) * 0.12) * 8.0, 2.0)) * sel;

          float tw = 0.6 + 0.4 * sin(t * (0.9 + aRand.y * 2.4) + aRand.x * 50.0); // per-point fade
          vAlpha = uOpacity * uDensity * tw * (0.07 + aLum * 0.15 + key * 0.3 + rim * 0.5 + flare * 0.7) * (1.0 - riser * life);
          vColor = mix(mix(C_P5, C_P3, aLum), C_P1, max(rim, key * 0.55)) + C_FLARE * (flare * 0.7 + rim * rim * 0.25);
          float size = uSize * (0.55 + aRand.z * 0.8) * (1.0 + rim * 0.45 + flare * 1.1);
          gl_PointSize = clamp(size * uPixelRatio / -mv.z, 0.5, 9.0 * uPixelRatio);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    this.updateDensity(pts, c.count);
    return pts;
  }

  private updateDensity(pts: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>, drawn: number): void {
    // fewer points on lower tiers → each point a bit brighter so the figure reads the same
    pts.material.uniforms.uDensity.value = THREE.MathUtils.clamp(Math.sqrt(90000 / drawn), 0.75, 2.2);
  }

  private makeDisc(count: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3); // unused by shader except bounds
    const disc = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const r = 0.85 + Math.pow(u, 2.1) * 15;
      disc[i * 4] = r;
      disc[i * 4 + 1] = Math.random() * Math.PI * 2;
      disc[i * 4 + 2] = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      disc[i * 4 + 3] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDisc', new THREE.BufferAttribute(disc, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uY: { value: 0.95 },
        uPixelRatio: { value: 1 },
        uOpacity: { value: 1 },
        uMotion: { value: 1 },
      },
      vertexShader: /* glsl */ `
        ${PALETTE}
        attribute vec4 aDisc;
        uniform float uTime, uY, uPixelRatio, uOpacity, uMotion;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float r = aDisc.x;
          // vortex: inner rings rotate faster
          float ang = aDisc.y + uTime * uMotion * 0.16 / pow(r, 0.75);
          float arms = 0.5 + 0.5 * sin(ang * 2.0 - log(r) * 4.5);
          float y = uY + aDisc.z * (0.015 + 0.02 * r) + sin(ang * 3.0 + uTime * 0.25) * 0.012 * r;
          vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float inner = smoothstep(0.85, 1.6, r);
          float outer = 1.0 - smoothstep(9.0, 15.5, r);
          float tw = 0.65 + 0.35 * sin(uTime * (1.0 + aDisc.w * 2.0) + aDisc.w * 60.0);
          vAlpha = uOpacity * inner * outer * tw * (0.3 + 1.2 * pow(arms, 3.0));
          vColor = mix(C_P4, C_P1, pow(arms, 2.0) * aDisc.w);
          gl_PointSize = clamp((4.6 + aDisc.w * 3.6) * uPixelRatio / -mv.z, 0.7, 5.0 * uPixelRatio);
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
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 1;
    return pts;
  }

  private setupFrost(q: QualitySettings): void {
    this.frostRT?.dispose();
    this.frostRT = null;
    if (q.frost) {
      this.frostRT = new THREE.WebGLRenderTarget(4, 4, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
        generateMipmaps: false,
      });
      this.frostRT.texture.userData.shared = true;
      this.resizeFrost();
    }
    for (const p of this.panels) p.setBackdrop(this.frostRT?.texture ?? null);
  }

  private resizeFrost(): void {
    if (!this.frostRT) return;
    const w = Math.max(4, Math.round((this.ctx.width * this.ctx.dpr) / 4));
    const h = Math.max(4, Math.round((this.ctx.height * this.ctx.dpr) / 4));
    this.frostRT.setSize(w, h);
  }

  /**
   * Layout of panels + camera spline. Two variants:
   *  - volumetric (GLB / placeholder): panels on a ring around the head; the camera
   *    goes front → close → three-quarter → profile → behind, then slides past right.
   *  - relief (photo, 2.5D): panels on a wide shallow arc in front of the portrait
   *    and the camera stays within ±~35° so the flatness is never exposed.
   */
  private layout(): void {
    const headY = this.cloud.headY;
    const cam = this.camera;
    const narrow = cam.aspect < 1;
    const relief = this.cloud.mode === 'photo';
    const th2 = 2 * tanHalfHFov(cam);
    // desktop: camera distance chosen so the HEAD spans ~22% of the width (reference),
    // which leaves the focused panel at ~19%. Phone: the panel must fill ~80% instead.
    const panelFrac = narrow ? 0.8 : THREE.MathUtils.lerp(0.42, 0.19, THREE.MathUtils.smoothstep(cam.aspect, 1, 1.5));
    const headDist = HEAD_W / (THREE.MathUtils.lerp(0.5, 0.22, THREE.MathUtils.smoothstep(cam.aspect, 1, 1.5)) * th2);
    this.dFocus = relief || narrow
      ? Math.max(1.05, PANEL_W / (panelFrac * th2))
      : Math.max(1.05, headDist - RING_R);

    const ring = this.ring;
    if (relief) {
      ring.center.set(0, headY, -7.3);
      ring.radius = 9.2;
      ring.angles = this.panels.map((_, i) => (-15 + i * 6) * DEG);
    } else {
      ring.center.set(0, headY, 0);
      ring.radius = RING_R;
      // 48° apart (chord > panel width), starting beside the face → ends near profile/behind
      ring.angles = this.panels.map((_, i) => (20 + i * 48) * DEG);
    }
    const Rc = ring.radius + this.dFocus;

    this.panels.forEach((p, i) => {
      const a = ring.angles[i];
      p.mesh.position.set(
        ring.center.x + Math.sin(a) * ring.radius,
        headY - 0.06, // eye level
        ring.center.z + Math.cos(a) * ring.radius,
      );
      p.mesh.rotation.set(0, a, 0);
      // re-bend to the ring radius so the panels sit on the arc
      p.mesh.userData.angle = a;
    });

    const orbit = (azDeg: number, r: number, y: number) =>
      new THREE.Vector3(
        ring.center.x + Math.sin(azDeg * DEG) * r,
        y,
        ring.center.z + Math.cos(azDeg * DEG) * r,
      );
    const panelPt = (i: number) => this.panels[i].mesh.position.clone();
    const head = new THREE.Vector3(0, headY, 0);
    const lookAtPanel = (i: number) => head.clone().lerp(panelPt(i), relief ? 1 : 0.72);

    const pos: THREE.Vector3[] = [];
    const look: THREE.Vector3[] = [];
    const a0 = ring.angles[0] / DEG;
    if (relief) {
      // approach: whole portrait → close
      pos.push(orbit(a0, Rc + 3.4, headY - 0.4));
      look.push(new THREE.Vector3(0, headY - 0.25, 0));
      pos.push(orbit(a0, Rc + 1.9, headY - 0.2));
      look.push(new THREE.Vector3(0, headY - 0.1, 0));
      pos.push(orbit(a0, Rc + 0.6, headY - 0.04));
      look.push(lookAtPanel(0).lerp(head, 0.3));
    } else {
      // reference: the portrait emerges as a close, frontal head-and-shoulders shot
      // (no panels yet), then the camera swings round to the first panel
      pos.push(orbit(-6, Rc + 1.0, headY - 0.12));
      look.push(new THREE.Vector3(0, headY - 0.22, 0));
      pos.push(orbit(-2, Rc + 0.55, headY - 0.06));
      look.push(new THREE.Vector3(0, headY - 0.14, 0));
      pos.push(orbit(a0 - 16, Rc + 0.15, headY - 0.04));
      look.push(lookAtPanel(0).lerp(head, 0.4));
    }
    // dwell at each panel (two close points = slow down there)
    const dw = relief ? 1.5 : 5;
    // volumetric: dwell slightly before each panel's azimuth, so by parallax the head
    // sits to the right of the focused panel (as in the reference capture)
    const lead = relief ? 0 : -7;
    this.panels.forEach((_, i) => {
      const a = ring.angles[i] / DEG + lead;
      pos.push(orbit(a - dw, Rc, headY + 0.01));
      look.push(lookAtPanel(i));
      pos.push(orbit(a + dw, Rc, headY + 0.01));
      look.push(lookAtPanel(i));
    });
    // slide past the figure to the right and dissolve into empty haze
    const aEnd = ring.angles[this.panels.length - 1] / DEG;
    if (relief) {
      pos.push(orbit(aEnd + 8, Rc + 0.3, headY + 0.05));
      look.push(orbit(aEnd + 30, ring.radius, headY));
      pos.push(orbit(aEnd + 16, Rc + 1.4, headY + 0.1));
      look.push(orbit(aEnd + 55, ring.radius, headY));
    } else {
      // reference exit: push in to a near-profile close-up, then pan so the head
      // slides off the right edge and the scene dissolves into haze
      const leftOf = (azDeg: number, amt: number) =>
        head.clone().add(new THREE.Vector3(-Math.cos(azDeg * DEG), 0, Math.sin(azDeg * DEG)).multiplyScalar(amt));
      pos.push(orbit(aEnd + 12, Rc - 0.55, headY - 0.02));
      look.push(leftOf(aEnd + 12, 0.35));
      pos.push(orbit(aEnd + 22, Rc - 0.35, headY));
      look.push(leftOf(aEnd + 22, 1.6));
    }
    this.path = new CameraPath(pos, look);
    this.rig.reset();
  }

  update(dt: number, time: number): void {
    const p = this.progress;
    const reduced = this.ctx.reducedMotion;

    // camera: spline only — no pointer yaw in About
    this.path.sample(p, this.tmpP, this.tmpL);
    this.rig.update(dt, this.tmpP, this.tmpL, 0, 0);

    const motion = reduced ? 0.25 : 1;
    // reference: the figure dissolves into haze before the corridor emerges
    const fadeOut = smoothstep(0.84, 0.95, p);
    const pu = this.portrait.material.uniforms;
    pu.uTime.value = time;
    pu.uPixelRatio.value = this.ctx.dpr;
    pu.uMotion.value = motion;
    pu.uOpacity.value = 1 - fadeOut * 0.97;
    const du = this.disc.material.uniforms;
    du.uTime.value = time;
    du.uPixelRatio.value = this.ctx.dpr;
    du.uMotion.value = motion;
    du.uOpacity.value = 1 - fadeOut * 0.7;
    this.dust.material.uniforms.uTime.value = time;
    this.dust.material.uniforms.uPixelRatio.value = this.ctx.dpr;
    this.haze.uniforms.uTime.value = time;
    this.haze.uniforms.uFade.value = fadeOut * 0.6;

    // panel reveal triggers: in frustum + within distance + facing the camera
    this.camera.updateMatrixWorld();
    this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const camPos = this.camera.position;
    // only the nearest qualifying panel may fully reveal → strictly one by one
    let nearest = -1;
    let nearestD = Infinity;
    const info = this.panels.map((panel, i) => {
      const c = panel.mesh.position;
      this.sphere.set(c, PANEL_W * 0.45);
      const inView = this.frustum.intersectsSphere(this.sphere);
      const d = camPos.distanceTo(c);
      const a = panel.mesh.userData.angle as number;
      this.tmpV.subVectors(camPos, c).normalize();
      const facing = this.tmpV.x * Math.sin(a) + this.tmpV.z * Math.cos(a);
      const ok = inView && facing > 0.25 && p < 0.9;
      if (ok && d < this.dFocus + 0.14 && d < nearestD) {
        nearestD = d;
        nearest = i;
      }
      return { ok, d };
    });
    this.panels.forEach((panel, i) => {
      const { ok, d } = info[i];
      let target = 0;
      if (ok) {
        if (i === nearest) target = 1;
        else if (d < this.dFocus + 0.7) target = 0.3; // further away: light bar only
      }
      panel.target = target;
      panel.speedIn = reduced ? 1 / 0.6 : 1 / 2.0;
      panel.speedOut = reduced ? 1 / 0.5 : 1 / 1.6;
      panel.update(dt, time);
    });
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    for (const p of this.panels) p.setResolution(target.width, target.height);
    const anyPanel = this.panels.some((p) => p.mesh.visible);
    if (this.frostRT && anyPanel) {
      // low-res backdrop (scene without panels) for the frosted glass.
      // Point sizes are in pixels → scale them to the quarter-res target.
      const pts = [this.portrait, this.disc, this.dust];
      const scale = this.frostRT.width / target.width;
      pts.forEach((p) => (p.material.uniforms.uPixelRatio.value = this.ctx.dpr * scale));
      this.panelGroup.visible = false;
      renderer.setRenderTarget(this.frostRT);
      renderer.setClearColor(BG_COLOR, 1);
      renderer.clear(true, false, false);
      renderer.render(this.scene, this.camera);
      this.panelGroup.visible = true;
      pts.forEach((p) => (p.material.uniforms.uPixelRatio.value = this.ctx.dpr));
    }
    super.render(renderer, target);
  }

  resize(w: number, h: number, dpr: number): void {
    super.resize(w, h, dpr);
    this.resizeFrost();
    if (this.cloud) this.layout();
  }

  applyQuality(q: QualitySettings): void {
    super.applyQuality(q);
    const n = Math.min(this.cloud.count, q.portraitPoints);
    this.portrait.geometry.setDrawRange(0, n);
    this.updateDensity(this.portrait, n);
    this.disc.geometry.setDrawRange(0, Math.min(q.discPoints, this.disc.geometry.attributes.aDisc.count));
    this.setupFrost(q);
  }

  setActive(on: boolean): void {
    super.setActive(on);
    // free the frost target while About is not on screen
    if (!on && this.frostRT) {
      this.frostRT.setSize(4, 4);
    } else if (on) this.resizeFrost();
  }

  dispose(): void {
    super.dispose();
    this.panels.forEach((p) => p.dispose());
    this.frostRT?.dispose();
  }
}
