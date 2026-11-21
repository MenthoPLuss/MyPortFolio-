/** Inline SVG icons (24×24, currentColor). Decorative: aria-hidden. */
const wrap = (inner: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICONS = {
  email: wrap('<rect x="3" y="5.5" width="18" height="13" rx="1"/><path d="M3.5 6.5 12 13l8.5-6.5"/>'),
  github: `<svg viewBox="0 0 16 16" width="21" height="21" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><rect x="3.5" y="9" width="3.6" height="11.5"/><circle cx="5.3" cy="5.2" r="2.1"/><path d="M10 9h3.4v1.6c.6-1 1.9-1.9 3.8-1.9 3.3 0 3.9 2.1 3.9 4.9v6.9h-3.6v-6.1c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2v6.2H10z"/></svg>`,
  instagram: wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none"/>'),
  x: `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false" fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/></svg>`,
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  prev: wrap('<path d="M15 5l-7 7 7 7"/>'),
  next: wrap('<path d="M9 5l7 7-7 7"/>'),
  external: wrap('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
};

export type IconName = keyof typeof ICONS;
