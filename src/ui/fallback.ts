import { site } from '../content/site.config';
import { chamfer } from './chamfer';
import { h } from './dom';
import { contactItems, contactButton } from './shell';

/**
 * Static HTML version of the whole site (same palette + typography).
 * Shown automatically when WebGL is unavailable, a shader fails to compile,
 * the GPU context is lost, or loading times out.
 */
export function showFallback(mount: HTMLElement, reason: string, allowRetry = true): void {
  document.documentElement.classList.add('is-fallback');
  mount.replaceChildren();

  const panels = [site.about.intro, ...site.about.panels];
  const links = contactItems();

  const card = (title: string, ...body: (Node | string | null)[]) => {
    const el = h('article', { class: 'fb-card' }, h('h3', { class: 'fb-card__title' }, title), ...body);
    chamfer(el, { tl: 12, br: 12 });
    return el;
  };

  const nav = h(
      'nav',
      { class: 'nav nav--static', 'aria-label': 'Primary' },
      h(
        'ul',
        { class: 'nav__list' },
        ['Home', 'About', 'Work', 'Contact'].map((l) =>
          h('li', { class: 'nav__item' }, h('a', { class: 'nav__link', href: `#fb-${l.toLowerCase()}` }, l)),
        ),
      ),
    );
  chamfer(nav, { tl: 7, br: 9 });

  const page = h(
    'div',
    { class: 'fallback' },
    nav,
    h(
      'main',
      { class: 'fb-main' },
      h(
        'header',
        { class: 'fb-hero', id: 'fb-home' },
        h('h1', { class: 'fb-hero__name' }, site.person.firstName.toUpperCase(), h('span', {}, site.person.lastName.toUpperCase())),
        h('p', { class: 'fb-hero__sub' }, site.person.subtitle),
        h('p', { class: 'fb-note', role: 'note' }, reason),
        allowRetry
          ? h('p', {}, h('a', { class: 'fb-link', href: location.pathname.replace(/[^/]*$/, '') }, 'Try the 3D version again'))
          : null,
      ),
      h(
        'section',
        { class: 'fb-section', id: 'fb-about', 'aria-labelledby': 'fb-about-t' },
        h('h2', { id: 'fb-about-t' }, 'About'),
        h('div', { class: 'fb-grid' }, panels.map((p) => card(p.title, h('p', {}, p.body)))),
        h('p', { class: 'fb-meta' }, site.person.education),
        h('p', { class: 'fb-meta' }, `Internship: ${site.person.internship} · ${site.person.roles.join(' · ')}`),
      ),
      h(
        'section',
        { class: 'fb-section', id: 'fb-work', 'aria-labelledby': 'fb-work-t' },
        h('h2', { id: 'fb-work-t' }, 'Work'),
        h(
          'div',
          { class: 'fb-grid fb-grid--work' },
          site.projects.map((p) =>
            card(
              p.title,
              h('p', { class: 'fb-desc' }, p.descriptor),
              p.tags.length ? h('p', { class: 'fb-tags' }, p.tags.join(' · ')) : null,
              h('p', {}, p.overview),
              h('p', {}, h('strong', {}, 'My role: '), p.role),
              h('p', { class: 'fb-tech' }, p.tech.join(' · ')),
              h('ul', {}, p.features.map((f) => h('li', {}, f))),
              p.future
                ? h('p', { class: 'fb-future' }, h('strong', {}, 'Future direction: '), p.future)
                : null,
              p.repo ? h('p', {}, h('a', { class: 'fb-link', href: p.repo, target: '_blank', rel: 'noopener noreferrer' }, 'Repository')) : null,
              p.live ? h('p', {}, h('a', { class: 'fb-link', href: p.live, target: '_blank', rel: 'noopener noreferrer' }, 'Live site')) : null,
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'fb-section', id: 'fb-contact', 'aria-labelledby': 'fb-contact-t' },
        h('h2', { id: 'fb-contact-t' }, 'Contact'),
        h('p', { class: 'fb-banner' }, site.contact.bannerLines[0], h('br'), h('strong', {}, site.contact.bannerLines[1])),
        links.length
          ? h(
              'ul',
              { class: 'fb-links' },
              links.map((l) => h('li', {}, contactButton(l))),
            )
          : null,
      ),
    ),
  );
  mount.append(page);
}
