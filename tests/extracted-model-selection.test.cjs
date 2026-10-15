'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../assets/js/structure-app.js'),'utf8');
function between(a,b){const s=source.indexOf(a);assert.notEqual(s,-1,a);const e=source.indexOf(b,s+a.length);assert.notEqual(e,-1,b);return source.slice(s,e);}
const factory=new Function('blockRenderName',`
  function modelState(block,...keys){const states=block?.states||{};for(const key of keys)if(states[key]!==undefined)return states[key];return undefined;}
  function modelBool(v){return v===true||v===1||v==='1'||String(v).toLowerCase()==='true';}
  function modelNumber(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
  function modelFacingYawFrom16(v){return -((modelNumber(v,0)%16+16)%16)*Math.PI/8;}
  function modelCardinalYaw(v,d='south'){const m={north:Math.PI,south:0,west:-Math.PI/2,east:Math.PI/2};return m[String(v??d).toLowerCase()]??0;}
  function modelFacingNormal(v,fallback='north'){const m={0:[0,-1,0],1:[0,1,0],2:[0,0,-1],3:[0,0,1],4:[-1,0,0],5:[1,0,0],north:[0,0,-1],south:[0,0,1],west:[-1,0,0],east:[1,0,0]};return m[v]||m[String(v??'').toLowerCase()]||m[fallback];}
  ${between('function modelResolveSignPlacement(', 'function modelBuildButton(')}
  ${between('function modelResolveRedstoneDeviceState(', 'function modelResolveButtonPlacement(')}
  ${between('function modelExtractedFaceName(', 'function addExtractedSignText(')}
  return {modelExtractedFaceName,modelExtractedDeviceDirection,modelExtractedSignKey,modelExtractedLeverKey,modelExtractedButtonKey,modelExtractedTorchKey};
`);
const pick=factory(block=>String(block?.name||'').split(':').pop().toLowerCase());

test('sign model selector covers standing, wall, hanging and wall-hanging states',()=>{
  assert.equal(pick.modelExtractedSignKey({name:'minecraft:oak_sign',states:{ground_sign_direction:7}}),'sign/oak/standing');
  assert.equal(pick.modelExtractedSignKey({name:'minecraft:spruce_wall_sign',states:{facing_direction:2}}),'sign/spruce/wall/north');
  assert.equal(pick.modelExtractedSignKey({name:'minecraft:cherry_hanging_sign',states:{attached_bit:1}}),'sign/cherry/hanging/attached');
  assert.equal(pick.modelExtractedSignKey({name:'minecraft:mangrove_wall_hanging_sign',states:{facing_direction:4,attached_bit:0}}),'sign/mangrove/wall_hanging/west/free');
});

test('lever selector chooses exact one of eight mount planes and power states',()=>{
  assert.equal(pick.modelExtractedLeverKey({name:'minecraft:lever',states:{lever_direction:5,open_bit:1}}),'lever/up_north_south/on');
  assert.equal(pick.modelExtractedLeverKey({name:'minecraft:lever',states:{lever_direction:'east',open_bit:0}}),'lever/east/off');
  assert.equal(pick.modelExtractedLeverKey({name:'minecraft:lever',states:{}}),'lever/up_north_south/off');
});

test('wood and stone button selectors preserve six face directions and press state',()=>{
  assert.equal(pick.modelExtractedButtonKey({name:'minecraft:oak_button',states:{facing_direction:5,button_pressed_bit:1}}),'button/oak/east/pressed');
  assert.equal(pick.modelExtractedButtonKey({name:'minecraft:polished_blackstone_button',states:{facing_direction:4,button_pressed_bit:0}}),'button/stone/west/released');
});

test('torch selector follows wall orientation and Bedrock redstone lit/unlit mapping',()=>{
  assert.equal(pick.modelExtractedTorchKey({name:'minecraft:wall_torch',states:{facing_direction:4}}),'torch/wall/west');
  assert.equal(pick.modelExtractedTorchKey({name:'minecraft:redstone_wall_torch',states:{facing_direction:2,lit:0}}),'redstone/wall_torch/north/off');
  assert.equal(pick.modelExtractedTorchKey({name:'minecraft:redstone_wall_torch',states:{facing_direction:2,lit:1}}),'redstone/wall_torch/north/on');
  assert.equal(pick.modelExtractedTorchKey({name:'minecraft:redstone_torch',states:{lit:0}}),'redstone/torch/on');
  assert.equal(pick.modelExtractedTorchKey({name:'minecraft:redstone_torch',states:{lit:1}}),'redstone/torch/off');
  assert.equal(pick.modelExtractedTorchKey({name:'minecraft:unlit_redstone_torch',states:{}}),'redstone/torch/on');
});

test('all state-selected sign, lever, button, torch and redstone models exist in the extracted library',()=>{
  const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/data/blockflow-special-models.json'),'utf8'));
  const keys=[
    'sign/oak/standing','sign/spruce/wall/north','sign/cherry/hanging/attached','sign/mangrove/wall_hanging/west/free',
    'lever/up_north_south/on','lever/east/off','button/oak/east/pressed','button/stone/west/released',
    'torch/wall/west','redstone/wall_torch/north/off','redstone/wall_torch/north/on','redstone/torch/on','redstone/torch/off',
    'redstone/repeater/north/delay3/on','redstone/comparator/east/subtract/on','redstone/tripwire_hook/east'
  ];
  for(const key of keys)assert.ok(data.models[key],`missing extracted model ${key}`);
});


test('the extracted mesh path runs before the legacy handcrafted shape fallback',()=>{
  const start=source.indexOf('function makeSpecialBlockObject(');
  const end=source.indexOf('function ',start+20);
  const body=source.slice(start,end<0?undefined:end);
  const extracted=body.indexOf('buildExtractedSpecialBlockModel(group,b,kind)');
  const fallback=body.indexOf('renderAdvancedShape(group,b,kind)');
  const oldMaterialBuild=body.indexOf('buildBlockMaterials(b)');
  assert.ok(extracted>=0&&fallback>extracted,'extracted Dislink mesh must take priority over legacy fallback');
  assert.ok(oldMaterialBuild>extracted,'do not build legacy block materials before extracted models are tried');
});

test('wall-hanging sign installation compensation moves extracted mesh toward its support wall',()=>{
  const body=between('function buildExtractedSpecialBlockModel(', 'function getBlockAtlasBaseTexture');
  assert.match(body,/if\(placement\.wallHanging\)group\.position\.add\(new threeLib\.THREE\.Vector3\(normal\[0\]\*\.375,normal\[1\]\*\.375,normal\[2\]\*\.375\)\)/);
});
