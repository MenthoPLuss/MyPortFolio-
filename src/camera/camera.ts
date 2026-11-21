import * as THREE from 'three';
import { damp } from '../app/state';

/**
 * Per-scene camera path: separate CatmullRomCurve3 splines for position and
 * look-at target, sampled by scroll progress (getPoint, i.e. uniform per control
 * point — clustering points makes the camera dwell there).
 */
export class CameraPath {
  pos: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;

  constructor(pos: THREE.Vector3[], look: THREE.Vector3[]) {
    this.pos = new THREE.CatmullRomCurve3(pos, false, 'centripetal');
    this.look = new THREE.CatmullRomCurve3(look, false, 'centripetal');
  }

  sample(t: number, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
    const u = Math.min(1, Math.max(0, t));
    this.pos.getPoint(u, outPos);
    this.look.getPoint(u, outLook);
  }
}

/**
 * Damping on top of the spline sample + per-scene pointer yaw/pitch.
 * Yaw/pitch are applied after lookAt as small local rotations.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  k = 9;
  private first = true;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  update(
    dt: number,
    targetPos: THREE.Vector3,
    targetLook: THREE.Vector3,
    yawTarget = 0,
    pitchTarget = 0,
  ): void {
    if (this.first) {
      this.snap(targetPos, targetLook);
    } else {
      const f = damp(this.k, dt);
      this.pos.lerp(targetPos, f);
      this.look.lerp(targetLook, f);
      const g = damp(3.2, dt);
      this.yaw += (yawTarget - this.yaw) * g;
      this.pitch += (pitchTarget - this.pitch) * g;
    }
    this.apply();
  }

  snap(p: THREE.Vector3, l: THREE.Vector3): void {
    this.pos.copy(p);
    this.look.copy(l);
    this.first = false;
    this.apply();
  }

  /** Next update() snaps instead of damping (used when a scene re-enters via a jump). */
  reset(): void {
    this.first = true;
    this.yaw = 0;
    this.pitch = 0;
  }

  private apply(): void {
    const c = this.camera;
    c.position.copy(this.pos);
    c.lookAt(this.look);
    if (this.yaw !== 0) c.rotateY(this.yaw);
    if (this.pitch !== 0) c.rotateX(this.pitch);
    c.updateMatrixWorld();
  }
}

/** Horizontal half-FOV tangent for a perspective camera. */
export function tanHalfHFov(cam: THREE.PerspectiveCamera): number {
  return Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect;
}
