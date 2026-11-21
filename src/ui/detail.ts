import { site, type Project } from '../content/site.config';
import { assetUrl, manifest } from '../assets/assets';
import { drawCover } from '../scenes/work/covers';
import { chamfer } from './chamfer';
import { h } from './dom';
import { ICONS } from './icons';

/**
 * Project detail view (/work/<slug>/): a modal dialog with native vertical
 * scrolling and horizontal switching (swipe with axis lock after 10px, arrow
 * buttons, ←/→ keys). Esc / close returns to the gallery.
 */
export class ProjectDetail {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private scroller: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private counter: HTMLElement;
  private opener: HTMLElement | null = null;
  isOpen = false;
  index = 0;
  onClose: () => void = () => {};
  onSwitch: (index: number) => void = () => {};

  // gesture state
  private g = { id: -1, x: 0, y: 0, axis: '' as '' | 'x' | 'y', dx: 0 };

  constructor(mount: HTMLElement) {
    this.closeBtn = h('button', { class: 'detail__btn detail__close', type: 'button', 'aria-label': 'Close project' });
    this.closeBtn.insertAdjacentHTML('beforeend', ICONS.close);
    this.prevBtn = h('button', { class: 'detail__btn detail__prev', type: 'button', 'aria-label': 'Previous project' });
    this.prevBtn.insertAdjacentHTML('beforeend', ICONS.prev);
    this.nextBtn = h('button', { class: 'detail__btn detail__next', type: 'button', 'aria-label': 'Next project' });
    this.nextBtn.insertAdjacentHTML('beforeend', ICONS.next);
    [this.closeBtn, this.prevBtn, this.nextBtn].forEach((b) => chamfer(b, { tl: 6, br: 6 }));
    this.counter = h('p', { class: 'detail__counter', 'aria-hidden': 'true' });

    this.body = h('div', { class: 'detail__body' });
    this.scroller = h('div', { class: 'detail__scroll', 'data-native-scroll': '', tabindex: '-1' }, this.body);
    const frame = h('div', { class: 'detail__frame' }, this.scroller);
    chamfer(frame, { tl: 16, br: 16, ticks: true });

    this.el = h(
      'div',
      {
        class: 'detail',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'detail-title',
        hidden: true,
      },
      h('div', { class: 'detail__backdrop', 'aria-hidden': 'true' }),
      frame,
      h('div', { class: 'detail__controls' }, this.prevBtn, this.counter, this.nextBtn),
      this.closeBtn,
    );
    mount.append(this.el);

    this.closeBtn.addEventListener('click', () => this.onClose());
    this.prevBtn.addEventListener('click', () => this.step(-1));
    this.nextBtn.addEventListener('click', () => this.step(1));
    this.el.querySelector('.detail__backdrop')!.addEventListener('click', () => this.onClose());
    this.el.addEventListener('keydown', this.onKey);
    frame.addEventListener('pointerdown', this.onDown);
    frame.addEventListener('pointermove', this.onMove);
    frame.addEventListener('pointerup', this.onUp);
    frame.addEventListener('pointercancel', this.onCancel);
  }

  open(index: number, opener: HTMLElement | null = null): void {
    this.opener = opener ?? (document.activeElement as HTMLElement | null);
    this.render(index);
    if (!this.isOpen) {
      this.isOpen = true;
      this.el.hidden = false;
      document.documentElement.classList.add('has-detail');
      requestAnimationFrame(() => this.el.classList.add('is-open'));
    }
    this.closeBtn.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    document.documentElement.classList.remove('has-detail');
    this.pauseVideos();
    window.setTimeout(() => {
      if (!this.isOpen) this.el.hidden = true;
    }, 420);
    const o = this.opener;
    this.opener = null;
    if (o && document.contains(o) && !o.closest('[inert]')) o.focus({ preventScroll: true });
  }

  private step(dir: number): void {
    const n = site.projects.length;
    const i = (this.index + dir + n) % n;
    this.render(i, dir);
    this.onSwitch(i);
  }

  private render(index: number, dir = 0): void {
    this.pauseVideos();
    this.index = index;
    const p = site.projects[index];
    const n = site.projects.length;
    this.counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    this.body.replaceChildren(...this.content(p, index, n));
    this.scroller.scrollTop = 0;
    if (dir) {
      this.body.animate(
        [
          { transform: `translateX(${dir * 40}px)`, opacity: 0 },
          { transform: 'translateX(0)', opacity: 1 },
        ],
        { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
    }
  }

  private content(p: Project, index: number, n: number): Node[] {
    const images = manifest.projectImages(p.slug);
    const video = manifest.projectVideo(p.slug, p.video);
    let visual: HTMLElement;
    if (video) {
      visual = h(
        'figure',
        { class: 'detail__visual' },
        h('video', {
          src: assetUrl(video),
          muted: true,
          loop: true,
          playsinline: true,
          autoplay: true,
          controls: true,
          'aria-label': `${p.title} preview video`,
        }),
      );
    } else if (images.length) {
      visual = h(
        'figure',
        { class: 'detail__visual detail__visual--gallery' },
        images.map((src, i) =>
          h('img', { src: assetUrl(src), alt: `${p.title} screenshot ${i + 1}`, loading: 'lazy', decoding: 'async' }),
        ),
      );
    } else {
      const c = drawCover(p.slug, 1024, 640);
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', `Abstract illustration for ${p.title}`);
      visual = h(
        'figure',
        { class: 'detail__visual' },
        c,
        h('figcaption', {}, 'Illustrative cover generated in code — not a product screenshot.'),
      );
    }

    const section = (title: string, ...kids: (Node | string | null)[]) =>
      h('section', { class: 'detail__section' }, h('h3', { class: 'detail__h3' }, title), ...kids);

    const links: HTMLElement[] = [];
    if (p.repo) links.push(this.linkBtn(p.repo, 'View repository'));
    if (p.live) links.push(this.linkBtn(p.live, 'Open live site'));

    return [
      h(
        'header',
        { class: 'detail__header' },
        h('p', { class: 'detail__eyebrow' }, `Project ${String(index + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`),
        h('h2', { class: 'detail__title', id: 'detail-title' }, p.title),
        h('p', { class: 'detail__descriptor' }, p.descriptor),
        p.tags.length ? h('ul', { class: 'detail__tags', 'aria-label': 'Labels' }, p.tags.map((t) => h('li', {}, t))) : null,
      ),
      visual,
      section('Overview', h('p', {}, p.overview)),
      section('My role', h('p', {}, p.role)),
      section('Tech', h('ul', { class: 'detail__chips' }, p.tech.map((t) => h('li', {}, t)))),
      section('Implemented', h('ul', { class: 'detail__list' }, p.features.map((f) => h('li', {}, f)))),
      p.future
        ? h(
            'section',
            { class: 'detail__section detail__future' },
            h('h3', { class: 'detail__h3' }, 'Future direction'),
            h('p', { class: 'detail__future-label' }, 'Planned — not implemented'),
            h('p', {}, p.future),
          )
        : null,
      links.length ? h('div', { class: 'detail__links' }, links) : null,
    ].filter(Boolean) as Node[];
  }

  private linkBtn(href: string, label: string): HTMLElement {
    const a = h('a', { class: 'btn btn--link', href, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'btn__label' }, label));
    a.insertAdjacentHTML('beforeend', `<span class="btn__icon">${ICONS.external}</span>`);
    chamfer(a, { tl: 8, br: 8 });
    return a;
  }

  private pauseVideos(): void {
    this.body.querySelectorAll('video').forEach((v) => v.pause());
  }

  /* ---------- keyboard: Esc, ←/→, focus trap ---------- */
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.onClose();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.step(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key === 'Tab') {
      const f = Array.from(
        this.el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])'),
      ).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  /* ---------- swipe with axis lock ---------- */
  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('a,button,video')) return;
    this.g = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: '', dx: 0 };
  };

  private onMove = (e: PointerEvent) => {
    const g = this.g;
    if (e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'x') (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    if (g.axis !== 'x') return;
    g.dx = dx;
    this.body.style.transform = `translateX(${dx * 0.35}px)`;
    this.body.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 600));
  };

  private onUp = (e: PointerEvent) => {
    const g = this.g;
    if (e.pointerId !== g.id) return;
    const dx = g.dx;
    const wasX = g.axis === 'x';
    this.onCancel();
    if (wasX && Math.abs(dx) > 60) this.step(dx < 0 ? 1 : -1);
  };

  private onCancel = () => {
    this.g = { id: -1, x: 0, y: 0, axis: '', dx: 0 };
    this.body.style.transform = '';
    this.body.style.opacity = '';
  };
}
