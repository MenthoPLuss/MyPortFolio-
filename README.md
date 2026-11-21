# Asimangkan Boro — 3D portfolio

A scroll-driven WebGL portfolio in four continuous scenes: **Home → About → Work → Contact**.
It recreates the visual language, camera behaviour and transitions of
[sztanki.com](https://www.sztanki.com/), with Asimangkan Boro's own content.

Vite + TypeScript + three.js `0.187.0` (pinned), WebGL2, custom GLSL `ShaderMaterial`s. No React.

```bash
npm install
npm run dev        # http://localhost:5173  (also /about/, /work/<slug>/, /contact/)
npm run build      # type-check + production build → dist/
npm run preview    # serve dist/ at http://localhost:4173
```

---

## Editing content

All personal content lives in **one typed file**: [`src/content/site.config.ts`](src/content/site.config.ts).

- **Contact links:** `email`, `github`, `linkedin`, `instagram` and `x` are `null` by default.
  Fill in the real values; the Contact arc shows only non-null links (it adapts to 0–5 buttons).
  Use `email: 'name@domain.com'`; the site adds `mailto:` itself.
- **About panels:** `about.intro` plus `about.panels`. Text wraps automatically on the 3D panels and is mirrored in accessible HTML.
- **Projects:** `projects[]`. Each has an overview, role, tech, implemented features, `future` (always labelled
  "Future direction — planned, not implemented"), `repo` and `live` (a `null` link renders no button).
- Unknown values stay `null`, and their UI is omitted. Nothing is invented: no metrics, clients, deployments or screenshots.

### Media (file drop, no code changes)

| What | Where | Notes |
| --- | --- | --- |
| Portrait | `public/assets/portrait/portrait.glb` **or** `portrait.jpg` (+ `portrait-depth.png`) | See [portrait README](public/assets/portrait/README.md). Without one, an abstract placeholder sculpture is shown. |
| Project screenshots | `public/assets/projects/<slug>/cover.jpg` + more images | Without them, honest abstract covers are generated in code and labelled as illustrations. |
| Project video | `public/assets/projects/<slug>/preview.mp4` | Muted, looped, `playsinline`; plays only near the camera. |

A Vite plugin (`virtual:asset-manifest` in [vite.config.ts](vite.config.ts)) lists `public/assets/` at dev/build time.
The app knows what exists without probing URLs, which would cause console 404s. Adding a file in dev triggers a reload.
After adding files for production, run `npm run build` again.

---

## Deploying (direct loads of `/about/`, `/work/<slug>/` …)

The app is a SPA with History-API routes (trailing slashes). The build includes three fallbacks, so it works on common hosts:

| Host | Mechanism | File |
| --- | --- | --- |
| **Vercel** | rewrites everything that isn't a static file to `/index.html`, `trailingSlash: true` | [`vercel.json`](vercel.json) |
| **Netlify / Cloudflare Pages** | `/*  /index.html  200` | [`public/_redirects`](public/_redirects) |
| **GitHub Pages** (and any static host that serves `404.html`) | `dist/404.html` is a copy of `index.html` (emitted by the `spa-404` plugin) | generated at build |

Dev (`npm run dev`) and `npm run preview` use Vite's built-in SPA fallback. For a sub-path deploy (e.g. `user.github.io/repo/`),
set `base` in `vite.config.ts`; all runtime URLs use `import.meta.env.BASE_URL`.

---

## Folder map

```
index.html                  shell + <noscript> message
vite.config.ts              asset-manifest plugin, 404.html plugin, SPA fallback
vercel.json · public/_redirects
public/
  fonts/                    self-hosted Excon (400/500/700) + Antonio (variable, latin)
  assets/portrait/          portrait.glb | portrait.jpg (+ depth)    ← drop files here
  assets/projects/<slug>/   cover / screenshots / preview video      ← drop files here
src/
  main.ts                   boot: renderer, quality tier, loader tasks, fallback
  content/site.config.ts    ALL personal content
  app/state.ts              scene order, scroll timeline (ranges + overlaps), event bus, sessionStorage
  app/App.ts                the single rAF loop: input → scroll → scenes → compositor → HTML
  router/router.ts          History API, trailing slashes, deep links, back/forward
  input/input.ts            wheel (deltaMode-normalised), touch + fling, keyboard, pointer
  scroll/scroll.ts          virtual scroll with frame-rate-independent damping + inertia
  camera/camera.ts          CatmullRomCurve3 position + look-at paths, damped rig, pointer yaw/pitch
  quality/quality.ts        tier detection + frame-time monitor that steps down
  assets/assets.ts          manifest, task loader with real progress, debug flags
  transitions/compositor.ts final pass: crossfade + warp + swirl + RGB split × sin(πt)
  particles/dust.ts         shared GPU star-dust
  shaders/                  GLSL chunks (palette, noise, chamfer SDF), fullscreen pass, disposal
  scenes/
    BaseScene.ts            scene contract (build/update/render/resize/quality/dispose)
    shared/panel3d.ts       curved chamfered frosted panel + bar/title/line reveal
    home/                   HomeScene, GPU fluid, volumetric wordmark
    about/                  AboutScene, portrait pipeline (glb / photo / placeholder)
    work/                   WorkScene (corridor, planes, glitch), procedural covers
    contact/                ContactScene (fibres, banner, icon-arc anchor)
  ui/                       nav/scene HTML mirror, chamfer frames, icons, loader, project dialog, static fallback
  styles/main.css
reference/                  put IMG_1302.mov here (see reference/README.md)
```

---

## Fonts

| Use | Font | Source / licence |
| --- | --- | --- |
| Wordmark, headings, body | **Excon** 400 / 500 / 700 | Indian Type Foundry via Fontshare — ITF Free Font License (free for personal and commercial use, self-hosting allowed) |
| Nav, buttons, panel titles, labels | **Antonio** (variable 100–700, used at 600) | Google Fonts — SIL Open Font License 1.1 |

No substitutions were needed. Only Antonio's **latin** subset is bundled; add the latin-ext file if you need more glyphs.

---

## What is confirmed reference behaviour vs. my implementation choices

The recording (`reference/IMG_1302.mov`) was **not in the workspace**, so no frames were extracted. Instead I captured
the live site with headless Edge (1440×900) while scrolling, and compared each scene against those captures and the written
description in the brief.

| Area | Confirmed on the reference (brief + live capture) | Implementation choice here |
| --- | --- | --- |
| Chrome | One chamfered nav box, `HOME \| ABOUT \| WORK \| CONTACT` in Antonio, active item cyan; URL updates while scrolling, with trailing slashes; normal cursor | Nav links are real `<a>`s with `aria-current`; URL uses `replaceState` while scrolling and `pushState` on clicks |
| Home | Volumetric wordmark in fog, lit where the pointer passes, glow trails and fades; tiny subtitle; START THE JOURNEY; **scrolling flies the camera into the letters** (live capture) | Single plane that ray-marches a slab of stacked mask layers (fake extrusion with real parallax), horizontal streak + radial god-ray blur, lit by a **GPU stable-fluids simulation** (20 Jacobi iterations on the high tier). On phones, BORO and the subtitle become HTML so they stay readable |
| Home → About | Shader dissolve with brief warp and red/cyan fringe | Noise-dissolved crossfade + swirl + warp + RGB split, all multiplied by `sin(πt)` (zero at rest) |
| About | Particle portrait with rim light; particle disc; camera goes front → close → around (the live capture shows it reaching the **back of the head**) → slides away; curved panels revealed one at a time with a bright bar, then title, then lines; per-line **left-to-right** text wipe (live capture) | Panels on a ring around the head; only the nearest qualifying panel can fully reveal, while further ones show only the light bar. Two layouts: full orbit for GLB/placeholder, shallow frontal arc for photos (2.5D) |
| Work | Dotted perspective grid, converging light lines, HUD remnants, ghost covers; projects along depth; active = colour, others blue; velocity glitch; last project fills the screen | Camera dwells at each project; slice glitch + smear + RGB split scale with scroll velocity and settle to zero. Labels are 3D (raycast hover) and mirrored as keyboard-focusable HTML buttons |
| Contact | Column of thin glowing fibres fanning out over the floor with moving glints; curved banner; 5 chamfered icon buttons in an arc | 1px line fibres + flowing glint points; the banner uses the panel reveal; icon buttons are real `<a>`s in a CSS-3D arc that only renders configured links (none by default) |
| Flow direction | Not determinable from stills | Glints flow **down** the column and **outward** over the floor |
| Palette | Brief: trust the hex palette over the video | Base colours follow the brief exactly. The live site is noticeably brighter mid-blue than `#051126` even in a direct capture, so a soft haze lifts the midtones around the subject. Make the haze darker if you want the strict palette |

---

## Quality, accessibility, fallbacks

- **Tiers** (`high` / `mid` / `low`) come from the GPU string, device memory, CPU cores, coarse pointer and screen size.
  The tier controls particle counts, DPR cap (≤2 desktop, ≤1.5 mobile), MSAA, fluid resolution and pressure iterations,
  wordmark ray steps, god rays and frosted backdrop. The median frame time is measured for ~2 s and the tier
  **steps down automatically** (up to twice). Force a tier with `?quality=low|mid|high`.
- **Reduced motion:** short fades instead of warps (no RGB split), fluid off (letters statically lit), no pointer yaw,
  slower particle motion, faster panel reveals.
- **Accessibility:** semantic `<nav>`, visible focus rings, every action keyboard-reachable (nav, Start, project buttons,
  dialog prev/next/close, contact links), `aria-live` scene announcements, a full HTML mirror of the WebGL text,
  a focus-trapped project dialog (Esc closes, ←/→ switch), and inactive scenes are `inert`.
- **Fallback:** if WebGL2 creation fails, a shader fails to compile, the GPU context is lost, or loading takes over 30 s,
  a styled static HTML version (bio, all projects, configured links) is shown automatically.
- **Debug flags:** `?debug=no-webgl` (force the fallback), `?debug=fail-asset` (simulate a failed load → Retry),
  `?debug=slow` (slower loader to watch progress). They can be combined: `?debug=slow,fail-asset`.
- **Lifecycle:** one rAF loop; paused while the tab is hidden; only visible or transitioning scenes update and render;
  geometries, materials, textures and render targets are disposed on teardown (HMR, fallback, context loss);
  About's frost target is shrunk while off-screen; videos pause off-screen.

---

## Acceptance checklist (tested in headless Edge 1440×900 + 390×844/360×740 touch emulation, RTX 4050)

| ✓ | Check | How it was tested |
| --- | --- | --- |
| ✅ | `npm install && npm run dev` with zero console errors; `npm run build && npm run preview` | Console captured across all scenes. Only intentional `console.info` / `console.warn` lines (tier, placeholder notice, simulated failure) |
| ✅ | Loader with real progress → Home; Retry and fallback paths | `?debug=fail-asset` → error + Retry → loads; `?debug=no-webgl` → static page |
| ✅ | Pointer reveals and lights the wordmark with a curling, fading wake | Pointer sweeps captured; the wake fades within ~1–2 s |
| ✅ | Wheel, touch and keyboard scrolling with momentum, no hard stops | Wheel glide after release measured; touch fling continues; PageDown / ↑ / Space; transitions follow scroll |
| ✅ | URL + nav update while scrolling; nav links; direct loads of every route; back/forward restore | Tested on dev **and** the production preview, including `/work/tender-ai/` and `/about` → `/about/` |
| ✅ | About panels one by one (bar → title → lines); mouse doesn't rotate the About camera | Screenshots along the path; About ignores the pointer |
| ✅ | Projects open (click / keyboard), switch (→ / ← / buttons / swipe), close back to the same position | Click → `/work/jecverse/`, → → `/work/plugora/`, Esc → `/work/` at the same scroll |
| ✅ | Contact shows only configured links, real anchors, focusable | Temporarily filled with `example.com` placeholders (now reverted to `null`): five `<a>`s in the arc, Tab-reachable |
| ✅ | Transition distortion peaks mid-way and is gone at rest | Captures at mid-transition show the fringe; at rest the compositor passes the image through (distortion × sin(πt) = 0) |
| ✅ | 360–430 px widths readable, no horizontal scroll | `scrollWidth === innerWidth` at 360 and 390 |
| ✅ | Reduced-motion and no-WebGL modes | Emulated `prefers-reduced-motion`; `?debug=no-webgl` |
| ✅ | Hidden tab pauses rendering; resources disposed | Simulated `visibilitychange` → the loop stops and the clock freezes, then resumes |
| ⚠️ | Not tested on real devices | Real iOS Safari / Android Chrome, real trackpads, and screen readers (NVDA/VoiceOver) still need a manual pass. A **real portrait photo** and **real screenshots** have not been tried yet (the pipelines were tested with throwaway test images, now deleted) |

---

## Assets I still need from you

1. **Portrait:** `portrait.jpg` (head-and-shoulders, plain background) and ideally `portrait-depth.png`, or a `portrait.glb` bust.
   Until then the About scene shows the abstract placeholder.
2. **Project screenshots** (and optional short videos) for JEC Maps, Plugora, M-PHISH and tender.ai.
3. **Contact links:** email, GitHub, LinkedIn, Instagram and X profile URLs (or leave any of them `null`).
4. **Plugora repo / live URL** if one exists (currently `null`). Live URLs for any deployed project.
5. **Resume:** none was found in `reference/` or `public/`. If you want facts from your resume used, copy it into
   `reference/`. I did not open the copy on your Desktop.
6. Optional: the reference recording `IMG_1302.mov` in `reference/`, to fine-tune timing against it.
