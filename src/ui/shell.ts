import { site, type ContactLinks } from '../content/site.config';
import { SCENE_ORDER, SCENE_LABEL, SCENE_PATH, type SceneId } from '../app/state';
import { chamfer } from './chamfer';
import { h } from './dom';
import { ICONS, type IconName } from './icons';

/**
 * Semantic HTML layer over the canvas: nav, per-scene controls and an
 * accessible mirror of all text rendered in WebGL.
 */
export interface Shell {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ui: HTMLElement;
  nav: HTMLElement;
  navLinks: Record<SceneId, HTMLAnchorElement>;
  sections: Record<SceneId, HTMLElement>;
  journey: HTMLButtonElement;
  homeSub: HTMLElement;
  scrollHint: HTMLElement;
  workButtons: HTMLButtonElement[];
  contactArc: HTMLElement;
  contactButtons: HTMLAnchorElement[];
  live: HTMLElement;
}

const LINK_META: Record<keyof ContactLinks, { label: string; icon: IconName; href: (v: string) => string }> = {
  email: { label: 'Email', icon: 'email', href: (v) => (v.startsWith('mailto:') ? v : `mailto:${v}`) },
  github: { label: 'GitHub', icon: 'github', href: (v) => v },
  linkedin: { label: 'LinkedIn', icon: 'linkedin', href: (v) => v },
  instagram: { label: 'Instagram', icon: 'instagram', href: (v) => v },
  x: { label: 'X (Twitter)', icon: 'x', href: (v) => v },
};

export function configuredLinks(): { key: keyof ContactLinks; label: string; icon: IconName; href: string }[] {
  const out: { key: keyof ContactLinks; label: string; icon: IconName; href: string }[] = [];
  (Object.keys(LINK_META) as (keyof ContactLinks)[]).forEach((key) => {
    const v = site.contact.links[key];
    if (typeof v === 'string' && v.trim()) {
      const m = LINK_META[key];
      out.push({ key, label: m.label, icon: m.icon, href: m.href(v.trim()) });
    }
  });
  return out;
}

export function buildShell(mount: HTMLElement): Shell {
  const canvas = h('canvas', { class: 'gl', 'aria-hidden': 'true' });

  /* ---------- nav ---------- */
  const navLinks = {} as Record<SceneId, HTMLAnchorElement>;
  const navList = h('ul', { class: 'nav__list' });
  for (const id of SCENE_ORDER) {
    const a = h('a', { class: 'nav__link', href: SCENE_PATH[id], 'data-scene': id }, SCENE_LABEL[id]);
    navLinks[id] = a;
    navList.append(h('li', { class: 'nav__item' }, a));
  }
  const nav = h('nav', { class: 'nav', 'aria-label': 'Primary' }, navList);
  chamfer(nav, { tl: 7, br: 9, ticks: false });

  /* ---------- home ---------- */
  const journey = h(
    'button',
    { class: 'btn btn--journey', type: 'button' },
    h('span', { class: 'btn__label' }, 'Start the Journey'),
  );
  chamfer(journey, { tl: 9, br: 9 });
  const scrollHint = h(
    'div',
    { class: 'scroll-hint', 'aria-hidden': 'true' },
    h('span', { class: 'scroll-hint__label' }, 'Scroll'),
    h('i', { class: 'scroll-hint__line' }),
  );
  const home = h(
    'section',
    { class: 'scene-ui scene-ui--home', 'data-scene': 'home', 'aria-labelledby': 'home-title' },
    h('h1', { id: 'home-title', class: 'sr-only' }, site.person.name),
    h('p', { class: 'sr-only' }, site.person.subtitle),
    h(
      'p',
      { class: 'home-sub', 'aria-hidden': 'true' },
      h('span', { class: 'home-sub__name' }, site.person.lastName.toUpperCase()),
      h('span', { class: 'home-sub__line' }, site.person.subtitle),
    ),
    h('div', { class: 'home-cta' }, journey, scrollHint),
  );

  /* ---------- about (accessible mirror of the 3D panels) ---------- */
  const panels = [site.about.intro, ...site.about.panels];
  const about = h(
    'section',
    { class: 'scene-ui scene-ui--about', 'data-scene': 'about', 'aria-labelledby': 'about-title' },
    h('h2', { id: 'about-title', class: 'sr-only' }, 'About'),
    h(
      'div',
      { class: 'sr-only' },
      panels.map((p) => h('article', {}, h('h3', {}, p.title), h('p', {}, p.body))),
      h('h3', {}, 'Roles'),
      h('ul', {}, site.person.roles.map((r) => h('li', {}, r))),
      h('p', {}, site.person.education),
    ),
  );

  /* ---------- work ---------- */
  const workButtons = site.projects.map((p, i) => {
    const b = h(
      'button',
      { class: 'btn btn--project', type: 'button', 'data-index': i },
      h('span', { class: 'btn__label' }, `Open project: ${p.title}`),
    );
    chamfer(b, { tl: 7, br: 7 });
    return b;
  });
  const work = h(
    'section',
    { class: 'scene-ui scene-ui--work', 'data-scene': 'work', 'aria-labelledby': 'work-title' },
    h('h2', { id: 'work-title', class: 'sr-only' }, 'Work'),
    h(
      'ul',
      { class: 'work-list' },
      workButtons.map((b, i) =>
        h(
          'li',
          {},
          b,
          h('p', { class: 'sr-only' }, `${site.projects[i].descriptor}.`),
        ),
      ),
    ),
  );

  /* ---------- contact ---------- */
  const links = configuredLinks();
  const contactButtons = links.map((l) => {
    const a = h('a', {
      class: 'icon-btn',
      href: l.href,
      'aria-label': l.label,
      title: l.label,
      ...(l.key === 'email' ? {} : { target: '_blank', rel: 'noopener noreferrer' }),
    });
    a.insertAdjacentHTML('beforeend', `<span class="icon-btn__icon">${ICONS[l.icon]}</span>`);
    chamfer(a, { tl: 6, br: 6 });
    return a;
  });
  const contactArc = h(
    'ul',
    { class: 'contact-arc', 'data-count': contactButtons.length },
    contactButtons.map((a, i) => {
      // offset from the centre of the arc: outer buttons turn toward the middle
      const o = i - (contactButtons.length - 1) / 2;
      return h('li', { class: 'contact-arc__item', style: `--o:${o};--ao:${Math.abs(o)};--i:${i}` }, a);
    }),
  );
  const contact = h(
    'section',
    { class: 'scene-ui scene-ui--contact', 'data-scene': 'contact', 'aria-labelledby': 'contact-title' },
    h('h2', { id: 'contact-title', class: 'sr-only' }, 'Contact'),
    h('p', { class: 'sr-only' }, site.contact.bannerLines.join(' ')),
    contactButtons.length ? contactArc : null,
  );

  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const main = h('main', { class: 'scenes', id: 'content' }, home, about, work, contact);
  const ui = h('div', { class: 'ui' }, nav, main, live);
  const root = h('div', { class: 'app' }, canvas, ui);
  mount.append(root);

  return {
    root,
    canvas,
    ui,
    nav,
    navLinks,
    sections: { home, about, work, contact },
    journey,
    homeSub: home.querySelector('.home-sub') as HTMLElement,
    scrollHint,
    workButtons,
    contactArc,
    contactButtons,
    live,
  };
}
