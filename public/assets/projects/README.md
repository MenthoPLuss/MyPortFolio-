# Project media (Work scene)

One folder per project slug (`jecverse`, `plugora`, `m-phish`, `tender-ai`).
Drop files in — they are detected automatically, no code changes:

- `cover.jpg|png|webp` — used on the 3D plane in the corridor (falls back to the
  first image in the folder). Without any image, an honest **generated abstract
  cover** is used and labelled as such in the detail view.
- any other images — shown as a gallery in the project detail view (sorted by name,
  so prefix them `01-...`, `02-...`).
- `preview.mp4` / `.webm` (optional) — plays muted + looped on the plane only while
  the project is near the camera, and in the detail view. Or set `video` in
  `src/content/site.config.ts`.

Only add real screenshots of the real project.
