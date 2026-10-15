const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function cubeFace(normal, axis, sign) {
  const corners = [
    [-.5,-.5], [.5,-.5], [.5,.5], [-.5,.5]
  ];
  const vertices = corners.map(([a,b]) => {
    let p;
    if (axis === 0) p = [sign*.5, a, b];
    else if (axis === 1) p = [a, sign*.5, b];
    else p = [a, b, sign*.5];
    return { p, n: normal, uv: [(a+.5), (b+.5)] };
  });
  return { vertices, indices: [0,1,2,0,2,3] };
}
const cubeFaces = [
  cubeFace([1,0,0],0,1), cubeFace([-1,0,0],0,-1),
  cubeFace([0,1,0],1,1), cubeFace([0,-1,0],1,-1),
  cubeFace([0,0,1],2,1), cubeFace([0,0,-1],2,-1)
];
const face = key => ({ key, uvMatrix: null, color:[1,1,1], transparent:false, opacity:1, alphaTest:0, depthWrite:true });
const descriptors = { stone:{uvMatrix:null} };

async function runWorkerMessage(worker, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('worker test timeout')), 3000);
    const handler = data => {
      if (data.id !== message.id) return;
      if (data.type === 'result') { clearTimeout(timeout); worker.removeListener(handler); resolve(data); }
      if (data.type === 'error') { clearTimeout(timeout); worker.removeListener(handler); reject(new Error(data.message)); }
    };
    worker.addListener(handler);
    worker.context.self.onmessage({ data: message });
  });
}
function createHarness() {
  const listeners = new Set();
  const context = {
    setTimeout, clearTimeout, Uint8Array, Uint16Array, Uint32Array, Float32Array, Map, Set, Math, Number, String, Array, Promise,
    self: {
      postMessage(message) { for (const listener of listeners) listener(message); },
      onmessage: null
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('assets/workers/geometry-baker.js','utf8'), context);
  return { context, addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) };
}
function buildMessage(id, blocks, extra={}) {
  return { type:'bake', id, layer:0, blocks:blocks.map(b=>({ ...b, faces:Array(6).fill(null).map(()=>face('stone')) })), specialTriangles:[], descriptors, cubeFaces, enableLOD:false, ...extra };
}
(async () => {
  const worker = createHarness();
  const one = await runWorkerMessage(worker, buildMessage(1,[{x:0,y:0,z:0}]));
  assert.strictEqual(one.chunks.length,1);
  const oneBucket = one.chunks[0].lods[0].buckets[0];
  assert.strictEqual(oneBucket.indices.length,36,'one cube has 12 triangles');
  assert.strictEqual(oneBucket.positions.length/3,24,'indexed cube has 4 vertices per visible face');
  assert.strictEqual(oneBucket.indices.constructor.name,'Uint16Array');

  const adjacent = await runWorkerMessage(worker, buildMessage(2,[{x:0,y:0,z:0},{x:1,y:0,z:0}]));
  const adjacentBucket = adjacent.chunks[0].lods[0].buckets[0];
  assert.strictEqual(adjacentBucket.indices.length,60,'adjacent cubes hide their shared face');

  const crossChunk = await runWorkerMessage(worker, buildMessage(3,[{x:15,y:0,z:0},{x:16,y:0,z:0}]));
  assert.strictEqual(crossChunk.chunks.length,2,'cross-chunk output creates two chunks');
  assert(crossChunk.chunks.every(c=>c.lods[0].buckets[0].indices.length===30),'cross-chunk boundary culling works');

  const partial = await runWorkerMessage(worker, buildMessage(4,[{x:0,y:0,z:0},{x:16,y:0,z:0}],{targetChunks:['0,0,0']}));
  assert.strictEqual(partial.chunks.length,1,'partial bake emits only requested chunks');
  assert.strictEqual(partial.chunks[0].key,'0,0,0');

  const lod = await runWorkerMessage(worker, buildMessage(5,[{x:0,y:0,z:0},{x:1,y:0,z:0}],{enableLOD:true,lodThreshold:1}));
  assert.strictEqual(lod.stats.lodEnabled,true);
  assert.strictEqual(lod.chunks[0].lods.length,4,'generates 1x/2x/4x/8x detail levels');
  assert(lod.chunks[0].lods[1].buckets[0].indices.length < lod.chunks[0].lods[0].buckets[0].indices.length,'coarse LOD reduces geometry');

  const special = await runWorkerMessage(worker, {
    type:'bake',id:6,layer:0,blocks:[],cubeFaces,descriptors,
    specialTriangles:[{x:17,y:0,z:0,key:'stone',uvMatrix:null,hasUv:true,vertices:[
      {p:[16.1,0.1,0.1],n:[0,1,0],uv:[0,0],c:[1,1,1]},
      {p:[16.9,0.1,0.1],n:[0,1,0],uv:[1,0],c:[1,1,1]},
      {p:[16.5,0.9,0.1],n:[0,1,0],uv:[.5,1],c:[1,1,1]}
    ]}],enableLOD:false
  });
  assert.strictEqual(special.chunks[0].cx,1);
  const specialPos = special.chunks[0].lods[0].buckets[0].positions;
  assert(Math.abs(specialPos[0]-0.1)<1e-5,'special geometry positions are localized to chunk origin');

  const specialLod = await runWorkerMessage(worker, {
    type:'bake',id:7,layer:0,blocks:[],cubeFaces,descriptors,
    specialTriangles:[
      {x:1,y:0,z:0,key:'stone',uvMatrix:null,hasUv:false,vertices:[
        {p:[1.1,0.1,0.1],n:[0,1,0],uv:[0,0],c:[1,1,1]},
        {p:[1.9,0.1,0.1],n:[0,1,0],uv:[1,0],c:[1,1,1]},
        {p:[1.5,0.9,0.1],n:[0,1,0],uv:[.5,1],c:[1,1,1]}
      ]},
      {x:1,y:0,z:0,key:'stone',uvMatrix:null,hasUv:true,vertices:[
        {p:[1.1,0.1,0.2],n:[0,1,0],uv:[0,0],c:[1,1,1]},
        {p:[1.9,0.1,0.2],n:[0,1,0],uv:[1,0],c:[1,1,1]},
        {p:[1.5,0.9,0.2],n:[0,1,0],uv:[.5,1],c:[1,1,1]}
      ]}
    ],enableLOD:true,lodThreshold:1
  });
  assert.strictEqual(specialLod.chunks[0].lods.length,4,'special-only chunk keeps all LOD levels');
  for (const level of specialLod.chunks[0].lods) {
    const bucket = level.buckets[0];
    assert(bucket, 'special geometry remains present in every LOD');
    assert.strictEqual(bucket.uvs.length, (bucket.positions.length/3)*2, 'mixed UV/no-UV triangles keep aligned UV attributes');
  }

  const negative = await runWorkerMessage(worker, buildMessage(8,[{x:-1,y:0,z:0},{x:0,y:0,z:0}]));
  assert.strictEqual(Array.from(negative.chunks, c=>c.key).sort().join('|'), '-1,0,0|0,0,0', 'negative world coordinates map to floor-based chunks');

  const cancelId = 9;
  const cancelBlocks = Array.from({length:2500}, (_, index) => ({
    x:index % 50, y:Math.floor(index / 50), z:0
  }));
  const cancelledResult = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('worker cancellation test timeout')), 5000);
    let requested = false;
    const handler = data => {
      if (data.id !== cancelId) return;
      if (data.type === 'progress' && data.phase === 'index' && !requested) {
        requested = true;
        worker.context.self.onmessage({data:{type:'cancel',id:cancelId}});
      }
      if (data.type === 'error') {
        clearTimeout(timeout);
        worker.removeListener(handler);
        resolve(data);
      } else if (data.type === 'result') {
        clearTimeout(timeout);
        worker.removeListener(handler);
        reject(new Error('cancelled worker unexpectedly returned a result'));
      }
    };
    worker.addListener(handler);
    worker.context.self.onmessage({data:buildMessage(cancelId,cancelBlocks)});
  });
  assert.strictEqual(cancelledResult.name, 'AbortError', 'worker cancellation reports AbortError');
  assert.strictEqual(cancelledResult.message, '模型构建已取消');

  console.log('geometry worker tests: 9/9 passed');
})().catch(error=>{ console.error(error); process.exitCode=1; });
