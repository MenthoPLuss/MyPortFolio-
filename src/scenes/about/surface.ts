import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

/** World-space surface samples, interleaved across meshes so every quality prefix is complete. */
export function sampleSurface(root: THREE.Object3D, count: number, random: () => number = Math.random): {
  positions: Float32Array; normals: Float32Array; bounds: THREE.Box3;
} {
  if (!Number.isInteger(count) || count < 1) throw new Error('Portrait sample count must be positive');
  root.updateMatrixWorld(true);
  const parts: { geometry: THREE.BufferGeometry; sampler: MeshSurfaceSampler; end: number }[] = [];
  const bounds = new THREE.Box3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const triangle = new THREE.Triangle(a, b, c);
  let total = 0;
  try {
    root.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
      const geometry = mesh.geometry.clone();
      const skin = mesh as THREE.SkinnedMesh;
      if (skin.isSkinnedMesh || mesh.morphTargetInfluences?.some((value) => value !== 0)) {
        if (skin.isSkinnedMesh) skin.skeleton.update();
        const vertices = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < vertices.length / 3; i++) {
          mesh.getVertexPosition(i, a).applyMatrix4(mesh.matrixWorld).toArray(vertices, i * 3);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
      } else {
        geometry.applyMatrix4(mesh.matrixWorld);
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      }
      const pos = geometry.getAttribute('position');
      const index = geometry.index;
      let area = 0;
      for (let i = 0; i + 2 < (index?.count ?? pos.count); i += 3) {
        a.fromBufferAttribute(pos, index ? index.getX(i) : i);
        b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1);
        c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2);
        const value = triangle.getArea();
        if (!Number.isFinite(value)) { geometry.dispose(); throw new Error('Portrait contains non-finite geometry'); }
        area += value;
      }
      if (area <= 1e-12) { geometry.dispose(); return; }
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!);
      total += area;
      // The pinned runtime exposes this method; @types/three 0.187 omits it.
      const sampler = new MeshSurfaceSampler(new THREE.Mesh(geometry)) as MeshSurfaceSampler & {
        setRandomGenerator(generator: () => number): MeshSurfaceSampler;
      };
      // Use the same random stream for mesh selection and within-triangle sampling.
      sampler.setRandomGenerator(random).build();
      parts.push({ geometry, sampler, end: total });
    });
    if (!parts.length || bounds.max.y - bounds.min.y < 1e-6) throw new Error('Portrait has no non-degenerate bust surface');
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const choice = random() * total;
      let lo = 0, hi = parts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (choice < parts[mid].end) hi = mid;
        else lo = mid + 1;
      }
      parts[lo].sampler.sample(a, b);
      a.toArray(positions, i * 3);
      b.normalize().toArray(normals, i * 3);
    }
    return { positions, normals, bounds };
  } finally {
    for (const part of parts) part.geometry.dispose();
  }
}

/** Keep dimensions independent of random samples and quality. Input should be an upright bust facing +Z. */
export function normalizeBust(positions: Float32Array, box: THREE.Box3): {
  headY: number; headR: number; shoulderY: number;
} {
  const scale = 2.5 / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  let left = Infinity, right = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * scale;
    positions[i + 1] = (positions[i + 1] - box.max.y) * scale + 2.75;
    positions[i + 2] = (positions[i + 2] - cz) * scale;
    if (positions[i + 1] > 2.0 && positions[i + 1] < 2.65) {
      left = Math.min(left, positions[i]);
      right = Math.max(right, positions[i]);
    }
  }
  // An anatomical estimate for a head-and-shoulders scan, not facial reconstruction.
  const headR = THREE.MathUtils.clamp(Number.isFinite(right - left) ? (right - left) / 2 : 0.4, 0.25, 0.65);
  return { headY: 2.2, headR, shoulderY: 1.4 };
}
