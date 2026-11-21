/**
 * Shared GLSL chunks. ShaderMaterial under WebGL2: three.js injects
 * `#version 300 es` and maps texture2D/gl_FragColor/varying for us.
 *
 * Colour management is disabled app-wide, so hex values below are used as-is
 * (what you write is what reaches the screen).
 */

export const PALETTE = /* glsl */ `
const vec3 C_BG      = vec3(0.0196, 0.0667, 0.1490); // #051126
const vec3 C_HAZE_HI = vec3(0.0510, 0.1098, 0.2510); // #0d1c40
const vec3 C_HAZE_LO = vec3(0.0118, 0.0392, 0.1137); // #030a1d
const vec3 C_TEXT    = vec3(0.7098, 0.8118, 1.0000); // #B5CFFF
const vec3 C_BORDER  = vec3(0.4196, 0.6902, 0.9765); // #6bb0f9
const vec3 C_HOVER   = vec3(0.4196, 0.7216, 1.0000); // #6bb8ff
const vec3 C_RIM     = vec3(0.0392, 0.5059, 1.0000); // #0A81FF
const vec3 C_FLARE   = vec3(0.7490, 0.8941, 1.0000); // #bfe4ff
const vec3 C_P1      = vec3(0.3725, 0.6902, 1.0000); // #5fb0ff
const vec3 C_P2      = vec3(0.2392, 0.5451, 1.0000); // #3d8bff
const vec3 C_P3      = vec3(0.1686, 0.4314, 0.9490); // #2b6ef2
const vec3 C_P4      = vec3(0.1294, 0.3373, 0.8392); // #2156d6
const vec3 C_P5      = vec3(0.0902, 0.2471, 0.6588); // #173fa8
`;

export const NOISE = /* glsl */ `
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
float fbm3(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(11.3, 5.7); a *= 0.5; }
  return s;
}
/* Divergence-free, cheap "curl-like" field: each component only depends on the
   other two coordinates, so div(F) = 0. Good enough for wandering particles. */
vec3 curlish(vec3 p, float t){
  return vec3(
    sin(p.y * 1.7 + t) + cos(p.z * 1.3 - t * 0.7),
    sin(p.z * 1.9 - t * 0.8) + cos(p.x * 1.1 + t * 0.6),
    sin(p.x * 1.5 + t * 0.5) + cos(p.y * 1.4 - t * 0.9)
  ) * 0.5;
}
`;

/** Chamfered rectangle signed distance. cut = (tl, tr, br, bl) in the same units as p. */
export const CHAMFER = /* glsl */ `
float sdChamferRect(vec2 p, vec2 b, vec4 cut){
  vec2 d = abs(p) - b;
  float box = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  float c = p.x < 0.0 ? (p.y > 0.0 ? cut.x : cut.w) : (p.y > 0.0 ? cut.y : cut.z);
  float ch = (abs(p.x) + abs(p.y) - (b.x + b.y - c)) * 0.70710678;
  return max(box, ch);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
