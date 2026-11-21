/**
 * Quality tiers. Initial tier from device signals (GPU string, memory, cores,
 * coarse pointer, screen size), then refined by measuring frame time for ~2s
 * after the first scene is visible — stepping down (never up) automatically.
 */

export type Tier = 'high' | 'mid' | 'low';

export interface QualitySettings {
  tier: Tier;
  maxDpr: number;
  msaa: number;
  /** Home */
  homeParticles: [number, number, number]; // fg, mid, bg
  wordmarkSteps: number;
  godRays: boolean;
  fluidSim: number;
  fluidDye: number;
  pressureIterations: number; // 0 = no pressure solve
  /** About */
  portraitPoints: number;
  discPoints: number;
  frost: boolean;
  /** Work */
  ghostCovers: number;
  /** Contact */
  fibres: number;
  fibrePoints: number;
  /** Global */
  dust: number;
  textScale: number;
}

const TIERS: Record<Tier, Omit<QualitySettings, 'tier' | 'maxDpr'>> = {
  high: {
    msaa: 4,
    homeParticles: [260, 1400, 4200],
    wordmarkSteps: 22,
    godRays: true,
    fluidSim: 128,
    fluidDye: 512,
    pressureIterations: 20,
    portraitPoints: 150_000,
    discPoints: 60_000,
    frost: true,
    ghostCovers: 10,
    fibres: 2200,
    fibrePoints: 96,
    dust: 2600,
    textScale: 1.5,
  },
  mid: {
    msaa: 2,
    homeParticles: [160, 900, 2600],
    wordmarkSteps: 14,
    godRays: true,
    fluidSim: 96,
    fluidDye: 384,
    pressureIterations: 10,
    portraitPoints: 60_000,
    discPoints: 30_000,
    frost: false,
    ghostCovers: 7,
    fibres: 1300,
    fibrePoints: 72,
    dust: 1600,
    textScale: 1.25,
  },
  low: {
    msaa: 0,
    homeParticles: [80, 420, 1200],
    wordmarkSteps: 8,
    godRays: false,
    fluidSim: 64,
    fluidDye: 256,
    pressureIterations: 0,
    portraitPoints: 20_000,
    discPoints: 12_000,
    frost: false,
    ghostCovers: 4,
    fibres: 600,
    fibrePoints: 52,
    dust: 800,
    textScale: 1,
  },
};

export const isMobileDevice = (): boolean =>
  matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

export function settingsFor(tier: Tier): QualitySettings {
  const mobile = isMobileDevice();
  const maxDpr = tier === 'low' ? 1 : mobile ? 1.5 : tier === 'mid' ? 1.5 : 2;
  return { tier, maxDpr, ...TIERS[tier] };
}

export function detectTier(gl: WebGL2RenderingContext | null): { tier: Tier; gpu: string } {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === 'high' || forced === 'mid' || forced === 'low') return { tier: forced, gpu: 'forced' };

  let gpu = '';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mobile = isMobileDevice();
  const bigScreen = screen.width * screen.height * Math.min(devicePixelRatio, 2) ** 2 > 3840 * 2160;

  let tier: Tier = 'high';
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) tier = 'low';
  else if (mobile) tier = mem <= 3 || cores <= 4 ? 'low' : 'mid';
  else if (mem <= 2 || cores <= 2) tier = 'low';
  else if (mem <= 4 || cores <= 4 || /intel|mali|adreno|powervr|apple gpu/i.test(gpu)) tier = 'mid';
  if (tier === 'high' && bigScreen) tier = 'mid';
  return { tier, gpu };
}

/** Frame-time sampler that requests a step-down when the average is too slow. */
export class FrameMonitor {
  private samples: number[] = [];
  private elapsed = 0;
  private armed = false;
  private steps = 0;
  private settle = 0;
  onStepDown: (() => void) | null = null;

  /** Start (or restart) measuring for `window` seconds. */
  arm(): void {
    this.armed = true;
    this.samples = [];
    this.elapsed = 0;
    this.settle = 0.4; // ignore the first frames (shader warm-up, resize)
  }

  sample(dt: number): void {
    if (!this.armed) return;
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.samples.push(dt);
    this.elapsed += dt;
    if (this.elapsed < 2) return;
    this.armed = false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)];
    // < ~40fps median → step down; re-measure after (max two steps)
    if (median > 1 / 40 && this.steps < 2) {
      this.steps++;
      this.onStepDown?.();
      this.arm();
    }
  }
}

export function lowerTier(t: Tier): Tier {
  return t === 'high' ? 'mid' : 'low';
}
