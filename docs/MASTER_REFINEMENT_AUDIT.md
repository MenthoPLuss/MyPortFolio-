# Master refinement audit — 22 November 2026

Baseline: `63ffb12`, with pre-existing edits to `site.config.ts`, `icons.ts`, `shell.ts` and untracked `contact.ts`. Those files and all other tracked/untracked source files were copied, without changing Git state, to `C:/Users/Asimang/.codex/backups/3d-port-refinement-20261122-024216`. The snapshot includes the original status and binary diff.

## Evidence and limits

Inspected the existing source and the saved reference contact sheets in `reference/comparisons/{home_ref,about_ref,work_ref,contact_trans_ref}.png`, alongside `docs/evidence/02_after_matched_states.jpg`. These are **existing evidence**, not new captures. Individual reference frames are available in `reference/frames/`. The four named recordings/specification in the new brief are not present in this checkout. The earlier report describes a different screen recording; its historical test claims are not fresh verification.

The live reference returned no readable page content. Browser inspection was stopped because the computer-use safety check could not confidently identify the Windows browser URL. Fresh browser screenshots, interaction tests, GPU shader compilation and FPS measurements remain unverified this session. Do not infer visual completion from a successful build.

## Architecture retained

| System | Modules | Audit |
| --- | --- | --- |
| State, loop, scene lifecycle | `app/state.ts`, `app/App.ts`, `scenes/BaseScene.ts`, `main.ts` | One coordinated rAF; genuine WebGL2; overlapping scene render targets |
| Input, scroll, camera, routes | `input/input.ts`, `scroll/scroll.ts`, `camera/camera.ts`, `router/router.ts` | Real input, exponential damping, independent position/look splines, History API |
| Typography and fluid | `scenes/home/{HomeScene,wordmark,fluid}.ts` | Ray-marched mask slab; GPU advection, curl, vorticity, pressure solve, ping-pong targets |
| Portrait, vortex, panels | `scenes/about/{portrait,AboutScene}.ts`, `scenes/shared/panel3d.ts` | GLB/photo/placeholder priority; actual 3D particles and curved mesh panels |
| Corridor and project media | `scenes/work/{WorkScene,covers}.ts`, `ui/detail.ts` | 3D planes, velocity shaders, raycast selection, functional detail routes |
| Contact | `scenes/contact/ContactScene.ts`, `content/contact.ts`, `ui/{shell,icons}.ts` | GPU fibre curves; incomplete four-method integration in baseline |
| Atmosphere and transitions | `particles/dust.ts`, `shaders/*`, `transitions/compositor.ts` | Procedural effects; distortion envelope is zero at rest |
| Assets, quality, accessibility | `assets/assets.ts`, `quality/quality.ts`, `ui/fallback.ts`, `styles/main.css` | Manifest, quality tiers, DOM mirror, responsive CSS, static fallback |

No embedded website, screenshot scene substitute, or prerecorded scene replacement was found. Project videos are optional media on real 3D planes. Portrait and project media are explicitly placeholders. No personal portrait or authentic project images are present.

## Discrepancies before edits

| ID / severity | Current → required behaviour | Confirmed cause / responsible module | Correction / verification |
| --- | --- | --- | --- |
| C01 / P0 | Type-check fails; fallback cannot import removed contact helper → working four-icon integration | Missing imports in `ui/shell.ts`; stale helper in `ui/fallback.ts` | Share typed contact entries; type-check, build, destination tests |
| C02 / P1 | No release gate despite config promising one → all four methods required for release | Missing build script/validation hook; disabled icons lack styling | Validate release config before output; retain disabled local icons; reject invalid destinations |
| H01 / P1 | Wake timing and strength depend on frame rate → consistent 1–2 s starting target | `fluid.ts` truncates dt to 1/60; `HomeScene.ts` injects constant dye per frame | Bounded solver substeps, exponential dissipation, time-normalized stroke deposition; numerical tests; GPU comparison pending |
| H02 / P2 | Bright, sharply filled letter patches → atmospheric, restrained reveal | Unbounded additive emission; sharpening reaches full mask too early in `wordmark.ts` | Soften peak reveal/absorption without replacing shader; visual confirmation pending |
| A01 / P0 blocked | Abstract head → actual likeness | No `public/assets/portrait/portrait.glb` or reconstruction inputs | Preserve labelled placeholder; never claim likeness |
| A02 / P1 | Lower quality can remove hair/shoulder meshes → complete surface at every tier | `portrait.ts` groups points by mesh; About uses prefix draw range | Interleave area-weighted samples; test independent meshes and low-tier prefixes |
| A03 / P1 | Future GLB framing assumes placeholder dimensions → model-compatible camera/disc | Hardcoded head width/ring and disc Y in `AboutScene.ts` | Measure upper-head bounds; carry shoulder/head metadata through loader; geometry tests |
| A04 / P1 | Vortex below shoulders and diffuse → broad shoulder disc in reference frames | `headY - 1.0`, radius up to 15.85, thin near density | Shoulder-relative height, coherent smaller layered orbit, depth fade; compare projected bounds; rendered QA pending |
| A05 / P1 | Adjacent panels retain bright white scan → transient reveal then readable surface | Neighbours remain at reveal 0.3; shader scan intensity never settles | Decay scan when reveal stops; stronger scan only on advancing active panel; test lifecycle |
| W01 / P2 | Strong picture frames / sparse boxed grid → restrained frames, depth lattice | Constant bright rim; only floor/ceiling/side grids in `WorkScene.ts` | Reduce rest rim, retain hover; add faint depth cross-sections using existing shader; rendering pending |
| W02 / P1 | Optional video can replace cover with black; hover includes empty halo → robust media/selection | Immediate VideoTexture selection, raycast against padded plane | Keep cover until playable; restrict hit to image rect; source/tests |
| C03 / P2 | Fibre has a small discontinuity at the column bend → continuous strands | Column wobble does not vanish at joint in `ContactScene.ts` | Taper wobble and keep existing curve; mathematical continuity check |
| G01 / P1 | Project backdrop can drift while dialog open; reduced-motion toggle retains fluid → stable interaction | Scroll lock blocks input but not update; fluid only created at boot | Freeze scroll while locked, save route positions, react to preference changes; regression tests |
| G02 / P2 | Hidden tab stops rAF but can leave video playing → pause offscreen media | App pause does not notify Work video lifecycle | Suspend video playback on pause; source and lifecycle tests |

Large visual changes beyond these evidenced defects are deferred until fresh rendered comparison is possible. The already refined camera spline, palette, content, project order and compositor are retained.

## Implemented changes and changed files

The following describes **code changes**, not a claim that the resulting frames have been visually approved.

| Files changed in this pass | Result and purpose |
| --- | --- |
| `src/scenes/home/fluid.ts`, `src/scenes/home/stroke.ts` (new) | Full elapsed time is consumed by at most three solver substeps. Dye/velocity decay is exponential; pressure warm-start decay follows dt. New targets are explicitly zeroed. Splat energy is time-normalized and fast pointer segments receive intermediate deposits. Force is adjusted to simulation resolution. Original GPU solver and its tier-dependent pressure iteration counts remain. |
| `src/scenes/home/HomeScene.ts`, `src/input/input.ts` | Integrate continuous strokes; normalize the intro/touch wisp's energy; avoid artificial jumps on pointer re-entry; rebuild/disable fluid when reduced-motion changes. Home's large dolly is held still in reduced-motion mode. |
| `src/scenes/home/wordmark.ts` | Cap hot illumination, retain a softened letter mask even when lit, apply depth absorption to extruded layers, and reduce the sharp cyan rim. The fluid still drives the letter shader, haze, rays and particle velocity. ASIMANGKAN, BORO and the existing subtitle remain. |
| `src/scenes/about/surface.ts` (new), `src/scenes/about/portrait.ts` | Interleave surface-area-weighted samples across world-transformed meshes; bake current skin/morph poses; reject non-finite/degenerate geometry; normalize the bust and expose head/shoulder metadata. Dispose the original model after sampling. GLB → photo → labelled abstract fallback priority remains. |
| `src/scenes/about/AboutScene.ts` | Move the vortex from `headY - 1.0` to the shoulder; concentrate its existing particles in a broad layered disc; add distance fading and sparse orbiting glints. Tone down saturated portrait rims and back-facing particles. Scale GLB panels/camera framing from head size, defer panel entry until after the frontal reveal, and reuse panel eligibility buffers. Existing normal-motion spline is retained. Reduced-motion uses a fixed frontal composition with selectable sequential panels. |
| `src/scenes/shared/panel3d.ts` | The scan fades as reveal stops; secondary panels no longer hold an animated white bar forever. Body-line staggering is normalized so the final line finishes at reveal 1. The existing curved geometry, chamfer, frost and line wipe remain. |
| `src/scenes/work/WorkScene.ts` | Reduce constant image borders; add faint depth cross-sections through the existing dotted corridor; fade ghost imagery/HUD with the corridor exit. Keep cover art visible until optional video is playable, retain it on failure/autoplay refusal, and preserve video aspect ratio. Raycasting excludes transparent halo margins. Hidden media pauses. Reduced motion uses stationary project views and disables autoplay/glitch. |
| `src/scenes/contact/ContactScene.ts` | Taper column wobble to zero value/slope at the fibre bend, preserving continuity of travelling points. Reduce banner fill opacity. Keep existing fibre geometry, glints and curved banner; reduced motion skips the long approach. |
| `src/content/contact.ts`, `src/ui/shell.ts`, `src/ui/fallback.ts`, `src/styles/main.css` | Complete the user's four-icon update. Both views share LinkedIn → Instagram → WhatsApp → Email. Missing development methods are non-navigating, dimmed, dashed, and `aria-disabled`; working destinations remain anchors. Validate profile paths, international numbers and email addresses. Align symbol sizes; disabled entries do not react as active links. Existing symmetrical four-slot CSS arc and 44px minimum targets are retained. |
| `src/scroll/scroll.ts`, `src/router/router.ts`, `src/app/App.ts` | Freeze virtual scrolling while a project is open; integrate touch inertia analytically; persist per-history-entry positions; save current positions before navigation; pause Work media when the tab hides; apply reduced-motion changes without reloading. |
| `src/dev/inspection.ts` (new), `src/main.ts`, `src/app/App.ts` | Opt-in `?inspect=1` controls: choose scene/progress, hold shader time, capture the canvas, inspect frame-interval median/p95. The inspector uses the existing animation loop and cleans up on teardown/fallback. Its module, controls and `__app` hook are absent from production output. |
| `vite.config.ts`, `package.json` | Add `npm test` and `npm run build:release`. Standard build warns about incomplete contact details; release mode rejects them before bundling. No new packages. |
| `tests/register.mjs`, `tests/contact.test.mjs`, `tests/motion.test.mjs`, `tests/portrait.test.mjs` (new) | Node regression harness using the installed Three.js runtime; test fixture data stays out of public assets and personal configuration. Requires a current Node version with `registerHooks`/TypeScript stripping (verified on Node 26.5.0). |
| `README.md`, `public/assets/portrait/README.md`, `docs/REFINEMENT_REPORT.md`, this report | Correct contact/setup instructions, describe portrait limitations and visual review, label the older report as historical. |

`src/content/site.config.ts` and `src/ui/icons.ts` already differed from HEAD when the task began. Their user-authored contents were retained unchanged during this pass. The working-tree diff includes them. The pre-existing `contact.ts` and `shell.ts` edits were completed incrementally, not replaced.

## Verification actually performed

| Check | Result / scope |
| --- | --- |
| Baseline `npm run typecheck` | Failed: missing contact imports/types and obsolete fallback helper; captured before edits. |
| Final `npm test` | **20 passed, 0 failed.** Includes 30/60/144 Hz pointer-energy and scroll checks, solver elapsed-time dispatch in all three modes, renderer-state restoration, parked panel-scan decay, history position restoration, route parsing, contact validation, multi-mesh quality prefixes, transformed surface area, morphs, skinning, and actual `GLTFLoader.parseAsync` on a synthetic in-memory GLB. |
| `npm run build` | **Passed**, including strict TypeScript. Expected warning: all four contact destinations remain unset. |
| `npm run build:release` | **Correctly refused** the current configuration, listing LinkedIn, Instagram, WhatsApp and Email. No deployment attempted. |
| Existing dev server | `http://localhost:5173/` returned 200 with the portfolio HTML; `/about/`, `/work/tender-ai/`, `/contact/` and new source/inspection modules returned 200. Existing server was preserved. A temporary duplicate on 5174 was stopped. |
| Production preview HTTP checks | 200 with the built entry script for `/`, `/about`, `/about/`, `/work/`, all four project routes, `/contact/`. This verifies SPA serving, **not browser execution**. Temporary preview server was closed. |
| Build inspection | Inspector UI strings and `__app` absent from built JS; `dist/404.html` equals `dist/index.html`. |
| `git diff --check` | Passed. No destructive Git operations, dependency changes, scene deletion, or public asset substitution. |
| Fresh browser/GPU/mobile checks | **Not performed.** Browser access host unavailable; native browser inspection had previously been stopped because its current URL could not be reliably identified. No fresh screenshots/recordings, shader compile results, real FPS measurements, touch tests or screen-reader tests are claimed. |

The fluid tests verify CPU orchestration and elapsed time, **not numerical results on a GPU**. Portrait tests verify the loading/sampling path with synthetic geometry, **not the user's likeness**. Reduced-motion composition, WebGL fallback rendering, hover, media autoplay and actual browser history still require fresh browser checks.

## Visual comparison matrix and next verification states

Use the same viewport (start with 1440×900 desktop and 390×844/360×740 mobile), quality tier and shader time. The existing page keeps the same particle distribution; a reload randomizes it. `progress` below is **scene-local**, not a video timestamp. Positions are starting points for matching composition, not assertions of exact reference alignment.

| State | Reference evidence | Local review state / checks |
| --- | --- | --- |
| Home idle, lit, wake | `reference/comparisons/home_ref.png` | `?inspect=1&scene=home&progress=0&time=6`; unfreeze for slow/fast horizontal, diagonal, circle, reversal, stop and exit; capture immediate/1s/2s idle. Check atmospheric edges and wake timing. |
| Home → About | `reference/comparisons/contact_trans_ref.png`, bottom left | Home progress ≈0.85; compare outgoing letters, haze, incoming head and transient chromatic separation. |
| Frontal portrait + shoulder disc | `reference/comparisons/about_ref.png`, top left | About progress 0.08–0.12; check silhouette width, face clearance and disc height. |
| Three-quarter, side/back, near-profile | Other frames in `about_ref.png` and individual `reference/frames/` | About progress 0.25, 0.5, 0.72, 0.88; match camera composition before judging. Actual facial-profile fidelity awaits GLB. |
| Panel entry/scan/settled text | `about_ref.png` | About progress around a panel dwell, shader time unfrozen. Confirm one active panel, transient scan, all lines visible and no clipping. |
| About → Work | Existing transition contact sheets | About progress ≈0.949; verify figure/scan fade before the corridor becomes dominant. |
| Project approach, intermediate travel, last project | `reference/comparisons/work_ref.png` | Work progress 0.179, 0.393, 0.607, 0.821 for the four dwell positions; move between these for actual velocity effects. Check reduced borders, lattice depth, distant blue tint and passing planes. |
| Work motion settles | `work_ref.png` | Fast forward/reverse wheel, then stop. No lasting RGB split. Test halo vs image clicks, details, switch, close, Back/Forward. |
| Work → Contact | `contact_trans_ref.png`, first row | Work progress ≈0.955; check HUD/ghosts disappear with the grid. |
| Contact fibres/banner/icons | `contact_trans_ref.png`, top right | Contact progress 1; inspect continuous fibre bends, moving glints, banner translucency, four centred disabled development icons, then test real links when configured. |

Existing baseline implementation screenshots: `docs/evidence/02_after_matched_states.jpg` and `05_home_lit_fade_rest.jpg`. There is **no new “after” capture** for this pass. Aligned overlays and an updated journey recording remain outstanding; reusing the old images as new evidence would be misleading.

## Remaining limitations and exact inputs needed

- **Missing personal asset:** `public/assets/portrait/portrait.glb`, an upright head/hair/neck/shoulders bust facing +Z. Supply the real model or suitable reconstruction inputs. Current placeholder remains labelled and is not a likeness. A photo + depth map is only a 2.5D fallback. The GLB must currently use uncompressed geometry; Draco/Meshopt/KTX2 decoders have not been added without an actual asset requiring them.
- **Missing project media:** authentic `cover.jpg`/`.png`/`.webp` in each of `public/assets/projects/jecverse/`, `plugora/`, `m-phish/`, `tender-ai/`; optional `preview.mp4` or `.webm` in each folder. Existing conceptual covers stay explicitly labelled. No fabricated screenshots.
- **Missing contact data:** real LinkedIn profile URL, Instagram profile URL, WhatsApp international number and email address in `src/content/site.config.ts`. All are currently `null`. Syntax checks do not prove ownership or successful delivery; verify before release.
- **Unavailable requested reference files in this checkout:** `IMG_1303.mp4`, `20261121-2032-47.3822350.mp4`, `20261121-1939-18.4802227.mp4`, `PORTFOLIO PROMPT.pdf`. Existing extracted reference frames were inspected instead. No claim of inspecting those missing files.
- **Unverified rendering:** all newly adjusted lighting, geometry, shader effects, reduced-motion compositions and mobile layouts need the fresh checks above. GPU performance impact of substeps and depth cross-sections must be measured. The existing adaptive tiers remain; there is no universal 60 FPS claim.
- **Approximation retained:** the wordmark uses a ray-marched mask slab, not a solid text mesh; project imagery differs until actual media arrives; head dimensions/shoulder height are estimated from an upright bust and need final calibration with the real model. The contact arc remains the existing DOM/CSS-3D overlay anchored to the WebGL scene.

This is a tested source/build refinement with explicit visual-QA and asset blockers, **not final acceptance of the full fidelity brief**.
