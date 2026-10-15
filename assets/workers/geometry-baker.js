/* BlockFlow geometry worker.
 * Receives plain data only: the worker never touches the DOM, WebGL, or Three.js.
 * It builds chunked indexed meshes and coarse voxel LODs, then transfers buffers.
 */
'use strict';

const CHUNK_SIZE = 16;
const cancelled = new Set();
const FACE_DIRECTIONS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const OPPOSITE_FACE = [1,0,3,2,5,4];

function chunkCoord(v) { return Math.floor(v / CHUNK_SIZE); }
function chunkKey(cx, cy, cz) { return `${cx},${cy},${cz}`; }
function cellKey(x, y, z) { return `${x},${y},${z}`; }
function isOccluding(face) {
  return !!face && face.visible !== false && face.colorWrite !== false &&
    face.transparent !== true && Number(face.opacity ?? 1) >= 0.999 &&
    Number(face.alphaTest ?? 0) <= 0 && face.depthWrite !== false;
}
function transformUv(matrix, u, v) {
  if (!matrix || matrix.length !== 9) return [u, v];
  return [matrix[0] * u + matrix[3] * v + matrix[6], matrix[1] * u + matrix[4] * v + matrix[7]];
}
function makeBucket(key) {
  return { key, positions: [], normals: [], uvs: [], colors: [], indices: [], vertexMap: new Map(), triangles: 0 };
}
function stableNumber(value) { return Math.abs(value) < 1e-8 ? 0 : Math.round(value * 1e6) / 1e6; }
function vertexKey(p, n, uv, c, hasUv) {
  return [p[0],p[1],p[2],n[0],n[1],n[2],hasUv?uv[0]:0,hasUv?uv[1]:0,c[0],c[1],c[2]].map(stableNumber).join(',');
}
function addVertex(bucket, p, n, uv, c, hasUv) {
  const key = vertexKey(p, n, uv, c, hasUv);
  const found = bucket.vertexMap.get(key);
  if (found !== undefined) return found;
  const index = bucket.positions.length / 3;
  bucket.vertexMap.set(key, index);
  bucket.positions.push(p[0],p[1],p[2]);
  bucket.normals.push(n[0],n[1],n[2]);
  bucket.uvs.push(hasUv ? uv[0] : 0, hasUv ? uv[1] : 0);
  bucket.colors.push(c[0],c[1],c[2]);
  return index;
}
function getBucket(chunk, face) {
  let bucket = chunk.buckets.get(face.key);
  if (!bucket) chunk.buckets.set(face.key, bucket = makeBucket(face.key));
  return bucket;
}
function addQuad(chunk, face, template, center, scale, descriptor) {
  if (!face || !face.key) return;
  const bucket = getBucket(chunk, face);
  const indices = [];
  for (const vertex of template.vertices) {
    const p = [
      center[0] + vertex.p[0] * scale,
      center[1] + vertex.p[1] * scale,
      center[2] + vertex.p[2] * scale
    ];
    const uv = transformUv(face.uvMatrix || descriptor?.uvMatrix, vertex.uv[0], vertex.uv[1]);
    const dc = face.color || descriptor?.color || [1,1,1];
    const c = [dc[0] * (vertex.color?.[0] ?? 1), dc[1] * (vertex.color?.[1] ?? 1), dc[2] * (vertex.color?.[2] ?? 1)];
    indices.push(addVertex(bucket, p, vertex.n, uv, c, face.hasUv !== false));
  }
  for (const index of template.indices) bucket.indices.push(indices[index]);
  bucket.triangles += template.indices.length / 3;
}
function addSpecialTriangle(chunk, triangle) {
  const face = { key: triangle.key, hasUv: triangle.hasUv !== false, uvMatrix: triangle.uvMatrix || null };
  const bucket = getBucket(chunk, face);
  const ox = chunk.cx * CHUNK_SIZE, oy = chunk.cy * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
  for (const vertex of triangle.vertices) {
    const uv = transformUv(face.uvMatrix, vertex.uv[0], vertex.uv[1]);
    const c = vertex.c || [1,1,1];
    const p = [vertex.p[0]-ox, vertex.p[1]-oy, vertex.p[2]-oz];
    bucket.indices.push(addVertex(bucket, p, vertex.n, uv, c, face.hasUv));
  }
  bucket.triangles++;
}
function makeChunk(cx, cy, cz) {
  return { cx, cy, cz, key: chunkKey(cx,cy,cz), buckets: new Map() };
}
function chooseFace(counts) {
  let best = null, bestCount = -1;
  for (const [key, value] of counts) if (value.count > bestCount) { best = value.face; bestCount = value.count; }
  return best;
}
function serializeChunk(chunk, scale) {
  const buckets = [];
  for (const bucket of chunk.buckets.values()) {
    if (!bucket.indices.length) continue;
    const IndexArray = bucket.positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
    const positions = new Float32Array(bucket.positions);
    const normals = new Float32Array(bucket.normals);
    const uvs = new Float32Array(bucket.uvs);
    const colors = new Float32Array(bucket.colors);
    const indices = new IndexArray(bucket.indices);
    buckets.push({ key: bucket.key, positions, normals, uvs, colors, indices, triangles: bucket.triangles });
  }
  return { cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, key: chunk.key, scale, buckets };
}
function collectTransferables(chunks) {
  const transfer = [];
  for (const chunk of chunks) for (const bucket of chunk.lods.flatMap(lod => lod.buckets)) {
    transfer.push(bucket.positions.buffer, bucket.normals.buffer, bucket.uvs.buffer, bucket.colors.buffer, bucket.indices.buffer);
  }
  return transfer;
}
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

async function processJob(message) {
  const { id, blocks = [], specialTriangles = [], descriptors = {}, cubeFaces = [], layer = 0 } = message;
  const chunkSize = CHUNK_SIZE;
  const targetSet = Array.isArray(message.targetChunks) ? new Set(message.targetChunks) : null;
  const chunkMap = new Map();
  const byPosition = new Map();
  const fullBlocks = [];
  let processed = 0;
  const workTotal = Math.max(1, blocks.length * 2 + specialTriangles.length);
  const totalCount = Number(message.layerBlockCount) || (blocks.length + specialTriangles.length);
  const enableLod = message.enableLOD !== false && totalCount >= (message.lodThreshold || 1800);
  const progressTotal = workTotal + (enableLod ? blocks.length * 6 + specialTriangles.length * 3 : 0);
  let cubeTriangles = 0;
  let targetBlockCount = 0;
  let specialTriangleCount = 0;
  const specialByChunk = new Map();
  const getChunk = (cx,cy,cz) => {
    const key = chunkKey(cx,cy,cz);
    let chunk = chunkMap.get(key);
    if (!chunk) chunkMap.set(key, chunk = makeChunk(cx,cy,cz));
    return chunk;
  };
  const shouldEmit = (cx,cy,cz) => !targetSet || targetSet.has(chunkKey(cx,cy,cz));

  for (const block of blocks) {
    const key = cellKey(block.x, block.y, block.z);
    byPosition.set(key, block);
    fullBlocks.push(block);
    processed++;
    if ((processed & 2047) === 0) {
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
      self.postMessage({ type:'progress', id, done:processed, total:progressTotal, phase:'index' });
      await yieldTask();
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const cx = chunkCoord(block.x), cy = chunkCoord(block.y), cz = chunkCoord(block.z);
    if (shouldEmit(cx,cy,cz)) {
      targetBlockCount++;
      const chunk = getChunk(cx,cy,cz);
      for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        const face = block.faces?.[faceIndex];
        if (!face?.key) continue;
        const [dx,dy,dz] = FACE_DIRECTIONS[faceIndex];
        const neighbor = byPosition.get(cellKey(block.x+dx, block.y+dy, block.z+dz));
        if (neighbor) {
          const opposite = neighbor.faces?.[OPPOSITE_FACE[faceIndex]];
          const sameTransparent = neighbor.name === block.name && face.transparent && opposite?.transparent;
          if (isOccluding(opposite) || sameTransparent) continue;
        }
        const template = cubeFaces[faceIndex];
        if (!template) continue;
        const center = [block.x + .5 - cx*chunkSize, block.y + .5 + (layer ? 1.08 : 0) - cy*chunkSize, block.z + .5 - cz*chunkSize];
        addQuad(chunk, face, template, center, 1, descriptors[face.key]);
        cubeTriangles += template.indices.length / 3;
      }
    }
    processed++;
    if ((i & 1023) === 0) {
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
      self.postMessage({ type:'progress', id, done:processed, total:progressTotal, phase:'mesh' });
      await yieldTask();
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
    }
  }

  for (let i = 0; i < specialTriangles.length; i++) {
    const triangle = specialTriangles[i];
    const cx = chunkCoord(triangle.x), cy = chunkCoord(triangle.y), cz = chunkCoord(triangle.z);
    if (shouldEmit(cx,cy,cz)) {
      const key = chunkKey(cx,cy,cz);
      addSpecialTriangle(getChunk(cx,cy,cz), triangle);
      let list = specialByChunk.get(key); if (!list) specialByChunk.set(key, list = []);
      list.push(triangle);
      specialTriangleCount++;
    }
    processed++;
    if ((i & 1023) === 0) {
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
      self.postMessage({ type:'progress', id, done:processed, total:progressTotal, phase:'special' });
      await yieldTask();
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
    }
  }

  if (targetSet) for (const key of targetSet) {
    if (!chunkMap.has(key)) {
      const [cx,cy,cz] = key.split(',').map(Number);
      getChunk(cx,cy,cz);
    }
  }

  const coarseMaps = new Map();
  const coarseChunkLists = new Map();
  if (enableLod) {
    let lodScaleIndex = 0;
    for (const scale of [2,4,8]) {
      const cellMap = new Map();
      let lodScanned = 0;
      for (const block of fullBlocks) {
        const x = Math.floor(block.x/scale), y = Math.floor(block.y/scale), z = Math.floor(block.z/scale);
        const key = cellKey(x,y,z);
        let cell = cellMap.get(key);
        if (!cell) cellMap.set(key, cell = { x,y,z, faces:Array.from({length:6},()=>new Map()) });
        for (let faceIndex=0; faceIndex<6; faceIndex++) {
          const face = block.faces?.[faceIndex]; if (!face?.key) continue;
          const counts = cell.faces[faceIndex];
          const old = counts.get(face.key);
          if (old) old.count++;
          else counts.set(face.key,{face,count:1});
        }
        if ((++lodScanned & 4095) === 0) {
          if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
          self.postMessage({ type:'progress', id, done:workTotal + lodScaleIndex * blocks.length + lodScanned, total:progressTotal, phase:`lod-${scale}` });
          await yieldTask();
          if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
        }
      }
      coarseMaps.set(scale, cellMap);
      const byChunk = new Map();
      let groupedCells = 0;
      for (const cell of cellMap.values()) {
        const key = chunkKey(chunkCoord(cell.x*scale), chunkCoord(cell.y*scale), chunkCoord(cell.z*scale));
        let list = byChunk.get(key); if (!list) byChunk.set(key, list = []); list.push(cell);
        if ((++groupedCells & 4095) === 0) {
          if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
          await yieldTask();
          if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
        }
      }
      coarseChunkLists.set(scale, byChunk);
      lodScaleIndex++;
      self.postMessage({ type:'progress', id, done:workTotal + lodScaleIndex * blocks.length, total:progressTotal, phase:`lod-${scale}-indexed` });
      await yieldTask();
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
    }
  }
  const result = [];
  let lodMeshProcessed = 0;
  let chunkProcessed = 0;
  for (const chunk of chunkMap.values()) {
    const lods = [serializeChunk(chunk, 1)];
    if (enableLod && (chunk.buckets.size || targetSet?.has(chunk.key))) {
      for (const scale of [2,4,8]) {
        if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
        const cellMap = coarseMaps.get(scale) || new Map();
        const coarseByKey = cellMap;
        const lodChunk = makeChunk(chunk.cx,chunk.cy,chunk.cz);
        const localCells = coarseChunkLists.get(scale)?.get(chunk.key) || [];
        let specialLodProcessed = 0;
        for (const triangle of (specialByChunk.get(chunk.key) || [])) {
          addSpecialTriangle(lodChunk, triangle); lodMeshProcessed++;
          if ((++specialLodProcessed & 2047) === 0) {
            if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
            self.postMessage({ type:'progress', id, done:workTotal + blocks.length * 3 + lodMeshProcessed, total:progressTotal, phase:`lod-special-${scale}` });
            await yieldTask();
            if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
          }
        }
        let coarseProcessed = 0;
        for (const cell of localCells) {
          const wx = cell.x*scale, wy=cell.y*scale, wz=cell.z*scale;
          const ccx=chunkCoord(wx), ccy=chunkCoord(wy), ccz=chunkCoord(wz);
          if (chunkKey(ccx,ccy,ccz)!==chunk.key) continue;
          for (let faceIndex=0; faceIndex<6; faceIndex++) {
            const [dx,dy,dz]=FACE_DIRECTIONS[faceIndex];
            if (coarseByKey.has(cellKey(cell.x+dx,cell.y+dy,cell.z+dz))) continue;
            const face=chooseFace(cell.faces[faceIndex]); if (!face?.key) continue;
            const template=cubeFaces[faceIndex]; if (!template) continue;
            const center=[wx+scale/2-chunk.cx*chunkSize, wy+scale/2+(layer?1.08:0)-chunk.cy*chunkSize, wz+scale/2-chunk.cz*chunkSize];
            addQuad(lodChunk,face,template,center,scale,descriptors[face.key]);
          }
          lodMeshProcessed++;
          if ((++coarseProcessed & 2047) === 0) {
            if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
            self.postMessage({ type:'progress', id, done:workTotal + blocks.length * 3 + lodMeshProcessed, total:progressTotal, phase:`lod-mesh-${scale}` });
            await yieldTask();
            if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
          }
        }
        lods.push(serializeChunk(lodChunk,scale));
        self.postMessage({ type:'progress', id, done:Math.min(progressTotal, workTotal + blocks.length * 3 + lodMeshProcessed), total:progressTotal, phase:`lod-mesh-${scale}-complete` });
        await yieldTask();
        if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
      }
    }
    result.push({ cx:chunk.cx,cy:chunk.cy,cz:chunk.cz,key:chunk.key,lods });
    if ((++chunkProcessed & 15) === 0) {
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
      await yieldTask();
      if (cancelled.has(id)) throw Object.assign(new Error('模型构建已取消'), { name: 'AbortError' });
    }
  }
  if (enableLod) self.postMessage({ type:'progress', id, done:progressTotal, total:progressTotal, phase:'lod-complete' });
  cancelled.delete(id);
  return { id, layer, chunks:result, stats:{ blocks:targetBlockCount, contextBlocks:Math.max(0,blocks.length-targetBlockCount), specialTriangles:specialTriangleCount, cubeTriangles, chunks:result.length, lodEnabled:enableLod } };
}

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === 'cancel') { cancelled.add(message.id); return; }
  if (message.type !== 'bake') return;
  processJob(message).then(result => {
    const transfer = collectTransferables(result.chunks);
    self.postMessage({ type:'result', ...result }, transfer);
  }).catch(error => {
    cancelled.delete(message.id);
    self.postMessage({ type:'error', id:message.id, message:error?.message || String(error), name:error?.name || 'Error' });
  });
};
