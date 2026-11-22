import type { App } from '../app/App';
import { SCENE_ORDER, type SceneId } from '../app/state';

/** Explicitly opt in with ?inspect=1. No second animation loop or production controls. */
export function attachInspection(app: App): () => void {
  const params = new URLSearchParams(location.search);
  const panel = document.createElement('aside');
  panel.dataset.nativeScroll = '';
  panel.setAttribute('aria-label', 'Development scene inspection');
  panel.style.cssText = 'position:fixed;z-index:100;right:12px;bottom:12px;width:min(330px,calc(100vw - 24px));padding:14px;background:#051126f2;border:1px solid #6bb0f9;color:#b5cfff;font:13px/1.5 system-ui;pointer-events:auto';
  panel.innerHTML = `<strong>Scene inspection · development only</strong>
    <label style="display:block">Scene <select aria-label="Inspection scene">${SCENE_ORDER.map(id => `<option value="${id}">${id}</option>`).join('')}</select></label>
    <label style="display:block">Progress <input aria-label="Inspection progress" type="range" min="0" max="1" step="0.001" value="0" style="width:70%"></label>
    <label style="display:block"><input type="checkbox" aria-label="Freeze shader time"> Freeze shader time at <input aria-label="Shader time" type="number" min="0" value="6" step="0.1" style="width:54px"> seconds</label>
    <button type="button">Capture canvas PNG</button> <button type="button">Hide controls</button>
    <output style="display:block;white-space:pre-line" aria-live="off"></output>`;
  const [scene] = Array.from(panel.querySelectorAll('select'));
  const [progress, freeze, time] = Array.from(panel.querySelectorAll('input'));
  const [capture, hide] = Array.from(panel.querySelectorAll('button'));
  const output = panel.querySelector('output')!;
  let frames: number[] = [];
  let elapsed = 0;
  const inspection: NonNullable<App['inspection']> = {
    time: null,
    frame(dt) {
      if (dt > 0) frames.push(dt * 1000);
      elapsed += dt;
      if (elapsed < 1) return;
      frames.sort((a, b) => a - b);
      const median = frames[Math.floor(frames.length / 2)] ?? 0;
      const p95 = frames[Math.floor(frames.length * 0.95)] ?? 0;
      const id = app.timeline.dominant(app.scroll.current);
      output.textContent = `${innerWidth} × ${innerHeight} · ${app.tier} · ${app.about.portraitMode}\n${id} ${app.timeline.local(id, app.scroll.current).toFixed(3)} · ${median.toFixed(1)} ms median / ${p95.toFixed(1)} ms p95\nFrame intervals include browser scheduling; GPU time is not measured.`;
      elapsed = 0;
      frames = [];
    },
  };
  app.inspection = inspection;
  const seek = () => {
    const id = scene.value as SceneId;
    app.scroll.jumpTo(app.timeline.toGlobal(id, Number(progress.value)));
    app.scenes[id].rig.reset();
    for (const item of app.sceneList()) item.velocity = 0;
  };
  scene.addEventListener('change', seek);
  progress.addEventListener('input', seek);
  const freezeTime = () => { inspection.time = freeze.checked ? Math.max(0, Number(time.value)) : null; };
  freeze.addEventListener('change', freezeTime);
  time.addEventListener('input', freezeTime);
  capture.addEventListener('click', () => {
    inspection.capture = () => app.shell.canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const id = app.timeline.dominant(app.scroll.current);
      link.download = `${id}-${app.timeline.local(id, app.scroll.current).toFixed(3)}-${innerWidth}x${innerHeight}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
  hide.addEventListener('click', () => { panel.hidden = true; });
  const requested = params.get('scene');
  const validScene = requested && SCENE_ORDER.includes(requested as SceneId);
  scene.value = validScene ? requested : app.timeline.dominant(app.scroll.current);
  const initialProgress = Number(params.get('progress') ?? app.timeline.local(scene.value as SceneId, app.scroll.current));
  progress.value = String(Number.isFinite(initialProgress) ? Math.max(0, Math.min(1, initialProgress)) : 0);
  const fixed = params.get('time');
  if (fixed !== null && Number.isFinite(Number(fixed))) {
    freeze.checked = true;
    time.value = fixed;
    freezeTime();
  }
  document.body.append(panel);
  if (validScene) seek();
  return () => { panel.remove(); app.inspection = null; };
}
