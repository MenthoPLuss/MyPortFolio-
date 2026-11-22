import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sampleSurface, normalizeBust } from '../src/scenes/about/surface.ts';

function seeded(seed = 42) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function mesh(width, x) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, width, 0, 0, 0, 1, 0], 3));
  const result = new THREE.Mesh(geometry);
  result.position.x = x;
  return result;
}

test('all quality prefixes retain independently modelled head/hair/shoulder meshes', () => {
  const group = new THREE.Group();
  group.add(mesh(1, 0), mesh(3, 10));
  const result = sampleSurface(group, 150_000, seeded());
  for (const count of [150_000, 60_000, 20_000]) {
    let second = 0;
    for (let i = 0; i < count; i++) if (result.positions[i * 3] >= 10) second++;
    assert.ok(Math.abs(second / count - 0.75) < 0.015, `area fraction at ${count}: ${second / count}`);
  }
  assert.deepEqual(result.bounds.min.toArray(), [0, 0, 0]);
  assert.deepEqual(result.bounds.max.toArray(), [13, 1, 0]);
  assert.equal(result.normals[2], 1);
});
test('world transform area, not untransformed mesh size, controls sampling', () => {
  const group = new THREE.Group();
  const large = mesh(1, 10);
  large.scale.set(4, 1, 1);
  group.add(mesh(1, 0), large);
  const result = sampleSurface(group, 20_000, seeded());
  let second = 0;
  for (let i = 0; i < result.positions.length; i += 3) if (result.positions[i] > 9) second++;
  assert.ok(Math.abs(second / 20_000 - 0.8) < 0.015);
});
test('normalization preserves a 2.5-unit upright bust and valid shoulder metadata', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-2, -4, -1), new THREE.Vector3(2, 6, 1));
  const positions = new Float32Array([-2, -4, -1, 2, 6, 1, 1, 4, 0, -1, 4, 0]);
  const size = normalizeBust(positions, bounds);
  assert.equal(positions[1], 0.25);
  assert.equal(positions[4], 2.75);
  assert.ok(size.shoulderY < size.headY && size.shoulderY > 0.25);
  assert.ok(size.headR > 0 && size.headR < 1);
});
test('empty, non-finite, and zero-area models fail instead of poisoning GPU attributes', () => {
  assert.throws(() => sampleSurface(new THREE.Group(), 10), /surface/);
  assert.throws(() => sampleSurface(mesh(0, 0), 10), /surface/);
  assert.throws(() => sampleSurface(mesh(NaN, 0), 10), /non-finite/);
});
test('morph targets are baked before sampling without modifying the original geometry', () => {
  const part = mesh(1, 0);
  part.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 2, 1, 0, 2, 0, 1, 2], 3)];
  part.updateMorphTargets();
  part.morphTargetInfluences[0] = 0.5;
  const result = sampleSurface(part, 100, seeded());
  assert.equal(result.positions[2], 1);
  assert.equal(part.geometry.attributes.position.getZ(0), 0);
});
test('skinned geometry is sampled in its current pose', () => {
  const source = mesh(1, 0).geometry;
  source.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
  source.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const part = new THREE.SkinnedMesh(source);
  const bone = new THREE.Bone();
  part.add(bone);
  part.bind(new THREE.Skeleton([bone]));
  bone.position.z = 2;
  const result = sampleSurface(part, 100, seeded());
  assert.equal(result.positions[2], 2);
  assert.equal(source.attributes.position.getZ(0), 0);
});
test('a real GLTFLoader parses an in-memory GLB and feeds the surface pipeline', async () => {
  const data = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }], nodes: [{ mesh: 0 }, { mesh: 0, translation: [3, 0, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: data.byteLength }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: data.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] });
  const bytes = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4));
  const buffer = new ArrayBuffer(12 + 8 + bytes.length + 8 + data.byteLength);
  const view = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, bytes.length, 0x4e4f534a].forEach((v, i) => view.setUint32(i * 4, v, true));
  new Uint8Array(buffer, 20, bytes.length).set(bytes);
  view.setUint32(20 + bytes.length, data.byteLength, true);
  view.setUint32(24 + bytes.length, 0x004e4942, true);
  new Uint8Array(buffer, 28 + bytes.length).set(new Uint8Array(data.buffer));
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const result = sampleSurface(gltf.scene, 1000, seeded());
  assert.equal(result.bounds.max.x, 4);
  assert.ok(result.positions.some(v => v > 3));
});
