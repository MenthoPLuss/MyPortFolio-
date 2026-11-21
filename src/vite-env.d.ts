/// <reference types="vite/client" />

declare module 'virtual:asset-manifest' {
  /** Paths relative to public/, e.g. "assets/portrait/portrait.jpg". */
  const files: string[];
  export default files;
}
