# Reference-fidelity refinement report

> Historical report from the preceding pass. Current changes, test results and browser-verification limits are recorded in [MASTER_REFINEMENT_AUDIT.md](MASTER_REFINEMENT_AUDIT.md).

**Branch:** `refine/reference-fidelity`. **Baseline:** commit `4209047` on `main` (restore it with `git checkout main`).

## Reference material

| Requested | Status |
| --- | --- |
| `IMG_1303.mp4` (reference recording) | **Not found** anywhere on this machine (searched the user profile and drives D:/E:). |
| `20261121-1939-18.4802227.mp4` (current-build recording) | **Not found** under that name. |
| `Videos/Screen Recordings/Screen Recording 2026-11-22 011115.mp4` | Found. It is a **112 s, 1888×1064 direct screen capture of sztanki.com** covering the whole journey (Home 0–16 s, About 16–39 s, Work 39–93 s, Contact 93–112 s). It is not a recording of this build. Used as the primary visual target. Frames were extracted at 2 fps to `reference/frames/` (git-ignored). |
| `PORTFOLIO PROMPT.pdf` | Not on disk. The spec text from the conversation was used. |

Because the capture is a direct screen recording (not filmed off a monitor), its colours were trusted for
*relative* comparisons (contrast, which areas are lit), while the brief's hex palette stays the base.

---

## A. Audit of the existing implementation (before refinement)

**Genuinely implemented: no substitutes found.** There are no iframes, embedded sites, pre-recorded videos, image sequences,
screenshot backgrounds or hotlinked reference assets. Every scene is real-time three.js/GLSL:

| System | Where | Finding |
| --- | --- | --- |
| Renderer / loop / compositor | `src/app/App.ts`, `src/transitions/compositor.ts` | WebGL2, one rAF loop, per-scene render targets, transition shader with `sin(πt)` envelope. Kept. |
| Scroll / input / router | `src/scroll`, `src/input`, `src/router` | Damped virtual scroll + inertia, deltaMode normalisation, History API. Kept unchanged. |
| GPU fluid | `src/scenes/home/fluid.ts` | Full stable fluids: splat → curl → vorticity confinement → divergence → 20 Jacobi pressure iterations → gradient subtract → advection, half-float ping-pong. Kept unchanged. |
| Volumetric wordmark | `src/scenes/home/wordmark.ts` | "ASIMANGKAN" is in the shader mask (no HTML overlay on desktop). It ray-marches a slab of stacked mask layers. **The lighting model differed from the reference** (see H1–H5). |
| Portrait | `src/scenes/about/portrait.ts` | GLB → surface samples, photo (+depth) → 2.5D cloud, else placeholder. **Placeholder in use** (no portrait asset). |
| Panels | `src/scenes/shared/panel3d.ts` | Real bent 3D geometry, SDF chamfer, staged reveal (border → liquid bar → title → lines). Kept; sizing changed. |
| Work / Contact | `src/scenes/work`, `src/scenes/contact` | Real corridor shader, velocity glitch, GPU fibres. Composition and scale differed. |
| Placeholders | — | Abstract portrait, procedurally generated project covers (labelled), contact links all `null`. |

## Discrepancy report

Severity: **P0** signature effect missing or wrong · **P1** composition / choreography wrong · **P2** noticeable · **P3** polish.
Verification: matched screenshots of this build (headless Edge, 1440×900) against frames of the reference capture.

| ID | Reference | Before | Probable cause | Files | Correction | Sev. | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | Lit letters are solid and evenly lit, in a muted violet-blue | Cyan-white letters with swirly texture inside the glyphs | Lighting sampled the raw dye, which carries vortex detail | `wordmark.ts` | Light the glyphs with a 9-tap smoothed dye field; violet-blue lit colour; capped highlights | P1 | ✅ fixed |
| H2 | Soft rays fan **down/outward** from the lit letters | Faint mask-space blur, rays barely visible | Ray source was the mask, not the *lit* letters | `wordmark.ts`, `HomeScene.ts` | Screen-space god rays: march toward the light, emission = mask × dye; light placed slightly above/behind; fade before the plane edges | P1 | ✅ fixed |
| H3 | Unlit wordmark is out of focus in the fog | Unlit letters crisp, just dim | Used the sharp mask everywhere | `wordmark.ts` | Blend blurred→sharp mask by local light | P2 | ✅ fixed |
| H4 | No smoke in the background, only a halo near the light | Dye "smoke cloud" visible in the haze | Haze shader added the dye directly | `HomeScene.ts` | Faint wisps + soft activity-driven halo | P2 | ✅ fixed |
| H5 | With a mouse, letters fall back into the fog when you stop | An autonomous wisp kept relighting letters after 2.5 s idle | Idle-wander rule | `HomeScene.ts` | Wisp only before the first pointer move, or on touch | P2 | ✅ fixed |
| H6 | Darker haze; very faint subtitle; soft horizontal haze band | Brighter haze; hard horizontal streak lines | Haze levels; high-frequency streak noise | `HomeScene.ts`, `wordmark.ts` | Lower haze, low-frequency streak modulation, subtitle 0.36→0.2 | P3 | ✅ fixed |
| A1 | Opens on a **close, frontal** head (~22% of the width), no panels; panels ~17% wide, hugging the head | Small far bust; panels 28% wide covering the face | Camera distance was derived from the panel size | `AboutScene.ts` | Distance from head size; panel width 0.46 on a 0.62 ring; panel ≈19% | P1 | ✅ fixed |
| A2 | Camera goes around to the **back** of the head, pushes into a near-profile close-up, then the head exits right | Started far away; ended by sliding right with the figure still central | Spline control points | `AboutScene.ts` | New 17-point spline: frontal → ~260° orbit → near-profile push-in → pan (head exits right); dwell slightly before each panel so the head sits right of it | P1 | ✅ fixed |
| A3 | Face filled with points; hair/edges brightest | Placeholder read as a hollow glowing shell | View-dependent rim dominated the surface-only points | `AboutScene.ts` | Fixed key light (also benefits a real GLB) | P2 | ✅ fixed |
| A4 | Transparent panels; teal cast on the right | Opaque fill; no teal | Panel fill, haze colour | `AboutScene.ts`, `panel3d.ts` | Fill 0.62→0.46, larger body text, moderate teal | P2 | ✅ fixed |
| A5 | Recognisable personal 3D portrait | Abstract placeholder | **Missing asset** | — | Pipeline is ready (file drop). Placeholder now captioned "not a likeness" | P0 | ⛔ blocked on asset |
| W1 | Projects at rest ≈25–30% of the width, floating at varied positions | ≈46% wide, on one axis | Dwell distance, layout | `WorkScene.ts` | Frac 0.46→0.28; x/y offsets with 60% camera follow | P2 | ✅ fixed |
| W2 | Large soft bloom halo; horizontal smears out of the image edges while moving | Thin edge glow only | Margin and bloom shape | `WorkScene.ts` | Margin 0.14→0.3, wider halo, velocity smears from edge colours | P2 | ✅ fixed |
| W3 | A lattice of dotted lines filling the frame, dense ghost collages | A corridor box of dotted planes | Different environment geometry | `WorkScene.ts` | Not changed (the corridor already reads correctly in motion) | P3 | ◻︎ open |
| C1 | Column of **dotted** streams ≈15% of the frame wide; root-like flare; fan toward the viewer | Bright continuous lines, sharp bend, even fan | Lines dominated; small bend radius | `ContactScene.ts` | Dotted flowing points with faint line guides, wider column, bend radius 1–4.2, fan biased to +z | P1 | ✅ fixed |
| C2 | Small, strongly curved banner; higher camera | Large, slightly curved banner | Framing | `ContactScene.ts` | Banner ≈25% wide (slightly larger than the reference for readability), bend −1.9, camera raised | P2 | ✅ fixed |
| T1 | Each scene **empties into haze** before the next appears | The head and the full-screen last project were still prominent at the hand-off midpoint | Exit animations finished after the overlap started | `AboutScene.ts`, `WorkScene.ts` | Figure/last-project fades end before the midpoint | P1 | ✅ fixed |
| M1 | — | Phone wordmark edges touched the sides; About panel off-centre | Blurred edges, parallax offset | `HomeScene.ts`, `AboutScene.ts` | 84% width; no parallax offset on phones | P3 | ✅ fixed |

---

## B. Files changed (all on `refine/reference-fidelity`)

| File | Change |
| --- | --- |
| `src/scenes/home/wordmark.ts` | New lighting model (smoothed dye, blurred→sharp letters, violet-blue palette), screen-space god rays, softer streaks, subtler subtitle |
| `src/scenes/home/HomeScene.ts` | Light tracking in screen space, screen→mask transform, activity halo, idle-wisp rule, darker haze, phone margin |
| `src/scenes/about/AboutScene.ts` | Head-based framing, tight panel ring, new camera spline (orbit → profile → exit), key light, teal haze, earlier dissolve, one-panel-at-a-time thresholds |
| `src/scenes/shared/panel3d.ts` | Larger body text |
| `src/scenes/work/WorkScene.ts` | Smaller dwell scale, varied placement, bloom halo, edge smears, earlier end fade |
| `src/scenes/contact/ContactScene.ts` | Dotted fibre streams, column width, root flare, viewer-biased fan, banner size/curvature, camera height |
| `src/content/site.config.ts`, `src/ui/shell.ts`, `src/app/App.ts`, `src/styles/main.css` | Configurable placeholder-portrait caption (`about.placeholderNotice`), shown only in placeholder mode |
| `.gitattributes`, `.gitignore` | LF line endings; reference frames and comparisons kept out of git |

## C. Fidelity assessment (qualitative; no invented percentages)

| Area | Assessment |
| --- | --- |
| Home / cursor illumination | Close. Solid lit letters, downward light rays, blurred unlit word, wake fades in ~1–2 s. Lit letters remain a touch brighter than the capture. |
| Fluid simulation | Unchanged; genuine GPU stable fluids. It now drives a smoothed illumination field, so the curl shapes the wake and rays rather than painting texture. |
| Particle portrait | Pipeline complete; **likeness impossible without your asset**. The placeholder is honest and labelled. |
| About choreography | Composition sequence matches the capture (close front → orbit → back → near-profile → exit right). Exact angles differ because a real head's shape changes what reads as "profile". |
| Panels | Size, placement, transparency and staged reveal match closely. |
| Work corridor | Scale, placement, halo and velocity effects match. The environment lattice (W3) and the rich collage imagery differ. |
| Transitions | Dissolve through haze with swirl/RGB fringe at the midpoint, clean at rest. |
| Contact fibres | Dotted column, root flare and fan toward the viewer match well. The banner is a little larger than the reference, on purpose. |
| Colour / atmosphere | The palette stays as specified; haze and lit levels were tuned toward the capture. |
| Scroll physics / routing | Unchanged and re-verified. |
| Mobile | Re-verified at 390×844 and 360×740. |

## D. Remaining differences

1. **Portrait likeness** — missing asset (see E).
2. **Project imagery** — the reference uses rich photographic collages; this build uses labelled abstract covers until you supply screenshots.
3. **Work environment (W3)** — the reference's full-frame dotted lattice is approximated by a corridor (a design difference, not a missing feature).
4. **Contact details** — the reference column has faint horizontal ring structures at banner height (not implemented). The icon arc renders nothing until links are configured.
5. **Timing** — the capture's scroll speed is unknown, so scenes were matched by **composition at equivalent progress**, not by timestamps.
6. **Typeface** — Excon is used as specified. The reference wordmark uses a different bold sans.

## E. Assets required from you

1. **3D portrait:** `public/assets/portrait/portrait.glb`, a head-and-shoulders bust facing +Z.
   Suitable reconstruction inputs if you don't have a model: a phone photogrammetry/LiDAR scan
   (e.g. Polycam, RealityScan, KIRI Engine) of your head and shoulders, or 30–60 evenly lit photos taken around you.
   Second-best: `portrait.jpg` + `portrait-depth.png` (2.5D, limited orbit).
2. **Project screenshots** (`public/assets/projects/<slug>/cover.jpg` + more) and optional short videos (`preview.mp4`).
3. **Verified social links** for `site.config.ts → contact.links`.
4. **Resume**, if you want facts from it, copied into `reference/` (the copy on your Desktop was not opened).
5. Optional: the original `IMG_1303.mp4`, if it differs from the screen capture used here.

## F. Verification evidence

Commands run (all on this branch):

```
npx tsc --noEmit -p .             # clean after every change
npm run build                     # ✓ built; dist/_app/index-COOu7hBo.js
npx vite preview --port 4173      # fresh server; served bundle hash matches dist/
```

Runtime tests (headless Edge 158, ANGLE/D3D11 on an RTX 4050; console captured):

| Test | Result |
| --- | --- |
| Console errors across a full wheel journey (dev) | none (only intentional `info`/`warn` lines) |
| Wheel journey `/` → `/about/` → `/work/` → `/contact/` and back | URL and nav update in both directions |
| Frame time per scene (high tier, 1440×900) | median 16.7 ms, p95 ≤ 17.1 ms |
| Nav jump, Start the Journey, project open (click) → → switch → Esc → back | `/work/jecverse/` → `/work/plugora/` → `/work/` → `/about/`, positions restored |
| Direct loads on the production preview: `/`, `/about/`, `/work/`, `/work/m-phish/`, `/contact/` | all load; the deep link opens M-PHISH |
| Reduced motion, `?debug=no-webgl`, `?debug=fail-asset` → Retry | pass |
| Mobile 390×844 and 360×740 | no horizontal overflow; panel fits; wordmark within margins |

Images of this build (committed): `docs/evidence/01_before_matched_states.jpg`, `02_after_matched_states.jpg`,
`03_after_transitions_mid.jpg`, `04_after_mobile_390.jpg`, `05_home_lit_fade_rest.jpg`.

Side-by-sides with reference frames and a 26 s recording of the finished journey
(`reference/comparisons/after_journey_1280x720.mp4`) are **local only**: `reference/comparisons/` is git-ignored because it contains
frames of the reference site.

**Not tested:** real phones/tablets, real trackpads, screen readers, and a real portrait/screenshots (none exist yet).
