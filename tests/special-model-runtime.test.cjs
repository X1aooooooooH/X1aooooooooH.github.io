'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'assets/js/structure-app.js'), 'utf8');
const threeSource = fs.readFileSync(path.join(root, 'assets/vendor/three-runtime.js'), 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return appSource.slice(start, end);
}

const threeContext = vm.createContext({console, Math, Map, Set, Array, Object, Number, String, Boolean, Float32Array, Uint16Array, Uint32Array, Uint8Array});
vm.runInContext(threeSource, threeContext, {timeout: 10000});
const THREE = threeContext.BlockFlowThree.THREE;

const modelHelpersFactory = new Function('THREE', 'blockRenderName', `
  const threeLib={THREE};
  const specialGeometries=new Set();
  function modelState(block,...keys){for(const key of keys){const value=block?.states?.[key];if(value!==undefined)return value;}return undefined;}
  function modelBool(value){return value===true||value===1||value==='1'||String(value).toLowerCase()==='true';}
  function modelNumber(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
  function modelCardinalYaw(value){return ({north:Math.PI,south:0,east:Math.PI/2,west:-Math.PI/2})[String(value).toLowerCase()]??0;}
  function modelFacingYawFrom16(value){return -((modelNumber(value,0)%16+16)%16)*Math.PI/8;}
  function modelFacingNormal(value,fallback='north'){
    const map={0:[0,-1,0],1:[0,1,0],2:[0,0,-1],3:[0,0,1],4:[-1,0,0],5:[1,0,0],north:[0,0,-1],south:[0,0,1],east:[1,0,0],west:[-1,0,0],up:[0,1,0],down:[0,-1,0]};
    return map[value]||map[String(value).toLowerCase()]||map[fallback];
  }
  function modelColorMat(color,opts={}){return new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,...opts});}
  function modelMat(_alias,_block,opts={}){return modelColorMat(0x777777,opts);}
  function addTrackedMesh(group,geometry,material,position=[0,0,0],rotation=[0,0,0]){
    specialGeometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.userData.blockRef=group.userData.blockRef;group.add(mesh);return mesh;
  }
  ${sourceBetween('function modelAddFaceTexturedBox(', 'function modelAddMetalRivet(')}
  ${sourceBetween('function modelAddMetalRivet(', 'function modelAddCylinder(')}
  ${sourceBetween('function modelResolveLeverPlacement(', 'function addGeometricTorchHead(')}
  ${sourceBetween('function modelAddMiniRedstoneTorch(', 'function renderAdvancedShape(')}
  return {specialGeometries,modelAddFaceTexturedBox,modelResolveLeverPlacement,modelResolveRedstoneDeviceState,modelResolveButtonPlacement,modelResolveSignPlacement,modelBuildButton,addDetailedLeverModel,modelAddMiniRedstoneTorch,modelAddRedstoneDeviceBase,modelAddRedstoneRail,modelAddRedstoneTorchCarrier};
`);
const helpers = modelHelpersFactory(THREE, block => String(block?.name || '').split(':').pop().toLowerCase());

function boundsOf(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function assertFiniteBounds(box) {
  for (const value of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) assert.ok(Number.isFinite(value));
}

test('button physical meshes stay close to each of six block faces', () => {
  const faces = [
    {state:0,axis:'y',sign:-1}, {state:1,axis:'y',sign:1},
    {state:2,axis:'z',sign:-1}, {state:3,axis:'z',sign:1},
    {state:4,axis:'x',sign:-1}, {state:5,axis:'x',sign:1}
  ];
  for (const face of faces) {
    const group = new THREE.Group(); group.userData.blockRef = {};
    const block = {name:'minecraft:stone_button',states:{facing_direction:face.state,button_pressed_bit:false}};
    helpers.modelBuildButton(group, block);
    const bounds = boundsOf(group); assertFiniteBounds(bounds);
    const edge = face.sign > 0 ? bounds.max[face.axis] : -bounds.min[face.axis];
    assert.ok(edge > .55 && edge < .60, `${face.axis} face button projection ${edge}`);
    assert.ok(group.children.length === 1 && group.children[0].children.length >= 11);
  }
});

test('pressed button cap retracts compared with the unpressed cap', () => {
  const build = pressed => {
    const group = new THREE.Group();group.userData.blockRef={};
    helpers.modelBuildButton(group,{name:'minecraft:stone_button',states:{facing_direction:5,button_pressed_bit:pressed}});
    return boundsOf(group).max.x;
  };
  const unpressed=build(false),pressed=build(true);
  assert.ok(unpressed>pressed+.02,`${unpressed} should extend beyond ${pressed}`);
});

test('all lever placements create finite mechanical geometry', () => {
  const states=['down_east_west','east','west','south','north','up_north_south','up_east_west','down_north_south'];
  for(const direction of states){
    const block={name:'minecraft:lever',states:{lever_direction:direction,open_bit:direction==='east'}};
    const group=new THREE.Group();group.userData.blockRef=block;
    const model=helpers.addDetailedLeverModel(group,block);
    const bounds=boundsOf(model);assertFiniteBounds(bounds);
    assert.ok(model.children.length>=10,`${direction} lever should contain plate, fixings and handle`);
  }
});

test('repeater and comparator components assemble into solid geometry', () => {
  for(const kind of ['repeater','comparator']){
    const group=new THREE.Group();group.userData.blockRef={};
    const block={name:`minecraft:${kind}`,states:{repeater_delay:3,output_subtract_bit:true,output_lit_bit:true}};
    helpers.modelAddRedstoneDeviceBase(group,block,kind);
    helpers.modelAddRedstoneRail(group,block,-.005,0x8a3b34);
    if(kind==='comparator'){
      helpers.modelAddRedstoneTorchCarrier(group,block,-.235,-.205,true,'comparator');
      helpers.modelAddRedstoneTorchCarrier(group,block,.235,-.205,true,'comparator');
      helpers.modelAddRedstoneTorchCarrier(group,block,0,.235,true,'comparator');
    }else{
      helpers.modelAddRedstoneTorchCarrier(group,block,0,-.255,false,'repeater');
      helpers.modelAddRedstoneTorchCarrier(group,block,0,.325,true,'repeater');
    }
    const bounds=boundsOf(group);assertFiniteBounds(bounds);
    assert.ok(group.children.length>=6);
  }
});

test('sign board is a solid six-face textured box with independent edge material', () => {
  const group=new THREE.Group();group.userData.blockRef={};
  const mesh=helpers.modelAddFaceTexturedBox(group,group.userData.blockRef,[.94,.56,.065],[0,.16,0],'oak_planks',0x513a2a);
  assert.ok(mesh.geometry.groups.length>=6);
  assert.ok(Array.isArray(mesh.material) && mesh.material.length===6);
  const bounds=boundsOf(group);assertFiniteBounds(bounds);
  assert.ok(Math.abs(bounds.max.y-bounds.min.y-.56)<.001);
});
