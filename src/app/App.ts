import * as THREE from 'three';
import { site } from '../content/site.config';
import { Input } from '../input/input';
import { Router, type Route } from '../router/router';
import { VirtualScroll } from '../scroll/scroll';
import { FrameMonitor, lowerTier, settingsFor, type QualitySettings } from '../quality/quality';
import { Compositor } from '../transitions/compositor';
import type { BaseScene, SceneContext } from '../scenes/BaseScene';
import { HomeScene } from '../scenes/home/HomeScene';
import { AboutScene } from '../scenes/about/AboutScene';
import { WorkScene } from '../scenes/work/WorkScene';
import { ContactScene } from '../scenes/contact/ContactScene';
import { ProjectDetail } from '../ui/detail';
import type { Shell } from '../ui/shell';
import {
  SCENE_LABEL,
  SCENE_ORDER,
  Timeline,
  clamp,
  easeInOut,
  scrollMemory,
  smoothstep,
  type FramePlan,
  type SceneId,
} from './state';

interface Jump {
  from: SceneId;
  to: SceneId;
  fromP: number;
  toP: number;
  t: number;
  dur: number;
  targetS: number;
}

/**
 * Orchestrator: ONE requestAnimationFrame loop drives input → scroll → scenes →
 * transition compositor → HTML layer. Only scenes that are visible or
 * transitioning are updated and rendered.
 */
export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly shell: Shell;
  readonly timeline = new Timeline();
  readonly scroll: VirtualScroll;
  readonly input: Input;
  readonly detail: ProjectDetail;
  readonly scenes: Record<SceneId, BaseScene>;
  readonly home: HomeScene;
  readonly about: AboutScene;
  readonly work: WorkScene;
  readonly contact: ContactScene;
  private router!: Router;
  private compositor = new Compositor();
  private rtA!: THREE.WebGLRenderTarget;
  private rtB!: THREE.WebGLRenderTarget;
  private ctx: SceneContext;
  private quality: QualitySettings;
  private monitor = new FrameMonitor();
  private reduced: boolean;
  private dominant: SceneId = 'home';
  private jump: Jump | null = null;
  private activeSet = new Set<SceneId>();
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private lastSave = 0;
  private ndc = new THREE.Vector2();
  private hoverable = false;
  private detailPushed = false;
  // undefined → first frame always writes the DOM state
  private inert: Partial<Record<SceneId, boolean>> = {};
  private contactShown = false;
  private disposers: (() => void)[] = [];
  onFatal: (reason: string) => void = () => {};

  constructor(shell: Shell, renderer: THREE.WebGLRenderer, quality: QualitySettings, reduced: boolean) {
    this.shell = shell;
    this.renderer = renderer;
    this.quality = quality;
    this.reduced = reduced;
    this.scroll = new VirtualScroll(this.timeline.total);
    this.input = new Input({
      wheel: (px) => this.userScroll(() => this.scroll.addPixels(px)),
      touchMove: (px) => this.userScroll(() => this.scroll.addPixels(px)),
      touchFling: (v) => this.userScroll(() => this.scroll.fling(v)),
      key: (u) => this.userScroll(() => this.scroll.addUnits(u)),
      click: () => this.onCanvasClick(),
    });

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
    this.ctx = {
      renderer,
      quality,
      input: this.input,
      reducedMotion: reduced,
      isTouch: this.input.isTouch,
      width: w,
      height: h,
      dpr,
    };
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    this.createTargets();

    this.home = new HomeScene(this.ctx);
    this.about = new AboutScene(this.ctx);
    this.work = new WorkScene(this.ctx);
    this.contact = new ContactScene(this.ctx);
    this.scenes = { home: this.home, about: this.about, work: this.work, contact: this.contact };

    this.detail = new ProjectDetail(shell.ui);
    this.detail.onClose = () => this.closeDetail();
    this.detail.onSwitch = (i) => this.router.replace({ scene: 'work', slug: site.projects[i].slug });
    this.work.onOpen = (i) => this.openProject(i, null);

    this.monitor.onStepDown = () => this.stepDown();
    this.wireDom();
  }

  /* ------------------------------------------------------------ */
  /* setup                                                         */
  /* ------------------------------------------------------------ */

  private createTargets(): void {
    this.rtA?.dispose();
    this.rtB?.dispose();
    const float =
      this.renderer.extensions.has('EXT_color_buffer_float') ||
      this.renderer.extensions.has('EXT_color_buffer_half_float');
    const w = Math.round(this.ctx.width * this.ctx.dpr);
    const h = Math.round(this.ctx.height * this.ctx.dpr);
    const opts: THREE.RenderTargetOptions = {
      type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: this.quality.msaa,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtB = new THREE.WebGLRenderTarget(w, h, opts);
  }

  private wireDom(): void {
    const s = this.shell;
    for (const id of SCENE_ORDER) {
      s.navLinks[id].addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        this.navigate(id);
      });
    }
    s.journey.addEventListener('click', () => this.navigate('about'));
    s.workButtons.forEach((b, i) => {
      b.addEventListener('click', () => this.openProject(i, b));
      // keyboard users: bring the focused project into view behind its button
      b.addEventListener('focus', () => {
        if (this.dominant === 'work' && !this.detail.isOpen && !this.jump) this.scroll.setTarget(this.projectScroll(i));
      });
    });

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));

    const onVis = () => {
      if (document.hidden) this.pause();
      else this.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));

    const onLost = (e: Event) => {
      e.preventDefault();
      this.pause();
      this.onFatal('The graphics context was lost, so here is the static version of the site.');
    };
    s.canvas.addEventListener('webglcontextlost', onLost);
    this.disposers.push(() => s.canvas.removeEventListener('webglcontextlost', onLost));

    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => {
      this.reduced = mq.matches;
      this.ctx.reducedMotion = mq.matches; // shared by every scene
      document.documentElement.classList.toggle('reduced-motion', mq.matches);
    };
    mq.addEventListener('change', onMq);
    this.disposers.push(() => mq.removeEventListener('change', onMq));
  }

  /** Build all scenes (loader tasks call these). */
  sceneList(): BaseScene[] {
    return SCENE_ORDER.map((id) => this.scenes[id]);
  }

  /** Warm-up: compile programs + one render into an offscreen target (uploads textures, surfaces shader errors). */
  async warm(scene: BaseScene): Promise<void> {
    await scene.compile(this.renderer);
    scene.setProgress(scene.id === 'contact' ? 1 : 0.5, 0);
    scene.update(0.016, 0);
    scene.render(this.renderer, this.rtA);
    scene.rig.reset();
  }

  /* ------------------------------------------------------------ */
  /* start / loop                                                  */
  /* ------------------------------------------------------------ */

  start(): void {
    this.router = new Router(site.projects.map((p) => p.slug), (r) => this.onRoute(r));
    const r = this.router.current;
    let s: number;
    if (r.slug) {
      s = this.projectScroll(site.projects.findIndex((p) => p.slug === r.slug));
    } else {
      const saved = scrollMemory.load(r.scene);
      s = saved !== null && this.timeline.dominant(saved) === r.scene ? saved : this.timeline.rest(r.scene);
    }
    this.scroll.jumpTo(s);
    this.dominant = this.timeline.dominant(s);
    this.setNav(this.dominant);
    this.home.startIntro(this.dominant !== 'home');
    if (r.slug) {
      const i = site.projects.findIndex((p) => p.slug === r.slug);
      this.detailPushed = false;
      this.openDetailOnly(i, null);
    }
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.monitor.arm();
  }

  private pause(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resume(): void {
    if (!this.running || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;

    // ---- plan this frame ----
    let plan: FramePlan;
    const pA = new Map<SceneId, number>();
    const tl = this.timeline;
    if (this.jump) {
      const j = this.jump;
      j.t = Math.min(1, j.t + dt / j.dur);
      const e = easeInOut(j.t);
      plan = { a: j.from, b: j.to, t: e };
      // cameras keep moving in sync during the blend
      pA.set(j.from, clamp(j.fromP + 0.05 * e));
      pA.set(j.to, clamp(j.toP - 0.06 * (1 - e)));
      if (j.t >= 1) {
        this.scroll.jumpTo(j.targetS);
        this.jump = null;
        this.scroll.lock(this.detail.isOpen);
      }
    } else {
      this.scroll.update(dt);
      plan = tl.plan(this.scroll.current);
      pA.set(plan.a, tl.local(plan.a, this.scroll.current));
      if (plan.b) pA.set(plan.b, tl.local(plan.b, this.scroll.current));
    }

    // ---- activate / deactivate scenes ----
    const want = new Set<SceneId>([plan.a, ...(plan.b ? [plan.b] : [])]);
    for (const id of SCENE_ORDER) {
      const on = want.has(id);
      if (on && !this.activeSet.has(id)) {
        this.scenes[id].rig.reset();
        this.scenes[id].setActive(true);
        this.activeSet.add(id);
      } else if (!on && this.activeSet.has(id)) {
        this.scenes[id].setActive(false);
        this.activeSet.delete(id);
      }
    }

    // ---- update + render visible scenes ----
    const vel = this.jump ? 0 : this.scroll.velocity;
    const sa = this.scenes[plan.a];
    sa.weight = plan.b ? 1 - plan.t : 1;
    sa.setProgress(pA.get(plan.a) ?? 0, vel);
    sa.update(dt, this.time);
    sa.render(this.renderer, this.rtA);
    let texB: THREE.Texture | null = null;
    if (plan.b) {
      const sb = this.scenes[plan.b];
      sb.weight = plan.t;
      sb.setProgress(pA.get(plan.b) ?? 0, vel);
      sb.update(dt, this.time);
      sb.render(this.renderer, this.rtB);
      texB = this.rtB.texture;
    }
    this.compositor.render(
      this.renderer,
      this.rtA.texture,
      texB,
      plan.t,
      this.time,
      this.ctx.width / this.ctx.height,
      this.reduced ? 0 : 1,
    );

    // ---- dominant scene → URL, nav, announcements ----
    const dom = this.jump ? (plan.t < 0.5 ? this.jump.from : this.jump.to) : tl.dominant(this.scroll.current);
    if (dom !== this.dominant) this.onDominant(dom);
    if (!this.jump && now - this.lastSave > 300) {
      this.lastSave = now;
      scrollMemory.save(this.dominant, this.scroll.current);
    }

    this.updateHtml(plan);
    this.updateHover();
    this.input.endFrame(dt);
    this.monitor.sample(dt);
  };

  /* ------------------------------------------------------------ */
  /* navigation                                                    */
  /* ------------------------------------------------------------ */

  private userScroll(fn: () => void): void {
    if (this.jump || this.detail.isOpen) return;
    fn();
  }

  /** Nav click / Start the Journey: animated transition + pushState. */
  navigate(id: SceneId): void {
    if (this.detail.isOpen) this.closeDetail(false);
    this.router.push({ scene: id, slug: null });
    this.goTo(id, this.timeline.rest(id));
  }

  private goTo(id: SceneId, targetS: number): void {
    if (this.jump) {
      // retarget an in-flight jump
      this.jump.to = id;
      this.jump.toP = this.timeline.local(id, targetS);
      this.jump.targetS = targetS;
      return;
    }
    if (id === this.dominant) {
      // same scene: glide there with the virtual scroll
      this.scroll.setTarget(targetS);
      return;
    }
    const cur = this.scroll.current;
    const from = this.dominant;
    this.scenes[id].rig.reset();
    this.jump = {
      from,
      to: id,
      fromP: this.timeline.local(from, cur),
      toP: this.timeline.local(id, targetS),
      t: 0,
      dur: this.reduced ? 0.45 : 1.6,
      targetS,
    };
    this.scroll.lock(true);
  }

  private onRoute(r: Route): void {
    // back / forward
    if (r.slug) {
      const i = site.projects.findIndex((p) => p.slug === r.slug);
      if (this.dominant !== 'work') this.goTo('work', this.projectScroll(i));
      this.detailPushed = false;
      this.openDetailOnly(i, null);
      return;
    }
    if (this.detail.isOpen) {
      this.detailPushed = false;
      this.hideDetail();
    }
    if (r.scene !== this.dominant) {
      const saved = scrollMemory.load(r.scene);
      const s = saved !== null && this.timeline.dominant(saved) === r.scene ? saved : this.timeline.rest(r.scene);
      this.goTo(r.scene, s);
    }
  }

  private onDominant(id: SceneId): void {
    this.dominant = id;
    this.setNav(id);
    this.shell.live.textContent = `${SCENE_LABEL[id]} section`;
    if (!this.detail.isOpen && !this.jump) this.router?.replace({ scene: id, slug: null });
  }

  private setNav(id: SceneId): void {
    for (const s of SCENE_ORDER) {
      const a = this.shell.navLinks[s];
      if (s === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }

  private projectScroll(i: number): number {
    const p = this.work.dwellProgress(Math.max(0, i));
    return this.timeline.toGlobal('work', p);
  }

  /* ------------------------------------------------------------ */
  /* project detail                                                */
  /* ------------------------------------------------------------ */

  openProject(i: number, opener: HTMLElement | null): void {
    if (i < 0) return;
    if (this.dominant !== 'work') this.goTo('work', this.projectScroll(i));
    else if (opener) this.scroll.setTarget(this.projectScroll(i)); // keyboard: bring it into view behind
    this.router.push({ scene: 'work', slug: site.projects[i].slug });
    this.detailPushed = true;
    this.openDetailOnly(i, opener);
  }

  private openDetailOnly(i: number, opener: HTMLElement | null): void {
    this.detail.open(i, opener);
    this.scroll.lock(true);
    this.work.clearHover();
  }

  private hideDetail(): void {
    this.detail.close();
    if (!this.jump) this.scroll.lock(false);
  }

  private closeDetail(updateUrl = true): void {
    if (!this.detail.isOpen) return;
    this.hideDetail();
    if (!updateUrl) return;
    if (this.detailPushed) {
      this.detailPushed = false;
      history.back(); // returns to /work/ — popstate sees no slug, detail already closed
    } else {
      this.router.replace({ scene: 'work', slug: null });
    }
  }

  /* ------------------------------------------------------------ */
  /* HTML layer                                                    */
  /* ------------------------------------------------------------ */

  private updateHtml(plan: FramePlan): void {
    const s = this.shell;
    for (const id of SCENE_ORDER) {
      const w = id === plan.a ? (plan.b ? 1 - plan.t : 1) : id === plan.b ? plan.t : 0;
      const sec = s.sections[id];
      sec.style.setProperty('--w', w.toFixed(3));
      const inert = w < 0.5;
      if (inert !== this.inert[id]) {
        this.inert[id] = inert;
        sec.inert = inert;
        sec.toggleAttribute('data-hidden', inert);
      }
    }
    // home CTA fades as you scroll into the wordmark
    const hp = this.activeSet.has('home') ? this.home.progress : 1;
    s.sections.home.style.setProperty('--p', smoothstep(0.02, 0.3, hp).toFixed(3));
    const sub = this.home.sub;
    s.homeSub.classList.toggle('is-on', sub.narrow);
    if (sub.narrow) s.homeSub.style.transform = `translate(${sub.x.toFixed(1)}px, ${sub.y.toFixed(1)}px) translateX(-50%)`;

    // contact icon arc follows its 3D anchor and enters after the banner
    if (this.activeSet.has('contact')) {
      const b = this.contact.buttons;
      s.contactArc.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
      const show = b.show && this.dominant === 'contact';
      if (show !== this.contactShown) {
        this.contactShown = show;
        s.contactArc.classList.toggle('is-in', show);
      }
    } else if (this.contactShown) {
      this.contactShown = false;
      s.contactArc.classList.remove('is-in');
    }
  }

  private updateHover(): void {
    const p = this.input.pointer;
    let hover = false;
    if (!this.detail.isOpen && !this.jump && p.active && p.type !== 'touch' && this.dominant === 'work') {
      this.ndc.set(p.x, p.y);
      hover = this.work.pick(this.ndc);
    } else if (this.dominant === 'work') {
      this.work.clearHover();
    }
    if (hover !== this.hoverable) {
      this.hoverable = hover;
      this.shell.canvas.style.cursor = hover ? 'pointer' : '';
    }
  }

  private onCanvasClick(): void {
    if (this.detail.isOpen || this.jump) return;
    const p = this.input.pointer;
    this.ndc.set(p.x, p.y);
    this.scenes[this.dominant].click(this.ndc);
  }

  /* ------------------------------------------------------------ */
  /* resize / quality / dispose                                    */
  /* ------------------------------------------------------------ */

  private resizeQueued = false;
  resize(): void {
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => {
      this.resizeQueued = false;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr);
      this.ctx.width = w;
      this.ctx.height = h;
      this.ctx.dpr = dpr;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.rtA.setSize(Math.round(w * dpr), Math.round(h * dpr));
      this.rtB.setSize(Math.round(w * dpr), Math.round(h * dpr));
      for (const sc of this.sceneList()) sc.resize(w, h, dpr);
    });
  }

  private stepDown(): void {
    if (this.quality.tier === 'low') return;
    const next = settingsFor(lowerTier(this.quality.tier));
    console.info(`[quality] frame time too high → stepping down to "${next.tier}"`);
    this.quality = next;
    this.ctx.quality = next;
    this.ctx.dpr = Math.min(window.devicePixelRatio || 1, next.maxDpr);
    this.createTargets();
    for (const sc of this.sceneList()) sc.applyQuality(next);
    this.resize();
    document.documentElement.dataset.tier = next.tier;
  }

  get tier(): string {
    return this.quality.tier;
  }

  dispose(): void {
    this.running = false;
    this.pause();
    this.input.dispose();
    this.router?.dispose();
    this.disposers.forEach((d) => d());
    for (const sc of this.sceneList()) sc.dispose();
    this.compositor.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.renderer.dispose();
  }
}
