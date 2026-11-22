import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VirtualScroll } from '../src/scroll/scroll.ts';
import { Timeline, SCENE_ORDER } from '../src/app/state.ts';
import { depositStroke } from '../src/scenes/home/stroke.ts';
import { Fluid } from '../src/scenes/home/fluid.ts';
import { Panel3D } from '../src/scenes/shared/panel3d.ts';
import { Router, parse } from '../src/router/router.ts';

test('locked project scroll neither drifts nor resumes old momentum on close', () => {
  const scroll = new VirtualScroll(20);
  scroll.jumpTo(6);
  scroll.addUnits(3);
  scroll.update(0.016);
  const before = scroll.current;
  scroll.lock(true);
  scroll.addPixels(1000);
  scroll.fling(3000);
  for (let i = 0; i < 120; i++) scroll.update(1 / 60);
  assert.equal(scroll.current, before);
  assert.equal(scroll.velocity, 0);
  scroll.lock(false);
  scroll.update(1);
  assert.equal(scroll.current, before);
  scroll.addUnits(-1);
  scroll.update(0.1);
  assert.ok(scroll.current < before);
});
test('wheel damping and touch fling travel are independent of frame rate', () => {
  const results = [30, 60, 144].map(hz => {
    const scroll = new VirtualScroll(20);
    scroll.jumpTo(5);
    scroll.addUnits(1);
    for (let i = 0; i < hz; i++) scroll.update(1 / hz);
    const wheel = scroll.current;
    scroll.jumpTo(5);
    scroll.fling(2000);
    for (let i = 0; i < hz; i++) scroll.update(1 / hz);
    return { wheel, fling: scroll.target, current: scroll.current };
  });
  for (const r of results.slice(1)) {
    assert.ok(Math.abs(results[0].wheel - r.wheel) < 1e-10);
    assert.ok(Math.abs(results[0].fling - r.fling) < 1e-10);
    assert.ok(Math.abs(results[0].current - r.current) < 0.01);
  }
});
test('timeline supports forward and reverse overlap with contiguous local progress', () => {
  const timeline = new Timeline();
  for (let i = 1; i < SCENE_ORDER.length; i++) {
    const b = timeline.boundaries[i];
    const mid = timeline.plan(b);
    assert.equal(mid.a, SCENE_ORDER[i - 1]);
    assert.equal(mid.b, SCENE_ORDER[i]);
    assert.ok(Math.abs(mid.t - 0.5) < 1e-12);
    assert.ok(timeline.plan(b - 0.1).t < mid.t);
    assert.ok(timeline.plan(b + 0.1).t > mid.t);
  }
});
test('pointer energy and total impulse stay stable at 30/60/144 Hz', () => {
  const result = [30, 60, 144].map(hz => {
    let energy = 0, impulse = 0;
    for (let i = 1; i <= hz; i++) {
      depositStroke(i / hz, 0.5, 1 / hz, 0, 1 / hz, 1, (_x, _y, dx, _dy, amount) => { energy += amount; impulse += dx; });
    }
    return { energy, impulse };
  });
  for (const r of result) {
    assert.ok(Math.abs(r.energy - 11.4) < 1e-10);
    assert.ok(Math.abs(r.impulse - 1) < 1e-10);
  }
});
test('fast and reversed strokes have intermediate deposits; idle emits none', () => {
  const path = [];
  depositStroke(0.8, 0.5, 0.4, 0, 1 / 30, 1.7, (x, y, dx, dy, a) => path.push({ x, y, dx, dy, a }));
  assert.equal(path.length, 8);
  assert.ok(path.every((p, i) => i === 0 || p.x > path[i - 1].x));
  assert.equal(path.at(-1).x, 0.8);
  depositStroke(0.4, 0.5, -0.4, 0, 1 / 30, 1.7, (_x, _y, dx) => assert.ok(dx < 0));
  let idle = 0;
  depositStroke(0.5, 0.5, 0, 0, 1 / 60, 1, () => idle++);
  assert.equal(idle, 0);
});

function rendererDouble() {
  return {
    autoClear: true, target: { sentinel: true }, color: new THREE.Color('#051126'), alpha: 1, passes: 0, clears: 0,
    getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; },
    getClearColor(target) { return target.copy(this.color); }, getClearAlpha() { return this.alpha; },
    setClearColor(color, alpha) { this.color.set(color); this.alpha = alpha; },
    clear() { this.clears++; }, render() { this.passes++; },
  };
}
test('fluid dispatch consumes elapsed time at all tiers and restores renderer state (CPU harness)', () => {
  for (const mode of ['full', 'lite', 'trail']) for (const hz of [30, 60, 144]) {
    const renderer = rendererDouble();
    const target = renderer.target;
    const fluid = new Fluid(renderer, { simRes: 64, dyeRes: 128, pressureIterations: mode === 'full' ? 4 : 0, mode });
    assert.ok(renderer.clears >= 2);
    fluid.splat(0.4, 0.5, 0.02, 0, 0.1);
    for (let i = 0; i < hz; i++) fluid.step(1 / hz);
    assert.ok(Math.abs(fluid.time - 1) < 1e-10, `${mode} ${hz} Hz`);
    assert.equal(renderer.target, target);
    assert.equal(renderer.autoClear, true);
    assert.ok(renderer.passes > hz);
    fluid.dispose();
  }
});
test('panel scan settles when parked and after reveal completes (no GPU rendering)', () => {
  const panel = Object.assign(Object.create(Panel3D.prototype), {
    reveal: 0, target: 1, hover: 0, hoverTarget: 0, speedIn: 0.5, speedOut: 0.625, scan: 0,
    mesh: { material: { uniforms: { uReveal: {}, uScan: {}, uTime: {}, uHover: {} } } },
  });
  for (let i = 0; i < 20; i++) panel.update(1 / 60, i / 60);
  assert.ok(panel.mesh.material.uniforms.uScan.value > 0.9);
  panel.target = 0.3;
  for (let i = 0; i < 120; i++) panel.update(1 / 60, i / 60);
  assert.equal(panel.reveal, 0.3);
  assert.ok(panel.mesh.material.uniforms.uScan.value < 0.001);
  panel.target = 1;
  for (let i = 0; i < 240; i++) panel.update(1 / 60, i / 60);
  assert.equal(panel.reveal, 1);
  assert.ok(panel.mesh.material.uniforms.uScan.value < 0.001);
});
test('direct route parsing preserves all four projects and rejects unknown slugs', () => {
  const slugs = ['jecverse', 'plugora', 'm-phish', 'tender-ai'];
  for (const slug of slugs) assert.deepEqual(parse(`/work/${slug}/`, slugs), { scene: 'work', slug });
  for (const scene of ['about', 'work', 'contact']) assert.deepEqual(parse(`/${scene}`, slugs), { scene, slug: null });
  assert.equal(parse('/work/unknown/', slugs), null);
});
test('history stores an entry-specific Work position through project switches', () => {
  const previous = { window: globalThis.window, location: globalThis.location, history: globalThis.history };
  const target = new EventTarget();
  let index = 0;
  const stack = [{ url: 'http://localhost/work/', state: null }];
  globalThis.window = target;
  globalThis.location = new URL(stack[0].url);
  globalThis.history = {
    get state() { return stack[index].state; },
    replaceState(state, _unused, url) { stack[index] = { state, url: new URL(url, location).href }; globalThis.location = new URL(stack[index].url); },
    pushState(state, _unused, url) { stack.splice(++index); stack.push({ state, url: new URL(url, location).href }); globalThis.location = new URL(stack[index].url); },
    back() { index--; globalThis.location = new URL(stack[index].url); target.dispatchEvent(new Event('popstate')); },
  };
  try {
    let popped;
    const router = new Router(['jecverse', 'plugora'], route => { popped = route; });
    router.savePosition(8.3456);
    router.push({ scene: 'work', slug: 'jecverse' });
    router.replace({ scene: 'work', slug: 'plugora' });
    history.back();
    assert.deepEqual(popped, { scene: 'work', slug: null });
    assert.equal(router.position, 8.3456);
    assert.equal(location.pathname, '/work/');
    router.dispose();
  } finally { Object.assign(globalThis, previous); }
});
