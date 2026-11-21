import * as THREE from 'three';

let triangle: THREE.BufferGeometry | null = null;

/** One oversized triangle covering clip space (cheaper than a quad). */
export function fullscreenTriangle(): THREE.BufferGeometry {
  if (!triangle) {
    triangle = new THREE.BufferGeometry();
    triangle.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
  }
  return triangle;
}

/** Renders a material over the whole target. Material can be swapped per call. */
export class FullscreenPass {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mesh: THREE.Mesh;

  constructor(material?: THREE.Material) {
    this.mesh = new THREE.Mesh(fullscreenTriangle(), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget | null,
    material?: THREE.Material,
  ): void {
    if (material) this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
}

/** Background mesh rendered first inside a 3D scene (ignores the camera). */
export function backgroundMesh(material: THREE.ShaderMaterial): THREE.Mesh {
  material.depthTest = false;
  material.depthWrite = false;
  const m = new THREE.Mesh(fullscreenTriangle(), material);
  m.frustumCulled = false;
  m.renderOrder = -100;
  return m;
}

/** Dispose everything owned by an Object3D tree. Shared geometry is skipped. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && mesh.geometry !== triangle) mesh.geometry.dispose();
    const mats = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];
    for (const m of mats) {
      for (const v of Object.values(m)) {
        if (v instanceof THREE.Texture) v.dispose();
      }
      const sm = m as THREE.ShaderMaterial;
      if (sm.uniforms) {
        for (const u of Object.values(sm.uniforms)) {
          if (u.value instanceof THREE.Texture && !u.value.userData.shared) u.value.dispose();
        }
      }
      m.dispose();
    }
  });
}
