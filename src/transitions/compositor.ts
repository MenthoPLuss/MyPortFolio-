import * as THREE from 'three';
import { FULLSCREEN_VERT, NOISE, PALETTE } from '../shaders/chunks';
import { FullscreenPass } from '../shaders/fullscreen';

/**
 * Final composite. Outgoing scene (tA) and incoming scene (tB) are rendered to
 * separate render targets and blended here with:
 *   crossfade (noise-dissolved) + mild UV warp + controlled swirl around centre
 *   + small RGB separation + haze lift,
 * ALL distortion multiplied by sin(PI * t) * uFx, so it is exactly zero at
 * t = 0 and t = 1 (and zero everywhere when reduced motion sets uFx = 0).
 * With no transition (t = 0) tA passes through untouched except vignette+dither.
 */
export class Compositor {
  readonly material: THREE.ShaderMaterial;
  private pass: FullscreenPass;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: null },
        tB: { value: null },
        uT: { value: 0 },
        uFx: { value: 1 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uHaze: { value: 1 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        ${PALETTE}
        ${NOISE}
        uniform sampler2D tA, tB;
        uniform float uT, uFx, uTime, uAspect, uHaze;
        varying vec2 vUv;

        vec3 split(sampler2D t, vec2 uv, vec2 o){
          return vec3(texture2D(t, uv + o).r, texture2D(t, uv).g, texture2D(t, uv - o).b);
        }

        void main(){
          float t = clamp(uT, 0.0, 1.0);
          float k = sin(3.14159265 * t) * uFx;          // distortion envelope
          vec2 c = vUv - 0.5;
          c.x *= uAspect;
          float r = length(c);

          // controlled swirl around the centre (stronger near the middle)
          float ang = k * 0.55 * exp(-r * 2.2);
          float s = sin(ang), co = cos(ang);
          vec2 cs = mat2(co, -s, s, co) * c;
          cs.x /= uAspect;
          vec2 uv = cs + 0.5;

          // mild warp
          vec2 w = vec2(
            fbm3(uv * 3.0 + vec2(uTime * 0.25, 0.0)) - 0.5,
            fbm3(uv * 3.0 + vec2(4.7, uTime * 0.21)) - 0.5
          );
          uv += w * 0.05 * k;

          // outgoing pushes in, incoming settles from slightly wide
          vec2 uvA = (uv - 0.5) * (1.0 - 0.07 * t * uFx) + 0.5;
          vec2 uvB = (uv - 0.5) * (1.0 + 0.07 * (1.0 - t) * uFx) + 0.5;

          // small RGB separation (radial), zero at rest
          vec2 dir = (r > 1e-4 ? c / r : vec2(0.0)) * vec2(1.0 / uAspect, 1.0);
          vec2 o = dir * 0.0065 * k;

          vec3 a = k > 0.0001 ? split(tA, uvA, o) : texture2D(tA, uvA).rgb;
          vec3 col = a;
          if (t > 0.0) {
            vec3 b = k > 0.0001 ? split(tB, uvB, o) : texture2D(tB, uvB).rgb;
            // noise-dissolved crossfade; exactly a at t=0 and b at t=1
            float n = fbm3(vUv * 3.5 + uTime * 0.05);
            float m = clamp(t * 1.6 - 0.3 + (n - 0.5) * 0.6 * k, 0.0, 1.0);
            m = smoothstep(0.0, 1.0, m);
            col = mix(a, b, m);
            // dissolve "into haze" mid-way
            col = mix(col, C_HAZE_HI * 1.25 + vec3(0.0, 0.02, 0.06) * n, 0.35 * sin(3.14159265 * t) * uHaze);
          }

          // vignette toward the deep haze colour + dither (kills banding)
          float vig = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(1.0, 1.1)) * 1.35);
          col = mix(C_HAZE_LO, col, mix(0.6, 1.0, vig));
          col += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * 1.5;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.pass = new FullscreenPass(this.material);
  }

  render(
    renderer: THREE.WebGLRenderer,
    a: THREE.Texture,
    b: THREE.Texture | null,
    t: number,
    time: number,
    aspect: number,
    fx: number,
  ): void {
    const u = this.material.uniforms;
    u.tA.value = a;
    u.tB.value = b ?? a;
    u.uT.value = b ? t : 0;
    u.uFx.value = fx;
    u.uTime.value = time;
    u.uAspect.value = aspect;
    u.uHaze.value = fx > 0 ? 1 : 0.4;
    this.pass.render(renderer, null);
  }

  dispose(): void {
    this.material.dispose();
  }
}
