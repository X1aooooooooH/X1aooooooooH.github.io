'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/blockflow-special-models.json'), 'utf8'));
const atlasPath = path.join(root, 'assets/textures/structure/blockflow-special-atlas.png');
const threeSource = fs.readFileSync(path.join(root, 'assets/vendor/three-runtime.js'), 'utf8');
const threeContext = vm.createContext({console, Math, Map, Set, Array, Object, Number, String, Boolean, Float32Array, Uint16Array, Uint32Array, Uint8Array});
vm.runInContext(threeSource, threeContext, {timeout: 10000});
const THREE = threeContext.BlockFlowThree.THREE;

function partBounds(part) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<part.p.length;i+=3) for(let a=0;a<3;a++){
    min[a]=Math.min(min[a],part.p[i+a]);max[a]=Math.max(max[a],part.p[i+a]);
  }
  return {min,max};
}
function buildGeometryGroup(key) {
  const entry=data.models[key];assert.ok(entry,`missing model ${key}`);
  const group=new THREE.Group();
  for(const part of [entry.o,entry.x]) if(part){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(part.p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(part.u,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(part.c,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(part.n,3));
    g.setIndex(part.i);g.computeBoundingBox();g.computeBoundingSphere();
    group.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
  }
  return group;
}
function worldBounds(group) { group.updateMatrixWorld(true); return new THREE.Box3().setFromObject(group); }
function wallYawForNormal(normal) { return Math.atan2(normal[2],-normal[0]); }

 test('extracted model library and atlas are self-contained and complete',()=>{
  assert.equal(data.schema,'BlockFlow.SpecialVoxelModels');
  assert.ok(data.modelCount>=420);
  assert.ok(data.textureCount>=50);
  assert.ok(fs.statSync(atlasPath).size>10000);
  for(const [key,entry] of Object.entries(data.models)){
    assert.ok(entry.o||entry.x,`${key} has no geometry`);
    for(const part of [entry.o,entry.x]) if(part){
      assert.equal(part.p.length,part.vc*3,key+' positions');
      assert.equal(part.u.length,part.vc*2,key+' uvs');
      assert.equal(part.c.length,part.vc*3,key+' colors');
      assert.equal(part.n.length,part.vc*3,key+' normals');
      assert.equal(part.i.length,part.ic,key+' indices');
      assert.equal(part.ic%3,0,key+' triangle index count');
      assert.ok(part.i.every(index=>Number.isInteger(index)&&index>=0&&index<part.vc),key+' indices in range');
      assert.ok(part.u.every(value=>Number.isFinite(value)&&value>=0&&value<=1),key+' uv bounds');
      assert.ok(part.p.every(Number.isFinite)&&part.c.every(Number.isFinite)&&part.n.every(Number.isFinite),key+' finite attributes');
    }
  }
});

test('lever variants are anchored on the correct support face, never floating at block centre',()=>{
  const faceChecks={
    up_north_south:['y','min',-.5],up_east_west:['y','min',-.5],
    down_east_west:['y','max',.5],down_north_south:['y','max',.5],
    east:['x','min',-.5],west:['x','max',.5],south:['z','min',-.5],north:['z','max',.5]
  };
  for(const [direction,[axis,edge,expected]] of Object.entries(faceChecks)) for(const state of ['off','on']){
    const bounds=partBounds(data.models[`lever/${direction}/${state}`].o),a='xyz'.indexOf(axis);
    assert.ok(Math.abs(bounds[edge][a]-expected)<1e-5,`${direction}/${state} ${axis}.${edge} should touch ${expected}`);
  }
});

test('standing and hanging signs sit on their supporting block face',()=>{
  for(const wood of ['oak','spruce','birch','jungle','acacia','dark_oak','mangrove','cherry','bamboo','crimson','warped','pale_oak']){
    const standing=partBounds(data.models[`sign/${wood}/standing`].o);
    assert.ok(Math.abs(standing.min[1]+.5)<1e-5,`${wood} standing sign post touches block below`);
    for(const attached of ['free','attached']){
      const hanging=data.models[`sign/${wood}/hanging/${attached}`];assert.ok(hanging?.o,`${wood} hanging ${attached}`);
      assert.ok(Math.abs(partBounds(hanging.o).max[1]-.5)<1e-5,`${wood} hanging top support bound`);
    }
  }
});

test('wall sign and wall torch mounting planes land exactly on all four cell faces',()=>{
  const faces={north:{n:[0,0,-1],axis:'z',edge:'min',value:-.5},south:{n:[0,0,1],axis:'z',edge:'max',value:.5},west:{n:[-1,0,0],axis:'x',edge:'min',value:-.5},east:{n:[1,0,0],axis:'x',edge:'max',value:.5}};
  for(const [face,spec] of Object.entries(faces)){
    for(const key of [`sign/oak/wall/${face}`,'torch/wall/'+face,'redstone/wall_torch/'+face+'/off']){
      const group=buildGeometryGroup(key);group.rotation.y=wallYawForNormal(spec.n);
      const box=worldBounds(group),value=spec.edge==='min'?box.min[spec.axis]:box.max[spec.axis];
      assert.ok(Math.abs(value-spec.value)<1e-4,`${key} mounting plane ${spec.axis}.${spec.edge}=${value}`);
    }
    const wallHanging=buildGeometryGroup(`sign/oak/wall_hanging/${face}/free`);
    wallHanging.rotation.y=wallYawForNormal(spec.n);
    wallHanging.position.set(spec.n[0]*.375,spec.n[1]*.375,spec.n[2]*.375);
    const wallHangingBox=worldBounds(wallHanging),wallHangingValue=spec.edge==='min'?wallHangingBox.min[spec.axis]:wallHangingBox.max[spec.axis];
    assert.ok(Math.abs(wallHangingValue-spec.value)<1e-4,`wall-hanging sign ${face} mounting plane ${spec.axis}.${spec.edge}=${wallHangingValue}`);
  }
});

test('all six stone button models terminate at the corresponding support face',()=>{
  const checks={down:['y','max',.5],up:['y','min',-.5],north:['z','max',.5],south:['z','min',-.5],west:['x','max',.5],east:['x','min',-.5]};
  for(const [face,[axis,edge,expected]] of Object.entries(checks)) for(const state of ['released','pressed']){
    const model=data.models[`button/stone/${face}/${state}`];assert.ok(model?.o);
    const bounds=partBounds(model.o);
    assert.ok(Math.abs(bounds[edge]['xyz'.indexOf(axis)]-expected)<1e-5,`${face}/${state} button mount`);
  }
});

test('repeater and comparator geometry rests on block top and powered UVs use powered textures',()=>{
  for(const face of ['south','west','north','east']) for(let delay=0;delay<4;delay++) for(const state of ['off','on']){
    const key=`redstone/repeater/${face}/delay${delay}/${state}`,model=data.models[key];assert.ok(model?.o,key);
    assert.ok(Math.abs(partBounds(model.o).min[1]+.5)<1e-5,key+' support plane');
  }
  for(const face of ['south','west','north','east']) for(const mode of ['compare','subtract']) for(const state of ['off','on']){
    const key=`redstone/comparator/${face}/${mode}/${state}`,model=data.models[key];assert.ok(model?.o,key);
    assert.ok(Math.abs(partBounds(model.o).min[1]+.5)<1e-5,key+' support plane');
  }
  const repOff=data.models['redstone/repeater/south/delay0/off'].o.u;
  const repOn=data.models['redstone/repeater/south/delay0/on'].o.u;
  const cmpOff=data.models['redstone/comparator/south/compare/off'].o.u;
  const cmpOn=data.models['redstone/comparator/south/compare/on'].o.u;
  assert.notDeepEqual(repOff,repOn,'powered repeater uses repeater_on tile');
  assert.notDeepEqual(cmpOff,cmpOn,'powered comparator uses comparator_on tile');
});

test('model library includes actual torches, redstone wire, tripwire hook and transparent tripwire',()=>{
  for(const key of ['torch/normal','torch/soul','torch/copper','redstone/torch/off','redstone/torch/on','redstone/wire','redstone/tripwire_hook','redstone/tripwire']) assert.ok(data.models[key],key);
  assert.ok(data.models['redstone/tripwire'].x?.t===true,'tripwire should retain transparent geometry');
});


test('standing sign and default lever touch the top of the supporting block after world placement',()=>{
  const worldY=37,blockCenterY=worldY+.5;
  for(const key of ['sign/oak/standing','lever/up_north_south/off','lever/up_east_west/off']){
    const bounds=partBounds(data.models[key].o);
    const placedBottom=bounds.min[1]+blockCenterY;
    assert.ok(Math.abs(placedBottom-worldY)<1e-5,`${key} should rest on support block top at y=${worldY}, got ${placedBottom}`);
  }
  for(const key of ['sign/oak/hanging/free','sign/oak/hanging/attached']){
    const bounds=partBounds(data.models[key].o);
    const placedTop=bounds.max[1]+blockCenterY;
    assert.ok(Math.abs(placedTop-(worldY+1))<1e-5,`${key} should touch the ceiling support block bottom at y=${worldY+1}, got ${placedTop}`);
  }
});
