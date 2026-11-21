import files from 'virtual:asset-manifest';

/**
 * Asset manifest + loader with REAL progress.
 *
 * `files` is generated at dev/build time from public/assets/ (see vite.config.ts),
 * so the app knows exactly which optional assets exist without probing URLs.
 */

const BASE = import.meta.env.BASE_URL;

export const assetUrl = (rel: string): string => BASE + rel.replace(/^\//, '');

const set = new Set(files);

export const manifest = {
  files,
  has(rel: string): boolean {
    return set.has(rel);
  },
  /** First existing file among candidates (relative to public/). */
  first(candidates: string[]): string | null {
    for (const c of candidates) if (set.has(c)) return c;
    return null;
  },
  /** Image files inside public/assets/projects/<slug>/ (sorted). */
  projectImages(slug: string): string[] {
    const prefix = `assets/projects/${slug}/`;
    return files.filter((f) => f.startsWith(prefix) && /\.(jpe?g|png|webp|avif)$/i.test(f));
  },
  projectVideo(slug: string, name: string | null): string | null {
    const prefix = `assets/projects/${slug}/`;
    if (name && set.has(prefix + name)) return prefix + name;
    return files.find((f) => f.startsWith(prefix) && /\.(mp4|webm)$/i.test(f)) ?? null;
  },
};

/* ------------------------------------------------------------------ */

export interface Task {
  label: string;
  weight: number;
  /** Fatal tasks abort the boot (loader shows Retry); non-fatal ones just warn. */
  fatal: boolean;
  run: (report: (fraction: number) => void) => Promise<void>;
}

export class TaskLoader {
  private tasks: Task[] = [];
  private progress = new Map<Task, number>();
  onProgress: (p: number, label: string) => void = () => {};

  add(task: Task): void {
    this.tasks.push(task);
    this.progress.set(task, 0);
  }

  get value(): number {
    let done = 0;
    let total = 0;
    for (const t of this.tasks) {
      total += t.weight;
      done += t.weight * (this.progress.get(t) ?? 0);
    }
    return total > 0 ? done / total : 1;
  }

  /** Runs tasks in sequence (keeps GPU uploads/compiles from fighting). */
  async run(): Promise<void> {
    for (const task of this.tasks) {
      if ((this.progress.get(task) ?? 0) >= 1) continue; // already done (retry)
      const report = (f: number) => {
        this.progress.set(task, Math.min(1, Math.max(this.progress.get(task) ?? 0, f)));
        this.onProgress(this.value, task.label);
      };
      report(0);
      try {
        await task.run(report);
      } catch (err) {
        if (task.fatal) {
          throw Object.assign(new Error(`Failed: ${task.label}`), { cause: err });
        }
        console.warn(`[loader] non-fatal task failed: ${task.label}`, err);
      }
      report(1);
    }
  }
}

/** Fonts used by canvas text (must be ready before drawing to canvases). */
export const FONT_FACES = [
  '700 64px Excon',
  '500 64px Excon',
  '400 64px Excon',
  '600 64px Antonio',
];

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed: ' + url));
    img.src = url;
  });
}

/** Debug switches for testing failure paths: ?debug=no-webgl | fail-asset | slow */
export const debugFlags = new Set(
  (new URLSearchParams(location.search).get('debug') ?? '').split(',').filter(Boolean),
);
