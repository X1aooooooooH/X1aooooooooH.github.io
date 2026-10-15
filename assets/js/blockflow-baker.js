/* BlockFlow native geometry baker.
 * Main thread: resolves BlockFlow materials and serializes special models.
 * Worker: face culling, indexed geometry, chunk partitioning and distance LOD.
 * No model-baking WASM or external pre-baked model registry is used.
 */
(function registerBlockFlowBaker(root) {
  'use strict';

  const CHUNK_SIZE = 16;
  let worker = null;
  let nextJobId = 1;
  const jobs = new Map();
  const cubeFaceTemplateCache = new WeakMap();

  function getTextureMatrix(texture) {
    if (!texture) return null;
    if (texture.matrixAutoUpdate && typeof texture.updateMatrix === 'function') texture.updateMatrix();
    const elements = texture.matrix?.elements;
    if (elements?.length === 9) return Array.from(elements);
    const sx = Number(texture.repeat?.x ?? 1), sy = Number(texture.repeat?.y ?? 1);
    const ox = Number(texture.offset?.x ?? 0), oy = Number(texture.offset?.y ?? 0);
    return [sx, 0, 0, 0, sy, 0, ox, oy, 1];
  }

  function imageIdFactory() {
    const ids = new WeakMap(); let next = 1;
    return image => {
      if (!image || (typeof image !== 'object' && typeof image !== 'function')) return 'none';
      let id = ids.get(image);
      if (!id) { id = next++; ids.set(image, id); }
      return id;
    };
  }
  const imageId = imageIdFactory();

  function bucketDescriptor(material, atlas, THREE) {
    const map = material.map || null;
    const sourceImage = map?.image || map?.source?.data || null;
    const isAtlas = !!(map && atlas && sourceImage && sourceImage === (atlas.image || atlas.source?.data));
    const mapKey = map ? (isAtlas ? 'atlas' : `image-${imageId(sourceImage || map)}`) : 'plain';
    const descriptor = {
      mapKey, map: isAtlas ? atlas : map,
      transparent: !!material.transparent,
      opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
      alphaTest: Number(material.alphaTest || 0),
      depthWrite: material.depthWrite !== false,
      depthTest: material.depthTest !== false,
      side: material.side ?? THREE.FrontSide,
      blending: material.blending ?? THREE.NormalBlending,
      toneMapped: material.toneMapped !== false,
      polygonOffset: !!material.polygonOffset,
      polygonOffsetFactor: Number(material.polygonOffsetFactor || 0),
      polygonOffsetUnits: Number(material.polygonOffsetUnits || 0),
      premultipliedAlpha: !!material.premultipliedAlpha,
      uvMatrix: getTextureMatrix(map)
    };
    descriptor.key = [descriptor.mapKey, descriptor.transparent ? 1 : 0,
      descriptor.opacity, descriptor.alphaTest, descriptor.depthWrite ? 1 : 0,
      descriptor.depthTest ? 1 : 0, descriptor.side, descriptor.blending,
      descriptor.toneMapped ? 1 : 0, descriptor.polygonOffset ? 1 : 0,
      descriptor.polygonOffsetFactor, descriptor.polygonOffsetUnits,
      descriptor.premultipliedAlpha ? 1 : 0].join('|');
    return descriptor;
  }

  function serializableFace(material, descriptor) {
    if (!material || !descriptor || material.visible === false || material.colorWrite === false || Number(material.opacity ?? 1) <= 0) return null;
    return {
      key: descriptor.key,
      uvMatrix: descriptor.uvMatrix,
      color: [material.color?.r ?? 1, material.color?.g ?? 1, material.color?.b ?? 1],
      visible: material.visible !== false,
      colorWrite: material.colorWrite !== false,
      transparent: !!material.transparent,
      opacity: Number(material.opacity ?? 1),
      alphaTest: Number(material.alphaTest || 0),
      depthWrite: material.depthWrite !== false
    };
  }

  function getMaterialArray(block, getMaterials, cache) {
    let value = cache.get(block);
    if (!value) { value = getMaterials(block) || []; cache.set(block, value); }
    return Array.isArray(value) ? value : [value];
  }

  function extractCubeFaces(THREE) {
    const cached = cubeFaceTemplateCache.get(THREE);
    if (cached) return cached;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const index = geometry.index;
    const groups = geometry.groups?.length ? geometry.groups : Array.from({ length: 6 }, (_, i) => ({ start: i * 6, count: 6, materialIndex: i }));
    const faces = groups.map(group => {
      const unique = [], map = new Map(), indices = [];
      for (let offset = group.start; offset < group.start + group.count; offset++) {
        const vertexIndex = index ? index.getX(offset) : offset;
        let localIndex = map.get(vertexIndex);
        if (localIndex === undefined) {
          localIndex = unique.length; map.set(vertexIndex, localIndex);
          unique.push({
            p: [position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex)],
            n: [normal.getX(vertexIndex), normal.getY(vertexIndex), normal.getZ(vertexIndex)],
            uv: [uv.getX(vertexIndex), uv.getY(vertexIndex)]
          });
        }
        indices.push(localIndex);
      }
      return { vertices: unique, indices };
    });
    geometry.dispose?.();
    cubeFaceTemplateCache.set(THREE, faces);
    return faces;
  }

  function transformSpecialTriangles(block, modelGroup, atlas, THREE, descriptorsByKey, specialTriangles) {
    modelGroup.updateMatrixWorld(true);
    modelGroup.traverse(node => {
      const geometry = node.geometry;
      if (!node.isMesh || !geometry || !node.material || node.visible === false) return;
      const position = geometry.getAttribute('position');
      if (!position) return;
      if (!geometry.getAttribute('normal') && typeof geometry.computeVertexNormals === 'function') geometry.computeVertexNormals();
      const normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv'), color = geometry.getAttribute('color');
      const index = geometry.index;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const total = index ? index.count : position.count;
      const groups = Array.isArray(node.material) && geometry.groups?.length ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
      const rangeStart = Math.max(0, geometry.drawRange?.start || 0);
      const rangeEnd = Number.isFinite(geometry.drawRange?.count) ? Math.min(total, rangeStart + geometry.drawRange.count) : total;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
      const me = node.matrixWorld.elements, ne = normalMatrix.elements;
      for (const group of groups) {
        const material = materials[group.materialIndex || 0];
        if (!material || material.visible === false || material.colorWrite === false || Number(material.opacity ?? 1) <= 0) continue;
        const descriptor = bucketDescriptor(material, atlas, THREE);
        descriptorsByKey.set(descriptor.key, descriptor);
        const start = Math.max(group.start || 0, rangeStart);
        const end = Math.min((group.start || 0) + group.count, rangeEnd);
        for (let offset = start; offset + 2 < end; offset += 3) {
          const vertices = [];
          for (let corner = 0; corner < 3; corner++) {
            const vi = index ? index.getX(offset + corner) : offset + corner;
            const px = position.getX(vi), py = position.getY(vi), pz = position.getZ(vi);
            const nx = normal ? normal.getX(vi) : 0, ny = normal ? normal.getY(vi) : 1, nz = normal ? normal.getZ(vi) : 0;
            const wx = me[0]*px + me[4]*py + me[8]*pz + me[12];
            const wy = me[1]*px + me[5]*py + me[9]*pz + me[13];
            const wz = me[2]*px + me[6]*py + me[10]*pz + me[14];
            let nnx = ne[0]*nx + ne[3]*ny + ne[6]*nz;
            let nny = ne[1]*nx + ne[4]*ny + ne[7]*nz;
            let nnz = ne[2]*nx + ne[5]*ny + ne[8]*nz;
            const nl = Math.hypot(nnx,nny,nnz) || 1; nnx/=nl; nny/=nl; nnz/=nl;
            vertices.push({
              p: [wx,wy,wz], n: [nnx,nny,nnz],
              uv: [uv ? uv.getX(vi) : 0, uv ? uv.getY(vi) : 0],
              c: [
                (material.color?.r ?? 1) * (color ? color.getX(vi) : 1),
                (material.color?.g ?? 1) * (color ? color.getY(vi) : 1),
                (material.color?.b ?? 1) * (color ? color.getZ(vi) : 1)
              ]
            });
          }
          specialTriangles.push({ x: block.x, y: block.y, z: block.z, key: descriptor.key, uvMatrix: descriptor.uvMatrix, hasUv: !!uv, vertices });
        }
      }
    });
  }

  function ensureWorker() {
    if (worker) return worker;
    if (root.BlockFlowWorkers?.create) worker = root.BlockFlowWorkers.create('geometry');
    else {
      const base = document.currentScript?.src || location.href;
      worker = new Worker(new URL('../workers/geometry-baker.js', base), { name: 'BlockFlow-geometry-baker' });
    }
    worker.onmessage = event => {
      const message = event.data || {};
      const job = jobs.get(message.id);
      if (!job) return;
      if (message.type === 'progress') {
        if (job.isCancelled?.()) worker.postMessage({ type: 'cancel', id: message.id });
        job.onProgress?.(message.done || 0, message.total || 0, message.phase || 'worker');
        return;
      }
      jobs.delete(message.id);
      if (message.type === 'error') {
        const error = new Error(message.message || '几何 Worker 执行失败');
        error.name = message.name || 'Error';
        job.reject(error);
      } else if (message.type === 'result') job.resolve(message);
    };
    worker.onerror = event => {
      const error = new Error(event.message || '几何 Worker 发生错误');
      for (const job of jobs.values()) job.reject(error);
      jobs.clear();
      worker?.terminate?.(); worker = null;
    };
    return worker;
  }

  function runWorker(payload, callbacks) {
    const instance = ensureWorker();
    const id = nextJobId++;
    payload.id = id;
    return new Promise((resolve, reject) => {
      jobs.set(id, { resolve, reject, onProgress: callbacks.onProgress, isCancelled: callbacks.isCancelled });
      try { instance.postMessage(payload); }
      catch (error) { jobs.delete(id); reject(error); }
    });
  }

  function makeOutputMaterial(descriptor, atlas, THREE) {
    let map = descriptor.map || null;
    if (map && descriptor.mapKey !== 'atlas') {
      map = map.clone ? map.clone() : map;
      map.offset?.set?.(0, 0); map.repeat?.set?.(1, 1); map.center?.set?.(0, 0);
      map.rotation = 0; map.matrixAutoUpdate = true; map.updateMatrix?.();
    }
    const material = new THREE.MeshBasicMaterial({
      map, color: 0xffffff, vertexColors: true,
      transparent: descriptor.transparent, opacity: descriptor.opacity,
      alphaTest: descriptor.alphaTest, depthWrite: descriptor.depthWrite,
      depthTest: descriptor.depthTest, side: descriptor.side,
      blending: descriptor.blending, toneMapped: descriptor.toneMapped,
      polygonOffset: descriptor.polygonOffset,
      polygonOffsetFactor: descriptor.polygonOffsetFactor,
      polygonOffsetUnits: descriptor.polygonOffsetUnits,
      premultipliedAlpha: descriptor.premultipliedAlpha
    });
    if (descriptor.mapKey === 'atlas') material.map = atlas;
    else if (map) material.userData.blockFlowOwnedMap = map;
    return material;
  }

  function makeLevelGroup(lodResult, descriptorMap, THREE, getChunkMaterial) {
    const group = new THREE.Group();
    group.name = `BlockFlowLOD_${lodResult.scale}x`;
    for (const bucket of lodResult.buckets || []) {
      const descriptor = descriptorMap.get(bucket.key);
      if (!descriptor) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(bucket.normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(bucket.colors, 3));
      if (bucket.uvs?.length) geometry.setAttribute('uv', new THREE.BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(bucket.indices, 1));
      // All positions are chunk-local. A conservative fixed sphere avoids a full main-thread
      // vertex scan for every material in every LOD level.
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(CHUNK_SIZE/2, CHUNK_SIZE/2, CHUNK_SIZE/2), CHUNK_SIZE * 1.15);
      const material = getChunkMaterial(descriptor);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = descriptor.transparent ? 'BlockFlowBakedTransparent' : 'BlockFlowBakedOpaque';
      mesh.frustumCulled = true;
      mesh.renderOrder = descriptor.transparent ? 2 : 1;
      mesh.castShadow = false; mesh.receiveShadow = false;
      group.add(mesh);
    }
    return group;
  }

  function assembleChunks(result, descriptorMap, atlas, THREE, layer) {
    const rootGroup = new THREE.Group();
    rootGroup.name = `BakedLayer_${layer}`;
    const distanceByLod = [0, 72, 168, 336];
    for (const chunk of result.chunks || []) {
      const chunkGroup = new THREE.Group();
      chunkGroup.name = `Chunk_${chunk.cx}_${chunk.cy}_${chunk.cz}`;
      const origin = [chunk.cx * CHUNK_SIZE, chunk.cy * CHUNK_SIZE, chunk.cz * CHUNK_SIZE];
      const chunkMaterials = new Map();
      const getChunkMaterial = descriptor => {
        let material = chunkMaterials.get(descriptor.key);
        if (!material) { material = makeOutputMaterial(descriptor, atlas, THREE); chunkMaterials.set(descriptor.key, material); }
        return material;
      };
      if ((chunk.lods || []).length > 1 && THREE.LOD) {
        const lod = new THREE.LOD();
        lod.name = `BlockFlowChunkLOD_${chunk.cx}_${chunk.cy}_${chunk.cz}`;
        lod.position.set(origin[0] + CHUNK_SIZE/2, origin[1] + CHUNK_SIZE/2, origin[2] + CHUNK_SIZE/2);
        chunk.lods.forEach((lodResult, index) => {
          const level = makeLevelGroup(lodResult, descriptorMap, THREE, getChunkMaterial);
          level.position.set(-CHUNK_SIZE/2, -CHUNK_SIZE/2, -CHUNK_SIZE/2);
          lod.addLevel(level, distanceByLod[index] ?? distanceByLod[distanceByLod.length-1] * index);
        });
        chunkGroup.add(lod);
      } else {
        chunkGroup.position.set(...origin);
        const level = makeLevelGroup(chunk.lods?.[0] || { scale:1, buckets:[] }, descriptorMap, THREE, getChunkMaterial);
        chunkGroup.add(level);
      }
      chunkGroup.userData.chunk = { x: chunk.cx, y: chunk.cy, z: chunk.cz };
      rootGroup.add(chunkGroup);
    }
    rootGroup.userData.bakeStats = result.stats || {};
    rootGroup.userData.chunkKeys = (result.chunks || []).map(chunk => chunk.key);
    rootGroup.userData.partial = !!result.partial;
    return rootGroup;
  }

  async function bakeLayer(options) {
    const {
      THREE, blocks, atlas, getMaterials, isSpecialBlock,
      createSpecialBlockGroup, releaseSourceGeometry = null, layer = 0,
      onProgress = null, isCancelled = null, targetChunks = null,
      chunkSize = CHUNK_SIZE, lodThreshold = 1800, enableLOD = true, totalLayerBlocks = null
    } = options || {};
    if (!THREE || !Array.isArray(blocks) || typeof getMaterials !== 'function') {
      throw new TypeError('BlockFlowBaker: 缺少 THREE、blocks 或 getMaterials 参数');
    }
    if (Number(chunkSize) !== CHUNK_SIZE) throw new Error('当前几何 Worker 固定使用 16³ Chunk');

    const startedAt = performance.now();
    const materialCache = new WeakMap();
    const descriptorMap = new Map();
    const serialDescriptors = {};
    const cubeBlocks = [];
    const specialTriangles = [];
    const faceTemplates = extractCubeFaces(THREE);
    const visibleBlocks = blocks.filter(block => block && !['minecraft:air','minecraft:structure_void','minecraft:structure_air'].includes(String(block.name || '')));
    const targetSet = Array.isArray(targetChunks) ? new Set(targetChunks) : null;
    const contextSet = targetSet ? new Set(targetSet) : null;
    if (contextSet) {
      for (const key of targetSet) {
        const [cx,cy,cz] = key.split(',').map(Number);
        for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) contextSet.add(`${cx+dx},${cy+dy},${cz+dz}`);
      }
    }
    const relevantBlocks = targetSet ? visibleBlocks.filter(block => contextSet.has(`${Math.floor(block.x/CHUNK_SIZE)},${Math.floor(block.y/CHUNK_SIZE)},${Math.floor(block.z/CHUNK_SIZE)}`)) : visibleBlocks;
    const targetVisibleBlocks = targetSet ? visibleBlocks.filter(block => targetSet.has(`${Math.floor(block.x/CHUNK_SIZE)},${Math.floor(block.y/CHUNK_SIZE)},${Math.floor(block.z/CHUNK_SIZE)}`)) : visibleBlocks;
    let prepared = 0;

    try {
      for (const block of relevantBlocks) {
        if (isCancelled?.()) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
        const inTargetChunk = !targetSet || targetSet.has(`${Math.floor(block.x/CHUNK_SIZE)},${Math.floor(block.y/CHUNK_SIZE)},${Math.floor(block.z/CHUNK_SIZE)}`);
        const special = typeof isSpecialBlock === 'function' && isSpecialBlock(block);
        if (special && !inTargetChunk) { prepared++; continue; }
        const materials = getMaterialArray(block, getMaterials, materialCache);
        const faces = materials.slice(0,6).map(material => {
          if (!material) return null;
          const descriptor = bucketDescriptor(material, atlas, THREE);
          descriptorMap.set(descriptor.key, descriptor);
          serialDescriptors[descriptor.key] = { uvMatrix: descriptor.uvMatrix };
          return serializableFace(material, descriptor);
        });
        if (!special) cubeBlocks.push({ x:block.x, y:block.y, z:block.z, name:String(block.name || ''), faces });
        else {
          const modelGroup = typeof createSpecialBlockGroup === 'function' ? createSpecialBlockGroup(block) : null;
          if (modelGroup) {
            try { transformSpecialTriangles(block, modelGroup, atlas, THREE, descriptorMap, specialTriangles); }
            finally {
              modelGroup.traverse(node => {
                if (node.geometry) { releaseSourceGeometry?.(node.geometry); node.geometry.dispose?.(); }
              });
              modelGroup.clear?.();
            }
          }
        }
        prepared++;
        if ((prepared & 255) === 0) {
          onProgress?.(prepared, Math.max(1, relevantBlocks.length), 'prepare');
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      onProgress?.(relevantBlocks.length, Math.max(1, relevantBlocks.length), 'prepare');

      const result = await runWorker({
        type: 'bake', layer, blocks: cubeBlocks, specialTriangles,
        descriptors: serialDescriptors, cubeFaces: faceTemplates,
        targetChunks: Array.isArray(targetChunks) ? targetChunks : null,
        layerBlockCount: Number(totalLayerBlocks) || visibleBlocks.length,
        enableLOD: !!enableLOD, lodThreshold
      }, {
        isCancelled,
        onProgress: (done,total,phase) => onProgress?.(done, Math.max(1, total), phase)
      });
      if (isCancelled?.()) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
      const group = assembleChunks(result, descriptorMap, atlas, THREE, layer);
      const coreWork = Math.max(1, cubeBlocks.length * 2 + specialTriangles.length);
      const completeWork = coreWork + (result.stats?.lodEnabled ? cubeBlocks.length * 6 + specialTriangles.length * 3 : 0);
      onProgress?.(completeWork, completeWork, 'complete');
      group.userData.bakeStats = {
        ...result.stats,
        visibleBlocks: targetVisibleBlocks.length,
        contextBlocks: relevantBlocks.length - targetVisibleBlocks.length,
        cubeBlocks: cubeBlocks.length,
        specialBlocks: targetVisibleBlocks.length - cubeBlocks.filter(block=>targetSet?.has(`${Math.floor(block.x/CHUNK_SIZE)},${Math.floor(block.y/CHUNK_SIZE)},${Math.floor(block.z/CHUNK_SIZE)}`)).length,
        chunkSize: CHUNK_SIZE,
        indexed: true,
        elapsedMs: Math.max(0, performance.now() - startedAt)
      };
      return group;
    } catch (error) {
      if (error?.name === 'AbortError') {
        // The worker checks cancellation at yield points. Also mark any in-flight job
        // through the progress callback; a later full rebuild receives a fresh job id.
      }
      throw error;
    }
  }

  function cancelAll() {
    if (!worker) return;
    for (const id of jobs.keys()) worker.postMessage({ type: 'cancel', id });
  }

  function chunkKeyForBlock(block) {
    return `${Math.floor(block.x/CHUNK_SIZE)},${Math.floor(block.y/CHUNK_SIZE)},${Math.floor(block.z/CHUNK_SIZE)}`;
  }

  function neighboringChunkKeys(block) {
    const result = new Set([chunkKeyForBlock(block)]);
    const axes = [
      [block.x, block.y, block.z, 0],
      [block.x, block.y, block.z, 1],
      [block.x, block.y, block.z, 2]
    ];
    for (const [x,y,z,axis] of axes) {
      const value = [x,y,z][axis];
      const remainder = ((value % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const sign = remainder === 0 ? -1 : remainder === CHUNK_SIZE-1 ? 1 : 0;
      if (sign) {
        const p = [x,y,z]; p[axis] += sign;
        result.add(`${Math.floor(p[0]/CHUNK_SIZE)},${Math.floor(p[1]/CHUNK_SIZE)},${Math.floor(p[2]/CHUNK_SIZE)}`);
      }
    }
    return [...result];
  }

  root.BlockFlowBaker = Object.freeze({
    bakeLayer, chunkKeyForBlock, neighboringChunkKeys, cancelAll,
    version: '2.0.0-worker-indexed-chunk-lod'
  });
})(window);
