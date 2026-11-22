import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { site } from './src/content/site.config.ts';
import { contactProblems } from './src/content/contact.ts';

/** Local production previews may omit missing links; release builds require all four. */
function contactReadiness(): Plugin {
  let release = false;
  return {
    name: 'contact-readiness',
    apply: 'build',
    configResolved(c) { release = c.mode === 'release'; },
    buildStart() {
      const problems = contactProblems(site.contact.links);
      if (!problems.length) return;
      const message = `Contact destinations incomplete:\n${problems.join('\n')}\nSet verified values in src/content/site.config.ts before release.`;
      if (release) this.error(message);
      else this.warn(message);
    },
  };
}

/**
 * virtual:asset-manifest
 * Lists every file under public/assets/ at dev/build time so the app knows which
 * optional assets exist (portrait.glb, portrait.jpg, project screenshots, videos)
 * WITHOUT probing URLs (probing would log 404s in the console, and the SPA
 * fallback would answer missing files with index.html).
 * Dropping a file into public/assets/ triggers a full reload in dev.
 */
function assetManifest(): Plugin {
  const VIRTUAL = 'virtual:asset-manifest';
  const RESOLVED = '\0' + VIRTUAL;
  let publicDir = '';
  let assetsDir = '';

  const scan = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (!e.name.startsWith('.') && !/\.(md|txt)$/i.test(e.name)) {
          out.push(path.relative(publicDir, full).split(path.sep).join('/'));
        }
      }
    };
    walk(assetsDir);
    return out.sort();
  };

  return {
    name: 'asset-manifest',
    configResolved(c) {
      publicDir = c.publicDir;
      assetsDir = path.join(c.publicDir, 'assets');
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      return id === RESOLVED ? `export default ${JSON.stringify(scan())};` : null;
    },
    configureServer(server) {
      const onChange = (file: string) => {
        if (!path.resolve(file).startsWith(path.resolve(assetsDir))) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(assetsDir);
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

/** GitHub-Pages style SPA fallback: dist/404.html is a copy of index.html. */
function spa404(): Plugin {
  let outDir = 'dist';
  return {
    name: 'spa-404',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const index = path.join(outDir, 'index.html');
      if (fs.existsSync(index)) fs.copyFileSync(index, path.join(outDir, '404.html'));
    },
  };
}

export default defineConfig({
  // appType 'spa' (default) = dev + preview serve index.html for /about/, /work/<slug>/ ...
  appType: 'spa',
  plugins: [contactReadiness(), assetManifest(), spa404()],
  build: {
    target: 'es2022',
    // keep Vite's bundles out of /assets/ (which holds user content from public/assets/)
    assetsDir: '_app',
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
