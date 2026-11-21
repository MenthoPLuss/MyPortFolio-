import { damp } from '../app/state';
import { chamfer } from './chamfer';
import { h } from './dom';

/**
 * Thin illuminated reticle + smoothed numeric percentage of REAL progress.
 * Exposes Retry for recoverable errors.
 */
export class LoaderUI {
  readonly el: HTMLElement;
  private ring: SVGCircleElement;
  private num: HTMLElement;
  private msg: HTMLElement;
  private retryBtn: HTMLButtonElement;
  private target = 0;
  private shown = 0;
  private raf = 0;
  private last = 0;
  private readonly C = 2 * Math.PI * 52;
  onRetry: () => void = () => {};

  constructor(mount: HTMLElement) {
    this.num = h('span', { class: 'loader__num' }, '0');
    this.msg = h('p', { class: 'loader__msg', hidden: true });
    this.retryBtn = h(
      'button',
      { class: 'btn btn--retry', type: 'button', hidden: true },
      h('span', { class: 'btn__label' }, 'Retry'),
    );
    chamfer(this.retryBtn, { tl: 8, br: 8 });
    this.retryBtn.addEventListener('click', () => this.onRetry());

    const ticks = Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const r1 = i % 9 === 0 ? 57 : 59;
      return `<line x1="${60 + Math.cos(a) * r1}" y1="${60 + Math.sin(a) * r1}" x2="${60 + Math.cos(a) * 62}" y2="${60 + Math.sin(a) * 62}"/>`;
    }).join('');

    const reticle = h('div', { class: 'loader__reticle', 'aria-hidden': 'true' });
    reticle.innerHTML = `
      <svg viewBox="0 0 120 120" width="120" height="120">
        <g class="loader__ticks">${ticks}</g>
        <circle class="loader__track" cx="60" cy="60" r="52"/>
        <circle class="loader__ring" cx="60" cy="60" r="52" stroke-dasharray="${this.C}" stroke-dashoffset="${this.C}" transform="rotate(-90 60 60)"/>
        <circle class="loader__inner" cx="60" cy="60" r="44"/>
      </svg>`;
    this.ring = reticle.querySelector('.loader__ring') as SVGCircleElement;

    this.el = h(
      'div',
      { class: 'loader', role: 'progressbar', 'aria-label': 'Loading', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 },
      reticle,
      h('div', { class: 'loader__pct' }, this.num, h('span', { class: 'loader__unit' }, '%')),
      this.msg,
      this.retryBtn,
    );
    mount.append(this.el);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  set(p: number): void {
    this.target = Math.max(this.target, Math.min(1, p));
  }

  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.shown += (this.target - this.shown) * damp(5, dt);
    if (this.target - this.shown < 0.002) this.shown = this.target;
    const pct = Math.round(this.shown * 100);
    this.num.textContent = String(pct);
    this.el.setAttribute('aria-valuenow', String(pct));
    this.ring.style.strokeDashoffset = String(this.C * (1 - this.shown));
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Resolves when the displayed number has caught up with 100%. */
  async finish(): Promise<void> {
    this.set(1);
    await new Promise<void>((res) => {
      const check = () => (this.shown >= 0.999 ? res() : setTimeout(check, 30));
      check();
    });
    this.el.classList.add('is-settling');
    await wait(520);
    this.el.classList.add('is-done');
    await wait(700);
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }

  error(message: string, retry: boolean): void {
    this.el.classList.add('is-error');
    this.msg.hidden = false;
    this.msg.textContent = message;
    this.retryBtn.hidden = !retry;
    if (retry) this.retryBtn.focus();
  }

  clearError(): void {
    this.el.classList.remove('is-error');
    this.msg.hidden = true;
    this.retryBtn.hidden = true;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
