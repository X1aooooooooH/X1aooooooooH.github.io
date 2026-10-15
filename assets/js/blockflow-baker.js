/*
 * BlockFlow native geometry baker
 *
 * This module deliberately does not read models.bin, call a WASM bake export,
 * or depend on an external model-baking runtime. It compiles the BlockFlow
 * renderer's own Three.js block shapes into a small set of merged geometries.
 *
 * Pipeline:
 *   1. index full-cube occupancy for face visibility;
 *   2. cull faces hidden by adjacent opaque full cubes;
 *   3. compile ordinary cubes from BlockFlow's six-face materials;
 *   4. compile stateful/non-cube models supplied by BlockFlow's own shape
 *      builders (stairs, doors, rails, redstone, signs, etc.);
 *   5. bake texture repeat/offset transforms into UVs and material tint into
 *      vertex colors;
 *   6. batch by render state into opaque, cutout/blended and untextured meshes.
 *
 * The caller owns the returned group and must dispose it when replacing a layer.
 */
(function registerBlockFlowBaker(root) {
  'use strict';

  const OPPOSITE_FACE = [1, 0, 3, 2, 5, 4];
  const FACE_OFFSETS = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0],
    [0, -1, 0], [0, 0, 1], [0, 0, -1]
  ];

  const imageIds = new WeakMap();
  let nextImageId = 1;

  function imageId(image) {
    if (!image || (typeof image !== 'object' && typeof image !== 'function')) return 'none';
    let id = imageIds.get(image);
    if (!id) {
      id = nextImageId++;
      imageIds.set(image, id);
    }
    return id;
  }

  function getTextureMatrix(texture, THREE) {
    if (!texture) return null;
    if (texture.matrixAutoUpdate && typeof texture.updateMatrix === 'function') texture.updateMatrix();
    const elements = texture.matrix?.elements;
    if (elements?.length === 9) return elements;
    // Compatibility with texture implementations that expose only repeat/offset.
    const sx = Number(texture.repeat?.x ?? 1);
    const sy = Number(texture.repeat?.y ?? 1);
    const ox = Number(texture.offset?.x ?? 0);
    const oy = Number(texture.offset?.y ?? 0);
    return [sx, 0, 0, 0, sy, 0, ox, oy, 1];
  }

  function materialIsOccluding(material) {
    return !!material && material.visible !== false && material.colorWrite !== false &&
      material.transparent !== true && Number(material.opacity ?? 1) >= 0.999 &&
      Number(material.alphaTest ?? 0) <= 0 && material.depthWrite !== false;
  }

  function getMaterialArray(block, getMaterials, cache) {
    let value = cache.get(block);
    if (!value) {
      value = getMaterials(block) || [];
      cache.set(block, value);
    }
    return Array.isArray(value) ? value : [value];
  }

  function bucketDescriptor(material, atlas, THREE) {
    const map = material.map || null;
    const sourceImage = map?.image || map?.source?.data || null;
    const isAtlas = !!(map && atlas && sourceImage && sourceImage === (atlas.image || atlas.source?.data));
    const mapKey = map ? (isAtlas ? 'atlas' : `image-${imageId(sourceImage || map)}`) : 'plain';
    const descriptor = {
      mapKey,
      map: isAtlas ? atlas : map,
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
      color: material.color || null
    };
    descriptor.key = [
      descriptor.mapKey, descriptor.transparent ? 1 : 0,
      descriptor.opacity, descriptor.alphaTest, descriptor.depthWrite ? 1 : 0,
      descriptor.depthTest ? 1 : 0, descriptor.side, descriptor.blending,
      descriptor.toneMapped ? 1 : 0, descriptor.polygonOffset ? 1 : 0,
      descriptor.polygonOffsetFactor, descriptor.polygonOffsetUnits,
      descriptor.premultipliedAlpha ? 1 : 0
    ].join('|');
    descriptor.uvMatrix = getTextureMatrix(map, THREE);
    return descriptor;
  }

  function createBucket(descriptor) {
    return {
      descriptor,
      positions: [],
      normals: [],
      uvs: descriptor.map ? [] : null,
      colors: [],
      vertices: 0,
      triangles: 0
    };
  }

  function pushVertex(bucket, descriptor, matrix, normalMatrix, px, py, pz, nx, ny, nz, u, v, cr, cg, cb) {
    const me = matrix.elements;
    bucket.positions.push(
      me[0] * px + me[4] * py + me[8] * pz + me[12],
      me[1] * px + me[5] * py + me[9] * pz + me[13],
      me[2] * px + me[6] * py + me[10] * pz + me[14]
    );

    const ne = normalMatrix.elements;
    let x = ne[0] * nx + ne[3] * ny + ne[6] * nz;
    let y = ne[1] * nx + ne[4] * ny + ne[7] * nz;
    let z = ne[2] * nx + ne[5] * ny + ne[8] * nz;
    const length = Math.hypot(x, y, z) || 1;
    bucket.normals.push(x / length, y / length, z / length);

    if (bucket.uvs) {
      const m = descriptor.uvMatrix;
      if (m) bucket.uvs.push(m[0] * u + m[3] * v + m[6], m[1] * u + m[4] * v + m[7]);
      else bucket.uvs.push(u, v);
    }

    const color = descriptor.color;
    bucket.colors.push(
      (color?.r ?? 1) * cr,
      (color?.g ?? 1) * cg,
      (color?.b ?? 1) * cb
    );
    bucket.vertices++;
  }

  function appendGeometryMesh(mesh, buckets, atlas, THREE) {
    const geometry = mesh.geometry;
    if (!geometry || mesh.visible === false) return { triangles: 0 };
    const position = geometry.getAttribute('position');
    if (!position) return { triangles: 0 };
    if (!geometry.getAttribute('normal') && typeof geometry.computeVertexNormals === 'function') {
      geometry.computeVertexNormals();
    }

    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const color = geometry.getAttribute('color');
    const index = geometry.index;
    const hasMaterialArray = Array.isArray(mesh.material);
    const materials = hasMaterialArray ? mesh.material : [mesh.material];
    const totalElements = index ? index.count : position.count;
    // Three.js ignores geometry material groups when a Mesh has one material.
    const groups = hasMaterialArray && geometry.groups?.length ? geometry.groups : [{ start: 0, count: totalElements, materialIndex: 0 }];
    const drawStart = Math.max(0, geometry.drawRange?.start || 0);
    const drawCount = geometry.drawRange?.count;
    const drawEnd = Number.isFinite(drawCount) ? Math.min(totalElements, drawStart + Math.max(0, drawCount)) : totalElements;
    const matrix = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    let triangles = 0;

    for (const group of groups) {
      const material = materials[group.materialIndex || 0];
      if (!material || material.visible === false || material.colorWrite === false || Number(material.opacity ?? 1) <= 0) continue;
      const descriptor = bucketDescriptor(material, atlas, THREE);
      let bucket = buckets.get(descriptor.key);
      if (!bucket) buckets.set(descriptor.key, bucket = createBucket(descriptor));
      const start = Math.max(group.start || 0, drawStart);
      const end = Math.min((group.start || 0) + group.count, drawEnd);

      for (let offset = start; offset + 2 < end; offset += 3) {
        for (let corner = 0; corner < 3; corner++) {
          const vertexIndex = index ? index.getX(offset + corner) : offset + corner;
          const px = position.getX(vertexIndex), py = position.getY(vertexIndex), pz = position.getZ(vertexIndex);
          const nx = normal ? normal.getX(vertexIndex) : 0;
          const ny = normal ? normal.getY(vertexIndex) : 1;
          const nz = normal ? normal.getZ(vertexIndex) : 0;
          const u = uv ? uv.getX(vertexIndex) : 0;
          const v = uv ? uv.getY(vertexIndex) : 0;
          const cr = color ? color.getX(vertexIndex) : 1;
          const cg = color ? color.getY(vertexIndex) : 1;
          const cb = color ? color.getZ(vertexIndex) : 1;
          pushVertex(bucket, descriptor, matrix, normalMatrix, px, py, pz, nx, ny, nz, u, v, cr, cg, cb);
        }
        bucket.triangles++;
        triangles++;
      }
    }
    return { triangles };
  }

  function makeOutputMaterial(descriptor, THREE) {
    let map = descriptor.map || null;
    // Texture transforms have already been applied to vertex UVs. A non-atlas
    // texture therefore needs a neutral transform on the output material.
    if (map && descriptor.mapKey !== 'atlas') {
      map = map.clone ? map.clone() : map;
      if (map.offset?.set) map.offset.set(0, 0);
      if (map.repeat?.set) map.repeat.set(1, 1);
      if (map.center?.set) map.center.set(0, 0);
      map.rotation = 0;
      map.matrixAutoUpdate = true;
      map.updateMatrix?.();
    }
    const output = new THREE.MeshBasicMaterial({
      map,
      color: 0xffffff,
      vertexColors: true,
      transparent: descriptor.transparent,
      opacity: descriptor.opacity,
      alphaTest: descriptor.alphaTest,
      depthWrite: descriptor.depthWrite,
      depthTest: descriptor.depthTest,
      side: descriptor.side,
      blending: descriptor.blending,
      toneMapped: descriptor.toneMapped,
      polygonOffset: descriptor.polygonOffset,
      polygonOffsetFactor: descriptor.polygonOffsetFactor,
      polygonOffsetUnits: descriptor.polygonOffsetUnits,
      premultipliedAlpha: descriptor.premultipliedAlpha
    });
    if (map && descriptor.mapKey !== 'atlas') output.userData.blockFlowOwnedMap = map;
    return output;
  }

  function emitBuckets(rootGroup, buckets, THREE, atlas) {
    const ordered = [...buckets.values()].sort((a, b) => Number(a.descriptor.transparent) - Number(b.descriptor.transparent));
    for (const bucket of ordered) {
      if (!bucket.vertices || !bucket.triangles) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
      if (bucket.uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.computeBoundingSphere();
      const material = makeOutputMaterial(bucket.descriptor, THREE);
      // If the bucket is the shared atlas, always bind the base atlas texture.
      if (bucket.descriptor.mapKey === 'atlas') material.map = atlas;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = bucket.descriptor.transparent ? 'BlockFlowBakedTransparent' : 'BlockFlowBakedOpaque';
      mesh.frustumCulled = true;
      mesh.renderOrder = bucket.descriptor.transparent ? 2 : 1;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      rootGroup.add(mesh);
    }
  }

  function blockCoordinateKey(x, y, z) { return `${x},${y},${z}`; }

  async function bakeLayer(options) {
    const {
      THREE, blocks, atlas, getMaterials, isSpecialBlock,
      createSpecialBlockGroup, releaseSourceGeometry = null, layer = 0,
      onProgress = null, isCancelled = null, chunkSize = 160
    } = options || {};
    if (!THREE || !Array.isArray(blocks) || typeof getMaterials !== 'function') {
      throw new TypeError('BlockFlowBaker: 缺少 THREE、blocks 或 getMaterials 参数');
    }

    const effectiveChunkSize = Math.max(16, Math.floor(Number(chunkSize) || 160));
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const group = new THREE.Group();
    group.name = `BakedLayer_${layer}`;
    const buckets = new Map();
    const materialCache = new WeakMap();
    const byPosition = new Map();
    const fullCube = new WeakSet();
    const cubeBlocks = [];
    const specialBlocks = [];
    const visibleBlocks = blocks.filter(block => block && !['minecraft:air', 'minecraft:structure_void', 'minecraft:structure_air'].includes(String(block.name || '')));

    for (const block of visibleBlocks) {
      byPosition.set(blockCoordinateKey(block.x, block.y, block.z), block);
      const special = typeof isSpecialBlock === 'function' && isSpecialBlock(block);
      if (special) specialBlocks.push(block);
      else {
        cubeBlocks.push(block);
        fullCube.add(block);
      }
    }

    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cubeIndex = cubeGeometry.index;
    const cubePosition = cubeGeometry.getAttribute('position');
    const cubeNormal = cubeGeometry.getAttribute('normal');
    const cubeUv = cubeGeometry.getAttribute('uv');
    const faceGroups = cubeGeometry.groups?.length ? cubeGeometry.groups : FACE_OFFSETS.map((_, face) => ({ start: face * 6, count: 6, materialIndex: face }));

    let processed = 0;
    let cubeFaces = 0;
    let specialTriangles = 0;
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

    try {
      for (const block of cubeBlocks) {
        if (typeof isCancelled === 'function' && isCancelled()) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
        const materials = getMaterialArray(block, getMaterials, materialCache);
        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(block.x + 0.5, block.y + 0.5 + (block.layer ? 1.08 : 0), block.z + 0.5);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

        for (let face = 0; face < faceGroups.length; face++) {
          const faceGroup = faceGroups[face];
          const material = materials[faceGroup.materialIndex ?? face] || materials[0];
          if (!material || material.visible === false || material.colorWrite === false || Number(material.opacity ?? 1) <= 0) continue;

          const [dx, dy, dz] = FACE_OFFSETS[face];
          const neighbor = byPosition.get(blockCoordinateKey(block.x + dx, block.y + dy, block.z + dz));
          if (neighbor && fullCube.has(neighbor)) {
            const neighborMaterials = getMaterialArray(neighbor, getMaterials, materialCache);
            const opposite = neighborMaterials[OPPOSITE_FACE[face]] || neighborMaterials[0];
            const sameTransparentFamily = String(neighbor.name || '') === String(block.name || '') &&
              !!material.transparent && !!opposite?.transparent;
            if (materialIsOccluding(opposite) || sameTransparentFamily) continue;
          }

          const descriptor = bucketDescriptor(material, atlas, THREE);
          let bucket = buckets.get(descriptor.key);
          if (!bucket) buckets.set(descriptor.key, bucket = createBucket(descriptor));
          const end = faceGroup.start + faceGroup.count;
          for (let offset = faceGroup.start; offset + 2 < end; offset += 3) {
            for (let corner = 0; corner < 3; corner++) {
              const vertexIndex = cubeIndex ? cubeIndex.getX(offset + corner) : offset + corner;
              pushVertex(
                bucket, descriptor, matrix, normalMatrix,
                cubePosition.getX(vertexIndex), cubePosition.getY(vertexIndex), cubePosition.getZ(vertexIndex),
                cubeNormal.getX(vertexIndex), cubeNormal.getY(vertexIndex), cubeNormal.getZ(vertexIndex),
                cubeUv.getX(vertexIndex), cubeUv.getY(vertexIndex), 1, 1, 1
              );
            }
            bucket.triangles++;
            cubeFaces++;
          }
        }

        processed++;
        if (processed % effectiveChunkSize === 0) {
          if (typeof onProgress === 'function') onProgress(processed, visibleBlocks.length, 'cube');
          await yieldToBrowser();
        }
      }

      for (const block of specialBlocks) {
        if (typeof isCancelled === 'function' && isCancelled()) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
        const modelGroup = typeof createSpecialBlockGroup === 'function' ? createSpecialBlockGroup(block) : null;
        if (modelGroup) {
          try {
            modelGroup.updateMatrixWorld(true);
            modelGroup.traverse(node => {
              if (node.isMesh && node.material && node.material.colorWrite !== false) {
                specialTriangles += appendGeometryMesh(node, buckets, atlas, THREE).triangles;
              }
            });
          } finally {
            // Source geometries are temporary. Drop them immediately after their
            // attributes have been compiled into the merged buffers, including
            // the error path where a malformed shape fails during compilation.
            modelGroup.traverse(node => {
              if (node.geometry) {
                releaseSourceGeometry?.(node.geometry);
                node.geometry.dispose?.();
              }
            });
            modelGroup.clear?.();
          }
        }

        processed++;
        if (processed % effectiveChunkSize === 0) {
          if (typeof onProgress === 'function') onProgress(processed, visibleBlocks.length, 'special');
          await yieldToBrowser();
        }
      }

      if (typeof isCancelled === 'function' && isCancelled()) {
        throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
      }
      emitBuckets(group, buckets, THREE, atlas);
      cubeGeometry.dispose?.();
      if (typeof onProgress === 'function') onProgress(visibleBlocks.length, visibleBlocks.length, 'complete');
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      group.userData.bakeStats = {
        blocks: visibleBlocks.length,
        cubeBlocks: cubeBlocks.length,
        specialBlocks: specialBlocks.length,
        cubeTriangles: cubeFaces,
        specialTriangles,
        buckets: buckets.size,
        elapsedMs: Math.max(0, endedAt - startedAt)
      };
      return group;
    } catch (error) {
      cubeGeometry.dispose?.();
      group.traverse(node => {
        node.geometry?.dispose?.();
        for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
          material?.userData?.blockFlowOwnedMap?.dispose?.();
          material?.dispose?.();
        }
      });
      throw error;
    }
  }

  root.BlockFlowBaker = Object.freeze({ bakeLayer, version: '1.0.0-native' });
})(window);
