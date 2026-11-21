import * as THREE from 'three';
import type { SceneId } from '../app/state';
import { CameraRig } from '../camera/camera';
import type { Input } from '../input/input';
import type { QualitySettings } from '../quality/quality';
import { disposeTree } from '../shaders/fullscreen';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  quality: QualitySettings;
  input: Input;
  reducedMotion: boolean;
  isTouch: boolean;
  width: number;
  height: number;
  dpr: number;
}

export const BG_COLOR = new THREE.Color('#051126');

/**
 * A scene owns its THREE.Scene, its own camera (so two scenes can render at
 * once during a transition), a camera rig and its resources.
 * The App only calls update()/render() while the scene is visible or transitioning.
 */
export abstract class BaseScene {
  abstract readonly id: SceneId;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  protected ctx: SceneContext;
  /** Local scroll progress 0..1. */
  progress = 0;
  /** Global scroll velocity (units/s) — used for velocity effects. */
  velocity = 0;
  /** Visual weight 0..1 (1 = fully visible). */
  weight = 0;
  active = false;
  protected disposables: { dispose(): void }[] = [];

  constructor(ctx: SceneContext, fov: number) {
    this.ctx = ctx;
    this.camera = new THREE.PerspectiveCamera(fov, ctx.width / ctx.height, 0.05, 400);
    this.rig = new CameraRig(this.camera);
  }

  /** Build geometry/materials/textures. `report` gives fractional progress. */
  abstract build(report: (f: number) => void): Promise<void>;

  abstract update(dt: number, time: number): void;

  setProgress(p: number, velocity: number): void {
    this.progress = p;
    this.velocity = velocity;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.setClearColor(BG_COLOR, 1);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number, dpr: number): void {
    this.ctx.width = w;
    this.ctx.height = h;
    this.ctx.dpr = dpr;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyQuality(q: QualitySettings): void {
    this.ctx.quality = q;
  }

  /** Called when the scene starts / stops being rendered. */
  setActive(on: boolean): void {
    this.active = on;
  }

  /** Raycast hover. Returns true if something interactive is under the pointer. */
  pick(_ndc: THREE.Vector2): boolean {
    return false;
  }

  /** Raycast click. Returns true if handled. */
  click(_ndc: THREE.Vector2): boolean {
    return false;
  }

  /** Warm up shaders (KHR_parallel_shader_compile when available). */
  async compile(renderer: THREE.WebGLRenderer): Promise<void> {
    await renderer.compileAsync(this.scene, this.camera);
  }

  dispose(): void {
    disposeTree(this.scene);
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
