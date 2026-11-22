import * as THREE from 'three';
import { FullscreenPass } from '../../shaders/fullscreen';
import { NOISE } from '../../shaders/chunks';

/**
 * GPU stable-fluids simulation (after Jos Stam / Pavel Dobryakov's WebGL fluid,
 * MIT), on ping-pong half-float render targets:
 *   splat pointer velocity + dye → curl → vorticity confinement → divergence
 *   → pressure (Jacobi, N iterations) → gradient subtract → advect velocity
 *   → advect dye (with dissipation, so the wake fades over ~1–2 s).
 *
 * Modes:
 *   'full'  : pressure projection with N iterations (high/mid tier)
 *   'lite'  : no pressure solve (low tier) — still advects + curls
 *   'trail' : no float render targets available — dye only, advected by a
 *             procedural curl field in RGBA8 (keeps the reveal-trail behaviour)
 */

export type FluidMode = 'full' | 'lite' | 'trail';

interface DoubleRT {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  swap(): void;
}

const BASE_VERT = /* glsl */ `
uniform vec2 texelSize;
varying vec2 vUv, vL, vR, vT, vB;
void main(){
  vUv = position.xy * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const HEAD = /* glsl */ `varying vec2 vUv, vL, vR, vT, vB;\n`;

const SHADERS = {
  splat: HEAD + /* glsl */ `
    uniform sampler2D uTarget;
    uniform float aspectRatio, radius;
    uniform vec3 color;
    uniform vec2 point;
    void main(){
      vec2 p = vUv - point;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }`,
  advection: HEAD + /* glsl */ `
    uniform sampler2D uVelocity, uSource;
    uniform vec2 texelSize;
    uniform float dt, dissipation;
    void main(){
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
      gl_FragColor = result * exp(-dissipation * dt);
    }`,
  divergence: HEAD + /* glsl */ `
    uniform sampler2D uVelocity;
    void main(){
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x;
      if (vR.x > 1.0) R = -C.x;
      if (vT.y > 1.0) T = -C.y;
      if (vB.y < 0.0) B = -C.y;
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }`,
  curl: HEAD + /* glsl */ `
    uniform sampler2D uVelocity;
    void main(){
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }`,
  vorticity: HEAD + /* glsl */ `
    uniform sampler2D uVelocity, uCurl;
    uniform float curl, dt;
    void main(){
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 vel = texture2D(uVelocity, vUv).xy + force * dt;
      gl_FragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
    }`,
  pressure: HEAD + /* glsl */ `
    uniform sampler2D uPressure, uDivergence;
    void main(){
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float div = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
    }`,
  gradientSubtract: HEAD + /* glsl */ `
    uniform sampler2D uPressure, uVelocity;
    void main(){
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
      gl_FragColor = vec4(v, 0.0, 1.0);
    }`,
  scale: HEAD + /* glsl */ `
    uniform sampler2D uTexture;
    uniform float value;
    void main(){ gl_FragColor = value * texture2D(uTexture, vUv); }`,
  trail: HEAD + NOISE + /* glsl */ `
    uniform sampler2D uSource;
    uniform float dt, dissipation, time;
    void main(){
      vec2 flow = curlish(vec3(vUv * 4.0, 0.0), time * 0.6).xy * 0.06;
      vec4 r = texture2D(uSource, vUv - flow * dt);
      gl_FragColor = r * exp(-dissipation * dt);
    }`,
};

type ProgramName = keyof typeof SHADERS;

export interface FluidOptions {
  simRes: number;
  dyeRes: number;
  pressureIterations: number;
  mode: FluidMode;
}

export class Fluid {
  readonly mode: FluidMode;
  private renderer: THREE.WebGLRenderer;
  private pass = new FullscreenPass();
  private programs = {} as Record<ProgramName, THREE.ShaderMaterial>;
  private velocity!: DoubleRT;
  private dye!: DoubleRT;
  private pressure!: DoubleRT;
  private divergence!: THREE.WebGLRenderTarget;
  private curlRT!: THREE.WebGLRenderTarget;
  private simTexel = new THREE.Vector2();
  private dyeTexel = new THREE.Vector2();
  private splats: { x: number; y: number; dx: number; dy: number; amount: number }[] = [];
  private opts: FluidOptions;
  private time = 0;
  /** Black 1x1 used as velocity in 'trail' mode. */
  private zero = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  aspect = 1;
  // physics constants
  curl = 22;
  velocityDissipation = 0.9;
  densityDissipation = 1.5;
  pressureDecay = 0.8;
  splatRadius = 0.0019;
  splatForce = 5200;

  constructor(renderer: THREE.WebGLRenderer, opts: FluidOptions) {
    this.renderer = renderer;
    this.opts = opts;
    this.mode = opts.mode;
    this.zero.needsUpdate = true;
    this.zero.userData.shared = true;
    for (const name of Object.keys(SHADERS) as ProgramName[]) {
      this.programs[name] = new THREE.ShaderMaterial({
        uniforms: {
          texelSize: { value: new THREE.Vector2() },
          uTarget: { value: null },
          aspectRatio: { value: 1 },
          radius: { value: 0.003 },
          color: { value: new THREE.Vector3() },
          point: { value: new THREE.Vector2() },
          uVelocity: { value: null },
          uSource: { value: null },
          dt: { value: 0.016 },
          dissipation: { value: 1 },
          uCurl: { value: null },
          curl: { value: 30 },
          uPressure: { value: null },
          uDivergence: { value: null },
          uTexture: { value: null },
          value: { value: 0.8 },
          time: { value: 0 },
        },
        vertexShader: BASE_VERT,
        fragmentShader: SHADERS[name],
        depthTest: false,
        depthWrite: false,
      });
    }
    this.allocate();
  }

  /** Can this renderer render to half-float targets? */
  static supportsFloat(renderer: THREE.WebGLRenderer): boolean {
    const ext = renderer.extensions;
    return ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  }

  private rt(w: number, h: number, float: boolean): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, {
      type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    t.texture.userData.shared = true;
    return t;
  }

  private double(w: number, h: number, float: boolean): DoubleRT {
    const d: DoubleRT = {
      read: this.rt(w, h, float),
      write: this.rt(w, h, float),
      swap() {
        const t = this.read;
        this.read = this.write;
        this.write = t;
      },
    };
    return d;
  }

  private dims(res: number): [number, number] {
    const a = Math.max(this.aspect, 1 / this.aspect);
    const min = Math.round(res);
    const max = Math.round(res * a);
    return this.aspect >= 1 ? [max, min] : [min, max];
  }

  private allocate(): void {
    const float = this.mode !== 'trail';
    const [sw, sh] = this.dims(this.opts.simRes);
    const [dw, dh] = this.dims(this.opts.dyeRes);
    this.simTexel.set(1 / sw, 1 / sh);
    this.dyeTexel.set(1 / dw, 1 / dh);
    this.dye = this.double(dw, dh, float);
    if (float) {
      this.velocity = this.double(sw, sh, true);
      this.pressure = this.double(sw, sh, true);
      this.divergence = this.rt(sw, sh, true);
      this.curlRT = this.rt(sw, sh, true);
    }
    // Explicit zero initial conditions, including on resize/quality changes.
    const previous = this.renderer.getRenderTarget();
    const color = this.renderer.getClearColor(new THREE.Color());
    const alpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0, 0);
    const targets = [this.dye.read, this.dye.write];
    if (float) targets.push(this.velocity.read, this.velocity.write, this.pressure.read, this.pressure.write, this.divergence, this.curlRT);
    for (const target of targets) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setClearColor(color, alpha);
    this.renderer.setRenderTarget(previous);
  }

  private release(): void {
    this.dye?.read.dispose();
    this.dye?.write.dispose();
    if (this.velocity) {
      this.velocity.read.dispose();
      this.velocity.write.dispose();
      this.pressure.read.dispose();
      this.pressure.write.dispose();
      this.divergence.dispose();
      this.curlRT.dispose();
    }
  }

  resize(aspect: number): void {
    if (Math.abs(aspect - this.aspect) < 0.01) return;
    this.aspect = aspect;
    this.release();
    this.allocate();
  }

  get dyeTexture(): THREE.Texture {
    return this.dye.read.texture;
  }

  get velocityTexture(): THREE.Texture {
    return this.velocity ? this.velocity.read.texture : this.zero;
  }

  /** Queue a splat. x,y in UV (0..1), dx,dy = UV delta this frame. */
  splat(x: number, y: number, dx: number, dy: number, amount = 0.35): void {
    if (this.splats.length < 24) this.splats.push({ x, y, dx, dy, amount });
  }

  private run(name: ProgramName, target: THREE.WebGLRenderTarget, set: (u: Record<string, THREE.IUniform>) => void): void {
    const m = this.programs[name];
    set(m.uniforms);
    this.pass.render(this.renderer, target, m);
  }

  step(dt: number): void {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (dt === 0) return;
    const prevAuto = this.renderer.autoClear;
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.autoClear = false;
    try {
      for (const s of this.splats) this.applySplat(s);
      this.splats.length = 0;
      // Consume elapsed time instead of slowing dissipation on a 30 Hz device.
      // At most three passes; a suspended tab never accumulates simulation debt.
      const steps = Math.min(3, Math.max(1, Math.ceil(dt * 60)));
      for (let i = 0; i < steps; i++) this.advance(dt / steps);
    } finally {
      this.renderer.autoClear = prevAuto;
      this.renderer.setRenderTarget(prevTarget);
    }
  }

  private advance(dt: number): void {
    this.time += dt;
    if (this.mode === 'trail') {
      this.run('trail', this.dye.write, (u) => {
        u.texelSize.value.copy(this.dyeTexel);
        u.uSource.value = this.dye.read.texture;
        u.dt.value = dt;
        u.dissipation.value = this.densityDissipation;
        u.time.value = this.time;
      });
      this.dye.swap();
      return;
    }

    const st = this.simTexel;
    this.run('curl', this.curlRT, (u) => {
      u.texelSize.value.copy(st);
      u.uVelocity.value = this.velocity.read.texture;
    });
    this.run('vorticity', this.velocity.write, (u) => {
      u.texelSize.value.copy(st);
      u.uVelocity.value = this.velocity.read.texture;
      u.uCurl.value = this.curlRT.texture;
      u.curl.value = this.curl;
      u.dt.value = dt;
    });
    this.velocity.swap();

    if (this.mode === 'full' && this.opts.pressureIterations > 0) {
      this.run('divergence', this.divergence, (u) => {
        u.texelSize.value.copy(st);
        u.uVelocity.value = this.velocity.read.texture;
      });
      this.run('scale', this.pressure.write, (u) => {
        u.texelSize.value.copy(st);
        u.uTexture.value = this.pressure.read.texture;
        u.value.value = Math.pow(this.pressureDecay, dt * 60);
      });
      this.pressure.swap();
      for (let i = 0; i < this.opts.pressureIterations; i++) {
        this.run('pressure', this.pressure.write, (u) => {
          u.texelSize.value.copy(st);
          u.uPressure.value = this.pressure.read.texture;
          u.uDivergence.value = this.divergence.texture;
        });
        this.pressure.swap();
      }
      this.run('gradientSubtract', this.velocity.write, (u) => {
        u.texelSize.value.copy(st);
        u.uPressure.value = this.pressure.read.texture;
        u.uVelocity.value = this.velocity.read.texture;
      });
      this.velocity.swap();
    }

    this.run('advection', this.velocity.write, (u) => {
      u.texelSize.value.copy(st);
      u.uVelocity.value = this.velocity.read.texture;
      u.uSource.value = this.velocity.read.texture;
      u.dt.value = dt;
      u.dissipation.value = this.velocityDissipation;
    });
    this.velocity.swap();

    this.run('advection', this.dye.write, (u) => {
      u.texelSize.value.copy(st);
      u.uVelocity.value = this.velocity.read.texture;
      u.uSource.value = this.dye.read.texture;
      u.dt.value = dt;
      u.dissipation.value = this.densityDissipation;
    });
    this.dye.swap();
  }

  private applySplat(s: { x: number; y: number; dx: number; dy: number; amount: number }): void {
    const radius = this.splatRadius * (this.aspect > 1 ? this.aspect : 1);
    if (this.velocity) {
      this.run('splat', this.velocity.write, (u) => {
        u.texelSize.value.copy(this.simTexel);
        u.uTarget.value = this.velocity.read.texture;
        u.aspectRatio.value = this.aspect;
        u.point.value.set(s.x, s.y);
        const resolutionScale = this.opts.simRes / 128;
        u.color.value.set(s.dx * this.splatForce * resolutionScale, s.dy * this.splatForce * resolutionScale, 0);
        u.radius.value = radius;
      });
      this.velocity.swap();
    }
    this.run('splat', this.dye.write, (u) => {
      u.texelSize.value.copy(this.dyeTexel);
      u.uTarget.value = this.dye.read.texture;
      u.aspectRatio.value = this.aspect;
      u.point.value.set(s.x, s.y);
      u.color.value.set(s.amount, s.amount, s.amount);
      u.radius.value = radius * 1.25;
    });
    this.dye.swap();
  }

  dispose(): void {
    this.release();
    Object.values(this.programs).forEach((p) => p.dispose());
    this.zero.dispose();
  }
}
