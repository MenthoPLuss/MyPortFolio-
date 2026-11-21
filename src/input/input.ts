/**
 * Input normalisation: wheel (mouse + trackpad, all deltaModes), touch drag with
 * release velocity, keyboard scrolling, and pointer position/velocity.
 *
 * Nothing here calls preventDefault on touch: the canvas uses `touch-action:none`
 * so the browser doesn't pan/zoom it, while buttons, links and the project
 * detail dialog (which scrolls natively) keep their normal behaviour.
 */

export interface PointerState {
  /** NDC -1..1 (y up). */
  x: number;
  y: number;
  /** UV 0..1 (v up). */
  u: number;
  v: number;
  /** UV delta accumulated since last frame. */
  du: number;
  dv: number;
  /** Has the pointer ever moved over the page. */
  active: boolean;
  /** Seconds since last move. */
  idle: number;
  type: string;
  down: boolean;
}

export interface InputCallbacks {
  wheel(px: number): void;
  touchMove(px: number): void;
  touchFling(pxPerSec: number): void;
  key(units: number): void;
  click(e: PointerEvent): void;
}

const NATIVE_SCROLL = '[data-native-scroll]';
const LINE_PX = 16;
const MAX_WHEEL = 260;

export class Input {
  readonly pointer: PointerState = {
    x: 0,
    y: 0,
    u: 0.5,
    v: 0.5,
    du: 0,
    dv: 0,
    active: false,
    idle: 999,
    type: 'mouse',
    down: false,
  };
  readonly isTouch: boolean;
  enabled = true;
  private cb: InputCallbacks;
  private touchY = 0;
  private touchSamples: { y: number; t: number }[] = [];
  private touching = false;
  private downAt = { x: 0, y: 0, t: 0 };
  private disposers: (() => void)[] = [];

  constructor(cb: InputCallbacks) {
    this.cb = cb;
    this.isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.listen(window, 'wheel', this.onWheel as EventListener, { passive: true });
    this.listen(window, 'touchstart', this.onTouchStart as EventListener, { passive: true });
    this.listen(window, 'touchmove', this.onTouchMove as EventListener, { passive: true });
    this.listen(window, 'touchend', this.onTouchEnd as EventListener, { passive: true });
    this.listen(window, 'touchcancel', this.onTouchEnd as EventListener, { passive: true });
    this.listen(window, 'pointermove', this.onPointerMove as EventListener, { passive: true });
    this.listen(window, 'pointerdown', this.onPointerDown as EventListener, { passive: true });
    this.listen(window, 'pointerup', this.onPointerUp as EventListener, { passive: true });
    this.listen(window, 'keydown', this.onKey as EventListener);
  }

  private listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) {
    t.addEventListener(type, fn, opts);
    this.disposers.push(() => t.removeEventListener(type, fn, opts));
  }

  /** Call once per frame after consumers have read the deltas. */
  endFrame(dt: number): void {
    this.pointer.du = 0;
    this.pointer.dv = 0;
    this.pointer.idle += dt;
  }

  private inNative(e: Event): boolean {
    const t = e.target as Element | null;
    return !!(t && t.closest && t.closest(NATIVE_SCROLL));
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled || e.ctrlKey || this.inNative(e)) return;
    let dy = e.deltaY;
    // trackpads sometimes scroll mostly horizontally — accept dominant axis
    if (Math.abs(e.deltaX) > Math.abs(dy) * 1.5) dy = e.deltaX;
    if (e.deltaMode === 1) dy *= LINE_PX;
    else if (e.deltaMode === 2) dy *= window.innerHeight;
    dy = Math.max(-MAX_WHEEL, Math.min(MAX_WHEEL, dy));
    this.cb.wheel(dy);
  };

  private onTouchStart = (e: TouchEvent) => {
    if (!this.enabled || e.touches.length !== 1 || this.inNative(e)) {
      this.touching = false;
      return;
    }
    this.touching = true;
    this.touchY = e.touches[0].clientY;
    this.touchSamples = [{ y: this.touchY, t: performance.now() }];
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.touching || !this.enabled) return;
    const y = e.touches[0].clientY;
    const dy = this.touchY - y;
    this.touchY = y;
    const now = performance.now();
    this.touchSamples.push({ y, t: now });
    while (this.touchSamples.length > 2 && now - this.touchSamples[0].t > 100) this.touchSamples.shift();
    this.cb.touchMove(dy * 1.6);
  };

  private onTouchEnd = () => {
    if (!this.touching) return;
    this.touching = false;
    const s = this.touchSamples;
    if (s.length >= 2) {
      const a = s[0];
      const b = s[s.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0 && performance.now() - b.t < 80) {
        this.cb.touchFling(((a.y - b.y) / dt) * 1.6);
      }
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const u = e.clientX / w;
    const v = 1 - e.clientY / h;
    const p = this.pointer;
    if (p.active) {
      p.du += u - p.u;
      p.dv += v - p.v;
    }
    p.u = u;
    p.v = v;
    p.x = u * 2 - 1;
    p.y = v * 2 - 1;
    p.active = true;
    p.idle = 0;
    p.type = e.pointerType;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.pointer.down = true;
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.onPointerMove(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointer.down = false;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    const target = e.target as Element | null;
    // canvas clicks only (DOM controls handle their own clicks)
    if (moved < 8 && performance.now() - this.downAt.t < 600 && target instanceof HTMLCanvasElement) {
      this.cb.click(e);
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
    if (t?.closest?.('[role="dialog"]')) return;
    const onControl = tag === 'BUTTON' || tag === 'A';
    let units = 0;
    switch (e.key) {
      case 'ArrowDown':
        units = 0.18;
        break;
      case 'ArrowUp':
        units = -0.18;
        break;
      case 'PageDown':
        units = 0.7;
        break;
      case 'PageUp':
        units = -0.7;
        break;
      case ' ':
      case 'Spacebar':
        if (onControl) return; // space activates the focused control
        units = e.shiftKey ? -0.7 : 0.7;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.cb.key(units);
  };

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }
}
