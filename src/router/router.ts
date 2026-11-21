import { SCENE_PATH, type SceneId } from '../app/state';

/**
 * History API router. Routes (always with trailing slashes):
 *   /            home
 *   /about/      about
 *   /work/       work
 *   /work/<slug>/ work + project detail
 *   /contact/    contact
 * Paths without a trailing slash are normalised with replaceState.
 * Unknown paths fall back to home.
 */

export interface Route {
  scene: SceneId;
  slug: string | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function pathFor(route: Route): string {
  if (route.scene === 'work' && route.slug) return `${BASE}/work/${route.slug}/`;
  return BASE + SCENE_PATH[route.scene];
}

export function parse(pathname: string, slugs: string[]): Route | null {
  let p = pathname;
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
  if (!p.startsWith('/')) p = '/' + p;
  const parts = p.split('/').filter(Boolean);
  if (parts.length === 0) return { scene: 'home', slug: null };
  const [first, second] = parts;
  if (parts.length === 1 && (first === 'about' || first === 'work' || first === 'contact')) {
    return { scene: first, slug: null };
  }
  if (parts.length === 2 && first === 'work' && slugs.includes(second)) {
    return { scene: 'work', slug: second };
  }
  return null;
}

export class Router {
  private slugs: string[];
  private onChange: (r: Route) => void;
  current: Route;

  constructor(slugs: string[], onChange: (r: Route) => void) {
    this.slugs = slugs;
    this.onChange = onChange;
    const parsed = parse(location.pathname, slugs);
    this.current = parsed ?? { scene: 'home', slug: null };
    const canonical = pathFor(this.current);
    if (location.pathname !== canonical) {
      history.replaceState(history.state, '', canonical + location.search + location.hash);
    }
    window.addEventListener('popstate', this.onPop);
  }

  private onPop = () => {
    const r = parse(location.pathname, this.slugs) ?? { scene: 'home', slug: null };
    this.current = r;
    this.onChange(r);
  };

  push(route: Route): void {
    const path = pathFor(route);
    this.current = route;
    if (location.pathname !== path) history.pushState({ app: 1 }, '', path);
  }

  replace(route: Route): void {
    const path = pathFor(route);
    this.current = route;
    if (location.pathname !== path) history.replaceState({ app: 1 }, '', path);
  }

  dispose(): void {
    window.removeEventListener('popstate', this.onPop);
  }
}
