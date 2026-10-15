'use strict';

const assert = require('node:assert/strict');
require('../assets/vendor/three-runtime.js');
global.window = globalThis;

const fs = require('node:fs');
const vm = require('node:vm');
class InlineGeometryWorker {
  constructor() {
    this.listeners = {};
    const owner = this;
    this.context = {
      setTimeout, clearTimeout, Uint8Array, Uint16Array, Uint32Array, Float32Array,
      Map, Set, Math, Number, String, Array, Promise,
      self: { postMessage(data) { queueMicrotask(() => owner.onmessage?.({ data })); }, onmessage: null }
    };
    vm.createContext(this.context);
    vm.runInContext(fs.readFileSync(require.resolve('../assets/workers/geometry-baker.js'),'utf8'), this.context);
  }
  postMessage(data) { queueMicrotask(() => this.context.self.onmessage({ data })); }
  terminate() { this.terminated = true; }
}
global.BlockFlowWorkers = { create: id => { assert.equal(id, 'geometry'); return new InlineGeometryWorker(); } };
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
function allMeshes(group) { const result=[]; group.traverse(node=>{if(node.isMesh)result.push(node);}); return result; }

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
    chunkSize: 16,
    ...extra
  });

  // Two adjacent opaque cubes should retain 10 outside faces, not 12.
  const pair = [makeBlock(0), makeBlock(1)];
  const pairGroup = await bake(pair);
  check(pairGroup.userData.bakeStats.cubeTriangles === 20,
    'adjacent opaque cubes cull the two shared triangles on each side');
  check(pairGroup.children.length === 1,
    'two adjacent blocks in the same 16-cube region share one chunk');
  check(allMeshes(pairGroup).length === 1 && allMeshes(pairGroup)[0].geometry.index.count === 60,
    'geometry is indexed and uses four unique vertices per quad');

  // Six faces use different atlas transforms, even though they share one atlas.
  const uv = allMeshes(pairGroup)[0].geometry.getAttribute('uv');
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
    lodThreshold: 500, enableLOD: true,
    onProgress: (done, total, stage) => { lastProgress = { done, total, stage }; }
  });
  check(volumeGroup.userData.bakeStats.blocks === 1000,
    'one thousand block volume is processed without dropping blocks');
  check(volumeGroup.userData.bakeStats.cubeTriangles === 1200,
    'solid 10x10x10 volume emits only its 600 outside quads');
  const volumeChunk = volumeGroup.children[0];
  const volumeLod = volumeChunk?.children?.find(child => child.isLOD);
  check(volumeLod?.levels?.length === 4,
    'large chunks receive 1x, 2x, 4x and 8x distance LOD levels');
  const fullIndexCount = allMeshes(volumeLod.levels[0].object).reduce((n, mesh) => n + mesh.geometry.index.count, 0);
  const coarseIndexCount = allMeshes(volumeLod.levels[1].object).reduce((n, mesh) => n + mesh.geometry.index.count, 0);
  check(coarseIndexCount < fullIndexCount,
    'coarse voxel LOD reduces visible geometry index count');
  const materialLevels = volumeLod.levels.map(level => allMeshes(level.object)[0]?.material);
  check(materialLevels.every(material => material === materialLevels[0]),
    'chunk material instances are shared across LOD levels');
  check(allMeshes(volumeLod.levels[0].object)[0].geometry.boundingSphere.radius >= 16,
    'chunk-local conservative bounds avoid synchronous full-geometry sphere scans');
  check(lastProgress?.done === 8000 && lastProgress?.total === 8000 && lastProgress?.stage === 'complete',
    'progress callback reports completion accurately');

  const partialGroup = await bake([makeBlock(15), makeBlock(16)], {
    targetChunks: ['0,0,0'], enableLOD: false
  });
  check(partialGroup.children.length === 1 && partialGroup.children[0].name === 'Chunk_0_0_0',
    'partial rebuild returns only the selected chunk');
  check(allMeshes(partialGroup).reduce((n, mesh) => n + mesh.geometry.index.count, 0) === 30,
    'partial chunk receives neighbor context for cross-boundary face culling');

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
    chunkSize: 16
  });
  check(specialGroup.userData.bakeStats.specialTriangles === 12,
    'stateful special geometry is transformed and compiled');
  check(sourceGeometryDisposed,
    'temporary special source geometry is released after compilation');
  ownedTextureFound = allMeshes(specialGroup).some(mesh =>
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
    chunkSize: 16
  });
  check(drawRangeGroup.userData.bakeStats.specialTriangles === 2,
    'special geometry drawRange is preserved');

  const cancelled = await bake(pair, { isCancelled: () => true })
    .then(() => false, error => error?.name === 'AbortError');
  check(cancelled, 'superseded rebuilds stop with AbortError');

  const positiveBoundary = new Set(BlockFlowBaker.neighboringChunkKeys({ x: 15, y: 8, z: 8 }));
  check(positiveBoundary.has('0,0,0') && positiveBoundary.has('1,0,0') && positiveBoundary.size === 2,
    'editing a positive chunk boundary queues only the two face-adjacent chunks');
  const negativeBoundary = new Set(BlockFlowBaker.neighboringChunkKeys({ x: 0, y: 8, z: 8 }));
  check(negativeBoundary.has('-1,0,0') && negativeBoundary.has('0,0,0') && negativeBoundary.size === 2,
    'editing a zero boundary queues the negative neighbor without unrelated chunks');

  console.log(passed.map((item, index) => `PASS ${index + 1}. ${item}`).join('\n'));
  console.log(`SUMMARY ${passed.length}/${passed.length} native baker checks passed`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
