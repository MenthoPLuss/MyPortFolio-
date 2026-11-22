import { clamp, damp } from '../app/state';

/**
 * Virtual scroll with momentum.
 *  - `target` accumulates normalised input.
 *  - `current` eases toward it with frame-rate independent damping:
 *        current += (target - current) * (1 - exp(-k * dt))
 *    which also gives the glide after the wheel stops.
 *  - touch flings add an inertial velocity that decays exponentially.
 */
export class VirtualScroll {
  target = 0;
  current = 0;
  velocity = 0; // units / second, of `current`
  max: number;
  /** Units of scroll per CSS pixel of wheel/touch travel. */
  unitsPerPx = 1 / 1000;
  k = 4.2;
  private inertia = 0; // units / second added to target
  private locked = false;

  constructor(max: number) {
    this.max = max;
  }

  /** Pixel delta from wheel/keys/touch. */
  addPixels(px: number): void {
    if (this.locked) return;
    this.inertia = 0;
    this.target = clamp(this.target + px * this.unitsPerPx, 0, this.max);
  }

  addUnits(u: number): void {
    if (this.locked) return;
    this.inertia = 0;
    this.target = clamp(this.target + u, 0, this.max);
  }

  /** Velocity in px/s at the end of a touch drag. */
  fling(pxPerSec: number): void {
    if (this.locked) return;
    this.inertia = clamp(pxPerSec * this.unitsPerPx, -6, 6);
  }

  /** Hard set (used after nav jumps / history restores). */
  jumpTo(s: number): void {
    this.target = this.current = clamp(s, 0, this.max);
    this.velocity = 0;
    this.inertia = 0;
  }

  /** Drive the scroll programmatically (tweens). */
  setTarget(s: number): void {
    this.target = clamp(s, 0, this.max);
  }

  lock(on: boolean): void {
    this.locked = on;
    if (on) {
      this.inertia = 0;
      this.target = this.current;
      this.velocity = 0;
    }
  }

  update(dt: number): void {
    if (this.locked || dt <= 0) { this.velocity = 0; return; }
    if (this.inertia !== 0) {
      this.target = clamp(this.target + this.inertia * (1 - Math.exp(-3.0 * dt)) / 3.0, 0, this.max);
      this.inertia *= Math.exp(-3.0 * dt);
      if (Math.abs(this.inertia) < 0.002) this.inertia = 0;
    }
    const prev = this.current;
    this.current += (this.target - this.current) * damp(this.k, dt);
    if (Math.abs(this.target - this.current) < 1e-5) this.current = this.target;
    this.velocity = dt > 0 ? (this.current - prev) / dt : 0;
  }
}
