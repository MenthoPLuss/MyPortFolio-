import * as THREE from 'three';
import './styles/main.css';
import { App } from './app/App';
import { FONT_FACES, TaskLoader, debugFlags } from './assets/assets';
import { detectTier, settingsFor } from './quality/quality';
import { prefersReducedMotion } from './ui/dom';
import { showFallback } from './ui/fallback';
import { LoaderUI, wait } from './ui/loader';
import { buildShell } from './ui/shell';

// Hex colours in, same hex out: everything is custom shaders authored in display space.
THREE.ColorManagement.enabled = false;

const LOAD_TIMEOUT_MS = 30_000;
let app: App | null = null;
let disposeInspection: (() => void) | null = null;

async function boot(): Promise<void> {
  const mount = document.getElementById('app')!;

  if (debugFlags.has('no-webgl')) {
    showFallback(mount, 'Static version (WebGL disabled with ?debug=no-webgl).', true);
    return;
  }

  const shell = buildShell(mount);
  const loaderUI = new LoaderUI(mount);
  let fatal = false;
  const fail = (reason: string) => {
    if (fatal) return;
    fatal = true;
    disposeInspection?.();
    disposeInspection = null;
    console.warn('[boot] falling back to static HTML:', reason);
    loaderUI.destroy();
    try {
      app?.dispose();
    } catch {
      /* ignore */
    }
    app = null;
    showFallback(mount, reason, true);
  };

  // ---- renderer (WebGL2) ----
  let renderer: THREE.WebGLRenderer;
  let shaderError = false;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: shell.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    console.warn('[boot] WebGL2 unavailable', e);
    fail('Your browser or device could not start WebGL 2, so this is the static version of the site.');
    return;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = false;
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    shaderError = true;
    const log = (s: WebGLShader) => gl.getShaderInfoLog(s) || '';
    console.warn('[boot] shader compile failed', gl.getProgramInfoLog(program), log(vs), log(fs));
  };

  const { tier, gpu } = detectTier(renderer.getContext() as WebGL2RenderingContext);
  const quality = settingsFor(tier);
  document.documentElement.dataset.tier = tier;
  console.info(`[quality] tier "${tier}" (${gpu || 'unknown GPU'})`);

  const reduced = prefersReducedMotion();
  document.documentElement.classList.toggle('reduced-motion', reduced);
  if (matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('touch');
  app = new App(shell, renderer, quality, reduced);
  app.onFatal = (reason) => fail(reason);
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app; // test hook (dev only)

  // ---- real loading tasks ----
  const loader = new TaskLoader();
  loader.onProgress = (p) => loaderUI.set(p);
  const slow = debugFlags.has('slow');
  let failOnce = debugFlags.has('fail-asset');

  loader.add({
    label: 'fonts',
    weight: 1,
    fatal: false,
    run: async (report) => {
      let done = 0;
      await Promise.all(
        FONT_FACES.map((f) =>
          document.fonts.load(f).then(() => report(++done / FONT_FACES.length)),
        ),
      );
      if (slow) await wait(600);
    },
  });

  if (failOnce) {
    loader.add({
      label: 'debug failing asset',
      weight: 0.5,
      fatal: true,
      run: async () => {
        if (failOnce) {
          failOnce = false;
          await wait(400);
          throw new Error('Simulated asset failure (?debug=fail-asset)');
        }
      },
    });
  }

  const weights: Record<string, number> = { home: 1.5, about: 3, work: 2, contact: 1 };
  for (const scene of app.sceneList()) {
    loader.add({
      label: `build ${scene.id}`,
      weight: weights[scene.id],
      fatal: true,
      run: async (report) => {
        await scene.build(report);
        if (slow) await wait(600);
      },
    });
  }
  for (const scene of app.sceneList()) {
    loader.add({
      label: `compile ${scene.id}`,
      weight: 0.75,
      fatal: true,
      run: async () => {
        await app!.warm(scene);
        if (shaderError) throw new Error('shader compilation failed');
      },
    });
  }

  const timeout = window.setTimeout(
    () => fail('Loading took too long, so here is the static version of the site.'),
    LOAD_TIMEOUT_MS,
  );

  const attempt = async (): Promise<void> => {
    try {
      await loader.run();
    } catch (err) {
      console.warn('[boot] load error', err);
      if (shaderError) {
        window.clearTimeout(timeout);
        fail('A graphics shader failed to compile on this device, so this is the static version of the site.');
        return;
      }
      loaderUI.error('Something failed to load.', true);
      loaderUI.onRetry = () => {
        loaderUI.clearError();
        void attempt();
      };
      return;
    }
    window.clearTimeout(timeout);
    if (fatal || !app) return;
    app.start();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
      const { attachInspection } = await import('./dev/inspection');
      disposeInspection = attachInspection(app);
    }
    await loaderUI.finish();
  };
  await attempt();
}

void boot().catch((e) => {
  console.warn('[boot] unexpected error', e);
  const mount = document.getElementById('app');
  if (mount) showFallback(mount, 'Something went wrong starting the 3D version, so here is the static version.', true);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeInspection?.();
    app?.dispose();
    app = null;
  });
}
