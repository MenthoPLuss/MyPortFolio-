/**
 * Global app state: scene order, the single scroll timeline and a tiny event bus.
 *
 * The whole site is ONE continuous scroll value `s` (in "units", ~1000px of wheel
 * travel each). Every scene owns a range of it; adjacent ranges overlap by
 * OVERLAP units — inside an overlap both scenes render and the transition
 * shader blends them, driven directly by scroll (so velocity carries through).
 */

export type SceneId = 'home' | 'about' | 'work' | 'contact';

export const SCENE_ORDER: SceneId[] = ['home', 'about', 'work', 'contact'];

/** Scroll length of each scene, in units. */
export const SCENE_LENGTH: Record<SceneId, number> = {
  home: 1.5,
  about: 4.8,
  work: 5.6,
  contact: 1.8,
};

export const OVERLAP = 0.55;

export const SCENE_PATH: Record<SceneId, string> = {
  home: '/',
  about: '/about/',
  work: '/work/',
  contact: '/contact/',
};

export const SCENE_LABEL: Record<SceneId, string> = {
  home: 'Home',
  about: 'About',
  work: 'Work',
  contact: 'Contact',
};

export interface FramePlan {
  /** Scene that is (or is becoming) the outgoing one. */
  a: SceneId;
  /** Incoming scene while inside an overlap, otherwise null. */
  b: SceneId | null;
  /** Transition progress 0..1 between a and b (0 when b is null). */
  t: number;
}

export class Timeline {
  /** boundaries[i] = start of scene i (boundary with the previous one); last = total. */
  readonly boundaries: number[] = [];
  readonly total: number;

  constructor() {
    let acc = 0;
    for (const id of SCENE_ORDER) {
      this.boundaries.push(acc);
      acc += SCENE_LENGTH[id];
    }
    this.boundaries.push(acc);
    this.total = acc;
  }

  index(id: SceneId): number {
    return SCENE_ORDER.indexOf(id);
  }

  /** Global range [start, end] in which the scene is rendered (incl. overlaps). */
  range(id: SceneId): [number, number] {
    const i = this.index(id);
    const start = i === 0 ? 0 : this.boundaries[i] - OVERLAP / 2;
    const end = i === SCENE_ORDER.length - 1 ? this.total : this.boundaries[i + 1] + OVERLAP / 2;
    return [start, end];
  }

  /** Local progress 0..1 of a scene for global scroll s (unclamped outside is clamped). */
  local(id: SceneId, s: number): number {
    const [a, b] = this.range(id);
    return Math.min(1, Math.max(0, (s - a) / (b - a)));
  }

  toGlobal(id: SceneId, p: number): number {
    const [a, b] = this.range(id);
    return a + (b - a) * p;
  }

  /** Which scene dominates at s (switches at the middle of each overlap). */
  dominant(s: number): SceneId {
    for (let i = SCENE_ORDER.length - 1; i >= 0; i--) {
      if (s >= this.boundaries[i]) return SCENE_ORDER[i];
    }
    return SCENE_ORDER[0];
  }

  plan(s: number): FramePlan {
    for (let i = 1; i < SCENE_ORDER.length; i++) {
      const b = this.boundaries[i];
      if (s > b - OVERLAP / 2 && s < b + OVERLAP / 2) {
        return {
          a: SCENE_ORDER[i - 1],
          b: SCENE_ORDER[i],
          t: (s - (b - OVERLAP / 2)) / OVERLAP,
        };
      }
    }
    return { a: this.dominant(s), b: null, t: 0 };
  }

  /** Where a nav click lands inside a scene (fully transitioned in). */
  rest(id: SceneId): number {
    const i = this.index(id);
    if (i === 0) return 0;
    if (id === 'contact') return this.total;
    return this.boundaries[i] + OVERLAP / 2 + 0.03;
  }
}

/* ------------------------------------------------------------------ */

type Handler<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.map.get(type)?.forEach((fn) => (fn as Handler<Events[K]>)(payload));
  }
}

/* ------------------------------------------------------------------ */

const SCROLL_KEY = 'ab-portfolio:scroll:';

export const scrollMemory = {
  save(id: SceneId, s: number): void {
    try {
      sessionStorage.setItem(SCROLL_KEY + id, s.toFixed(4));
    } catch {
      /* storage unavailable (private mode) — ignore */
    }
  },
  load(id: SceneId): number | null {
    try {
      const v = sessionStorage.getItem(SCROLL_KEY + id);
      if (v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  },
};

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** Frame-rate independent damping factor. */
export const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
