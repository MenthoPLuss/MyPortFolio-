import * as THREE from 'three';
import { NOISE, PALETTE } from '../shaders/chunks';

/**
 * Fine star-dust: tiny twinkling points, GPU-animated (drift + twinkle in the
 * vertex shader). Used by every scene, optionally displaced by a velocity
 * texture (Home's fluid).
 */
export interface DustOptions {
  count: number;
  /** Box the points live in. */
  min: THREE.Vector3;
  max: THREE.Vector3;
  size?: number;
  opacity?: number;
  drift?: number;
  /** Fraction of brighter "flare" points. */
  flares?: number;
}

export function createDust(opts: DustOptions): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const { count, min, max } = opts;
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = THREE.MathUtils.lerp(min.x, max.x, Math.random());
    pos[i * 3 + 1] = THREE.MathUtils.lerp(min.y, max.y, Math.random());
    pos[i * 3 + 2] = THREE.MathUtils.lerp(min.z, max.z, Math.random());
    rnd[i * 4] = Math.random();
    rnd[i * 4 + 1] = Math.random();
    rnd[i * 4 + 2] = Math.random();
    rnd[i * 4 + 3] = Math.random() < (opts.flares ?? 0.04) ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: opts.size ?? 1.6 },
      uOpacity: { value: opts.opacity ?? 0.7 },
      uDrift: { value: opts.drift ?? 0.25 },
      uVel: { value: null },
      uVelScale: { value: 0 },
    },
    vertexShader: /* glsl */ `
      ${NOISE}
      attribute vec4 aRand;
      uniform float uTime, uPixelRatio, uSize, uDrift, uVelScale;
      uniform sampler2D uVel;
      varying float vAlpha;
      varying float vFlare;
      void main(){
        vec3 p = position;
        p += curlish(p * 0.35 + aRand.xyz * 6.0, uTime * 0.15) * uDrift * (0.4 + aRand.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec4 clip = projectionMatrix * mv;
        if (uVelScale > 0.0) {
          vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
          vec2 v = texture2D(uVel, suv).xy;
          clip.xy += v * uVelScale * clip.w * (0.4 + aRand.z);
        }
        gl_Position = clip;
        float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aRand.y * 2.2) + aRand.x * 40.0);
        vFlare = aRand.w;
        vAlpha = tw * (0.35 + aRand.z * 0.65);
        float s = uSize * (0.55 + aRand.z * 0.9) * (1.0 + aRand.w * 1.6);
        gl_PointSize = clamp(s * uPixelRatio * (8.0 / max(-mv.z, 0.5)), 0.6, 6.0 * uPixelRatio);
      }
    `,
    fragmentShader: /* glsl */ `
      ${PALETTE}
      uniform float uOpacity;
      varying float vAlpha;
      varying float vFlare;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d);
        vec3 col = mix(C_P2, C_FLARE, vFlare * 0.7 + 0.15);
        gl_FragColor = vec4(col * a * vAlpha * uOpacity, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
