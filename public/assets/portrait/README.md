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
