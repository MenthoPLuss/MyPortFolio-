import type { ContactLinks } from './site.config';

/** Fixed order of the Contact icon arc. */
export const CONTACT_ORDER = ['linkedin', 'instagram', 'whatsapp', 'email'] as const satisfies readonly (keyof ContactLinks)[];
export type ContactKey = (typeof CONTACT_ORDER)[number];

export const CONTACT_LABEL: Record<ContactKey, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  email: 'Email',
};

export interface ContactEntry {
  key: ContactKey;
  label: string;
  /** Resolved destination, or null when the value is missing/invalid. */
  href: string | null;
  /** Why the entry is unusable (missing / invalid), for warnings. */
  problem: string | null;
}

const profileOn = (v: string, host: string, path: RegExp): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.replace(/^www\./, '') === host
      && !u.username && !u.password && !u.port && path.test(u.pathname)
      && !/[\s<>]/.test(v);
  } catch {
    return false;
  }
};

function resolve(key: ContactKey, raw: string | null): { href: string | null; problem: string | null } {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return { href: null, problem: 'not set' };
  switch (key) {
    case 'linkedin':
      return profileOn(v, 'linkedin.com', /^\/in\/[a-zA-Z0-9_-]+\/?$/) ? { href: v, problem: null } : { href: null, problem: 'expected an https://www.linkedin.com/in/handle/ profile URL' };
    case 'instagram':
      return profileOn(v, 'instagram.com', /^\/(?!accounts\/?$|explore\/?$|direct\/?$|reels?\/?$|p\/?$)[a-zA-Z0-9._]{1,30}\/?$/)
        ? { href: v, problem: null } : { href: null, problem: 'expected an https://www.instagram.com/handle/ profile URL' };
    case 'whatsapp': {
      // wa.me needs the full international number, digits only (no +, spaces or leading 0)
      const digits = v.replace(/[\s()+-]/g, '');
      return /^[1-9]\d{7,14}$/.test(digits)
        ? { href: `https://wa.me/${digits}`, problem: null }
        : { href: null, problem: 'expected an international number including country code' };
    }
    case 'email': {
      const addr = v.replace(/^mailto:/i, '');
      return /^[a-zA-Z0-9.!#$'*+\-\/=^_`{|}~]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(addr)
        && !addr.includes('..') && !/[?#%&]/.test(addr)
        ? { href: `mailto:${addr}`, problem: null }
        : { href: null, problem: 'expected a plain email address without headers or query parameters' };
    }
  }
}

/** All four contact methods in display order, with validated destinations. */
export function contactEntries(links: ContactLinks): ContactEntry[] {
  return CONTACT_ORDER.map((key) => ({ key, label: CONTACT_LABEL[key], ...resolve(key, links[key]) }));
}

/** Structural validation only; profile ownership/delivery must be verified by the owner. */
export function contactProblems(links: ContactLinks): string[] {
  return contactEntries(links).filter((entry) => entry.problem).map((entry) => `${entry.label}: ${entry.problem}`);
}
