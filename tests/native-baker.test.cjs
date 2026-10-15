'use strict';

const assert = require('node:assert/strict');
require('../assets/vendor/three-runtime.js');
global.window = globalThis;
require('../assets/js/blockflow-baker.js');

const THREE = globalThis.BlockFlowThree?.THREE;
assert.ok(THREE, 'Three.js runtime must expose BlockFlowThree.THREE');
assert.ok(globalThis.BlockFlowBaker?.bakeLayer, 'BlockFlow native baker must be registered');

const atlas = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
  THREE.RGBAFormat
);
atlas.needsUpdate = true;

function makeFaceMaterials({ alphaTest = 0, transparent = false } = {}) {
  return Array.from({ length: 6 }, (_, face) => {
    const map = atlas.clone();
    map.repeat.set(0.25, 0.25);
    map.offset.set((face % 3) * 0.25, Math.floor(face / 3) * 0.5);
    map.needsUpdate = true;
    return new THREE.MeshBasicMaterial({
      map,
      color: 0xffffff,
      side: THREE.DoubleSide,
      alphaTest,
      transparent,
      depthWrite: !transparent
    });
  });
}

function makeBlock(x, y = 0, z = 0, name = 'minecraft:stone', options = {}) {
  return { x, y, z, layer: 0, name, mats: makeFaceMaterials(options) };
}

async function run() {
  const passed = [];
  const check = (condition, description) => {
    assert.ok(condition, description);
    passed.push(description);
  };
  const bake = (blocks, extra = {}) => BlockFlowBaker.bakeLayer({
    THREE,
    blocks,
    atlas,
    getMaterials: block => block.mats,
    isSpecialBlock: () => false,
    chunkSize: 32,
    ...extra
  });

  // Two adjacent opaque cubes should retain 10 outside faces, not 12.
  const pair = [makeBlock(0), makeBlock(1)];
  const pairGroup = await bake(pair);
  check(pairGroup.userData.bakeStats.cubeTriangles === 20,
    'adjacent opaque cubes cull the two shared triangles on each side');
  check(pairGroup.children.length === 1,
    'faces sharing atlas and render state are merged into one draw batch');

  // Six faces use different atlas transforms, even though they share one atlas.
  const uv = pairGroup.children[0].geometry.getAttribute('uv');
  const uvRegions = new Set();
  for (let i = 0; i < uv.count; i++) {
    uvRegions.add(`${Math.floor(uv.getX(i) * 4)}:${Math.floor(uv.getY(i) * 2)}`);
  }
  check(uvRegions.size >= 4, 'per-face atlas UV transforms survive geometry merging');

  // Cutout foliage has holes and must not be treated as a fully opaque wall.
  const cutoutGroup = await bake([
    makeBlock(0),
    makeBlock(1, 0, 0, 'minecraft:oak_leaves', { alphaTest: 0.08 })
  ]);
  check(cutoutGroup.userData.bakeStats.cubeTriangles === 22,
    'alpha-tested cutout material does not incorrectly occlude the solid neighbour');

  // Same transparent block types can cull their mutually hidden internal face.
  const glassGroup = await bake([
    makeBlock(0, 0, 0, 'minecraft:glass', { transparent: true }),
    makeBlock(1, 0, 0, 'minecraft:glass', { transparent: true })
  ]);
  check(glassGroup.userData.bakeStats.cubeTriangles === 20,
    'matching transparent blocks suppress their shared internal face');

  // A 10x10x10 opaque volume has 6 * 10 * 10 visible quads.
  const volume = [];
  for (let y = 0; y < 10; y++) {
    for (let z = 0; z < 10; z++) {
      for (let x = 0; x < 10; x++) volume.push(makeBlock(x, y, z));
    }
  }
  let lastProgress = null;
  const volumeGroup = await bake(volume, {
    onProgress: (done, total, stage) => { lastProgress = { done, total, stage }; }
  });
  check(volumeGroup.userData.bakeStats.blocks === 1000,
    'one thousand block volume is processed without dropping blocks');
  check(volumeGroup.userData.bakeStats.cubeTriangles === 1200,
    'solid 10x10x10 volume emits only its 600 outside quads');
  check(lastProgress?.done === 1000 && lastProgress?.total === 1000 && lastProgress?.stage === 'complete',
    'progress callback reports completion accurately');

  // Special models may have a single material despite BoxGeometry material groups.
  const specialBlock = { x: 3, y: 0, z: 0, layer: 0, name: 'minecraft:test_shape' };
  let sourceGeometryDisposed = false;
  let ownedTextureFound = false;
  const specialGroup = await BlockFlowBaker.bakeLayer({
    THREE,
    blocks: [specialBlock],
    atlas,
    getMaterials: () => makeFaceMaterials(),
    isSpecialBlock: () => true,
    createSpecialBlockGroup: block => {
      const root = new THREE.Group();
      root.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
      const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const originalDispose = geometry.dispose.bind(geometry);
      geometry.dispose = () => { sourceGeometryDisposed = true; originalDispose(); };
      const uniqueTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
      uniqueTexture.needsUpdate = true;
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: uniqueTexture }));
      mesh.position.x = 0.25;
      root.add(mesh);
      return root;
    },
    chunkSize: 32
  });
  check(specialGroup.userData.bakeStats.specialTriangles === 12,
    'stateful special geometry is transformed and compiled');
  check(sourceGeometryDisposed,
    'temporary special source geometry is released after compilation');
  ownedTextureFound = specialGroup.children.some(mesh =>
    mesh.material?.userData?.blockFlowOwnedMap instanceof THREE.Texture
  );
  check(ownedTextureFound,
    'non-atlas source textures are cloned and marked as baker-owned for disposal');

  // DrawRange must be respected when compiling external/special geometry.
  const drawRangeBlock = { x: 0, y: 0, z: 0, layer: 0, name: 'minecraft:draw_range_test' };
  const drawRangeGroup = await BlockFlowBaker.bakeLayer({
    THREE,
    blocks: [drawRangeBlock],
    atlas,
    getMaterials: () => makeFaceMaterials(),
    isSpecialBlock: () => true,
    createSpecialBlockGroup: () => {
      const root = new THREE.Group();
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.setDrawRange(0, 6);
      root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: atlas })));
      return root;
    },
    chunkSize: 32
  });
  check(drawRangeGroup.userData.bakeStats.specialTriangles === 2,
    'special geometry drawRange is preserved');

  const cancelled = await bake(pair, { isCancelled: () => true })
    .then(() => false, error => error?.name === 'AbortError');
  check(cancelled, 'superseded rebuilds stop with AbortError');

  console.log(passed.map((item, index) => `PASS ${index + 1}. ${item}`).join('\n'));
  console.log(`SUMMARY ${passed.length}/${passed.length} native baker checks passed`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
