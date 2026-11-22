# Portrait (About scene)

Drop ONE of these files here — no code changes needed (the dev server reloads automatically):

| Priority | File | Result |
| --- | --- | --- |
| 1 | `portrait.glb` (or `portrait.gltf`) | 3D surface sampled into ~150k points. Full camera orbit. Export a head-and-shoulders bust, facing +Z, Y up. Any scale. |
| 2 | `portrait.jpg` / `.png` / `.webp` (+ optional `portrait-depth.png`) | Photo turned into a **2.5D** point cloud (depth map, or luminance if no depth map). The camera stays within ~±35° so the flatness never shows. |
| 3 | nothing | Abstract particle sculpture — a **temporary placeholder**, deliberately featureless. |

Photo tips: head-and-shoulders crop, plain dark or light background (or a PNG with
transparency), face roughly in the upper third, at least 800px tall.
Depth map: same size as the photo, white = near, black = far (e.g. from Depth Anything).

The GLB pipeline samples **world-space surface area across every mesh**, interleaving
head, hair and shoulder samples so adaptive quality does not remove separate meshes.
Current skin and morph poses are baked for sampling. Empty/degenerate models are rejected
and the existing photo/abstract fallback is retained. The loaded model's GPU resources
are released once its particle arrays are built.

Export an upright, centred **bust**, not a full-body scene with a floor or props. Avoid
Draco, Meshopt or KTX2 compression for now: this project does not bundle those decoders.
Use ordinary GLB geometry and embedded PNG/JPEG textures. Height is normalized to 2.5
world units; head radius is estimated from the upper part and shoulder height from bust
proportions. Final framing must be checked with the actual model in the scene inspector.

A photo fallback remains 2.5D and is never described as a full reconstruction. The
abstract fallback is deliberately featureless and is never a claimed likeness.
