'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/structure-app.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'assets/js/structure-core.js'), 'utf8');
const editorHtml = fs.readFileSync(path.join(root, 'StructureEditor/index.html'), 'utf8');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source boundary: ${endMarker}`);
  return source.slice(start, end);
}

test('Structure Editor exposes MCStructure-only import/export', () => {
  assert.match(editorHtml, /accept="\.mcstructure"/);
  assert.match(editorHtml, /导入 MCStructure/);
  assert.match(editorHtml, /导出 MCStructure/);
  assert.match(app, /\/\\\.mcstructure\$\/i\.test/);
  assert.match(app, /仅支持导入 \.mcstructure/);
  assert.match(app, /\.mcstructure`/);
  assert.doesNotMatch(app, /sourceFormat/);
  assert.doesNotMatch(core, /\.litematic|\.schematic|\.schem|\.wsmr|\.bdx|\.mcworld|\.mcpack|\.mcaddon|\.mca/);
});

test('alternate format conversion implementation and worker entries are absent', () => {
  for (const relative of [
    'assets/js/format-adapter.js',
    'assets/workers/format.js',
    'assets/workers/format-engine.js',
    'tests/format-engine.test.cjs',
    'tests/format-worker.test.cjs'
  ]) assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} must be removed`);
  const factory = fs.readFileSync(path.join(root, 'assets/js/worker-factory.js'), 'utf8');
  assert.doesNotMatch(factory, /format/);
});

test('signs are physical 3D boards with front/back text geometry', () => {
  const matcher = section(app, 'function shapeKindForBlock(', 'function getShapeTextureMaterial(');
  assert.match(matcher, /n\.endsWith\('_sign'\)/);
  const signNbt = section(app, 'function readSignFaceData(', 'function createSignPixelTextGeometry(');
  assert.match(signNbt, /FrontText/);
  assert.match(signNbt, /BackText/);
  assert.match(signNbt, /Text1/);
  const textGeometry = section(app, 'function createSignPixelTextGeometry(', 'function addSignFaceText(');
  assert.match(textGeometry, /new THREE\.BufferGeometry\(\)/);
  assert.match(textGeometry, /geometry\.setIndex\(indices\)/);
  assert.match(textGeometry, /pushBox/);
  const signModel = section(app, "  if(kind==='sign'){", "  if(kind==='banner'){");
  assert.match(signModel, /modelAddFaceTexturedBox\(host,b,\[boardW,boardH,boardDepth\]/);
  assert.match(signModel, /addSignFaceText\([^;]+,'front'\)/);
  assert.match(signModel, /addSignFaceText\([^;]+,'back'\)/);
  assert.match(signModel, /TorusGeometry|modelAddStick/);
});

test('torches and lever are built from stateful 3D geometry rather than atlas sprites', () => {
  const torchBuilder = section(app, 'function addGeometricTorchHead(', 'function modelFacingYawFrom16(');
  assert.match(torchBuilder, /CylinderGeometry/);
  assert.match(torchBuilder, /ConeGeometry/);
  assert.match(torchBuilder, /if\(redstone&&!lit\)/);
  assert.match(torchBuilder, /modelColorMat/);
  const torchPath = section(app, "  if(kind==='torch'){", "  }else if(kind==='button'){");
  assert.match(torchPath, /addGeometricTorchHead\(torchBody,b/);
  assert.doesNotMatch(torchPath, /flameAlias|modelMat\(/);
  const lever = section(app, 'function addDetailedLeverModel(', 'function addGeometricTorchHead(');
  assert.match(lever, /BoxGeometry/);
  assert.match(lever, /CylinderGeometry/);
  assert.match(lever, /SphereGeometry/);
  assert.match(lever, /modelResolveLeverPlacement/);
  assert.match(lever, /modelResolveLeverPlacement/);
  const leverState = section(app, 'function modelResolveLeverPlacement(', 'function addDetailedLeverModel(');
  assert.match(leverState, /open_bit.*powered_bit/);
});

test('buttons, repeaters, comparators and redstone dust use solid model geometry', () => {
  const button = section(app, "  }else if(kind==='button'){", "  }else if(kind==='lever'){");
  assert.match(button, /BoxGeometry/);
  assert.match(button, /CylinderGeometry/);
  assert.match(button, /button_pressed_bit/);
  const redstone = section(app, "  }else if(kind==='redstone_device'){", "  }else if(kind==='stairs'){");
  assert.match(redstone, /modelAddRedstoneTorchCarrier/);
  assert.match(redstone, /modelAddRedstoneRail/);
  assert.match(redstone, /modelResolveRedstoneDeviceState/);
  const miniTorch = section(app, 'function modelAddMiniRedstoneTorch(', 'function renderAdvancedShape(');
  assert.match(miniTorch, /CylinderGeometry/);
  assert.match(miniTorch, /ConeGeometry/);
  assert.match(redstone, /deviceState\.delay/);
  const redstoneState = section(app, 'function modelResolveRedstoneDeviceState(', 'function addDetailedLeverModel(');
  assert.match(redstoneState, /repeater_delay/);
  assert.match(redstoneState, /subtract_mode/);
  const wire = section(app, "  if(kind==='redstone_wire'){", '  return false;');
  assert.match(wire, /modelColorMat/);
  assert.match(wire, /addShapeBox/);
  assert.doesNotMatch(wire, /modelTintedTextureMaterial|getShapeTextureMaterial/);
  assert.doesNotMatch(app, /function modelTintedTextureMaterial\(/);
});


test('lever placement resolver covers all eight Bedrock mount states and power state', () => {
  const source = section(app, 'function modelResolveLeverPlacement(', 'function addDetailedLeverModel(');
  const resolve = new Function('modelState', 'modelNumber', 'modelBool', `${source}; return modelResolveLeverPlacement;`)(
    (block, ...keys) => { for (const key of keys) if (block.states[key] !== undefined) return block.states[key]; },
    (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    value => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
  );
  const states = ['down_east_west','east','west','south','north','up_north_south','up_east_west','down_north_south'];
  const resolved = states.map(value => resolve({states:{lever_direction:value,open_bit:false}}));
  assert.equal(new Set(resolved.map(item => item.mountNormal.join(','))).size, 6);
  assert.equal(new Set(resolved.map(item => item.hingeAxis.join(','))).size, 2);
  assert.ok(resolved.every(item => item.powered === false));
  assert.equal(resolve({states:{lever_direction:'up_east_west',open_bit:true}}).powered, true);
  assert.deepEqual(resolve({states:{lever_direction:7}}).mountNormal, [0,-1,0]);
});


test('button resolver covers all six Bedrock mount faces and pressed/material variants', () => {
  const source = section(app, 'function modelResolveButtonPlacement(', 'function modelResolveSignPlacement(');
  const resolve = new Function('blockRenderName', 'modelState', 'modelFacingNormal', 'modelBool', `${source}; return modelResolveButtonPlacement;`)(
    block => String(block.name || '').split(':').pop(),
    (block, ...keys) => { for (const key of keys) if (block.states[key] !== undefined) return block.states[key]; },
    value => ({0:[0,-1,0],1:[0,1,0],2:[0,0,-1],3:[0,0,1],4:[-1,0,0],5:[1,0,0]})[Number(value)] || [0,0,-1],
    value => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
  );
  const expected = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
  for (let face = 0; face < 6; face++) {
    assert.deepEqual(resolve({name:'minecraft:stone_button',states:{facing_direction:face,button_pressed_bit:face===5}}).normal, expected[face]);
  }
  assert.equal(resolve({name:'minecraft:oak_button',states:{facing_direction:2}}).wooden,true);
  assert.equal(resolve({name:'minecraft:polished_blackstone_button',states:{facing_direction:2}}).wooden,false);
  assert.equal(resolve({name:'minecraft:stone_button',states:{facing_direction:2,button_pressed_bit:true}}).pressed,true);
  const buttonModel = section(app, 'function modelBuildButton(', 'function addDetailedLeverModel(');
  assert.match(buttonModel, /mount\.position\.set\(normal\[0\]\*\.485,normal\[1\]\*\.485,normal\[2\]\*\.485\)/);
  assert.match(buttonModel, /capCenter=pressed\?\.061:\.074/);
  const activeBranch = section(app, "  if(kind==='button'){", "  if(kind==='lever')");
  assert.match(activeBranch, /modelBuildButton\(group,b,modelResolveButtonPlacement\(b\)\)/);
});

test('sign placement resolver covers standing rotation, wall facing and hanging attachment', () => {
  const source = section(app, 'function modelResolveSignPlacement(', 'function addDetailedLeverModel(');
  const resolve = new Function('blockRenderName', 'modelState', 'modelBool', 'modelFacingYawFrom16', 'modelCardinalYaw', 'modelFacingNormal', `${source}; return modelResolveSignPlacement;`)(
    block => String(block.name || '').split(':').pop(),
    (block, ...keys) => { for (const key of keys) if (block.states[key] !== undefined) return block.states[key]; },
    value => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true',
    value => -((Number(value)||0)%16)*Math.PI/8,
    value => ({north:Math.PI,south:0,east:Math.PI/2,west:-Math.PI/2})[String(value).toLowerCase()] ?? 0,
    value => ({0:[0,-1,0],1:[0,1,0],2:[0,0,-1],3:[0,0,1],4:[-1,0,0],5:[1,0,0]})[Number(value)] || [0,0,-1]
  );
  const rotations = Array.from({length:16},(_,ground_sign_direction)=>resolve({name:'minecraft:oak_standing_sign',states:{ground_sign_direction}}).yaw);
  assert.equal(new Set(rotations.map(value=>value.toFixed(6))).size,16);
  const wall = resolve({name:'minecraft:oak_wall_sign',states:{facing_direction:5}});
  assert.equal(wall.wall,true); assert.deepEqual(wall.normal,[1,0,0]);
  const hanging = resolve({name:'minecraft:oak_hanging_sign',states:{ground_sign_direction:7,attached_bit:true}});
  assert.equal(hanging.hanging,true); assert.equal(hanging.attached,true); assert.equal(hanging.yaw, -7*Math.PI/8);
});

test('repeater and comparator state resolver preserves delay, mode and output state', () => {
  const source = section(app, 'function modelResolveRedstoneDeviceState(', 'function addDetailedLeverModel(');
  const resolve = new Function('modelState', 'modelNumber', 'modelBool', `${source}; return modelResolveRedstoneDeviceState;`)(
    (block, ...keys) => { for (const key of keys) if (block.states[key] !== undefined) return block.states[key]; },
    (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    value => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
  );
  for (let delay = 0; delay <= 3; delay++) {
    const state = resolve({name:'minecraft:unpowered_repeater',states:{repeater_delay:delay,direction:2}});
    assert.equal(state.kind,'repeater'); assert.equal(state.delay,delay); assert.equal(state.powered,false);
  }
  const comparator = resolve({name:'minecraft:unpowered_comparator',states:{output_subtract_bit:true,output_lit_bit:true}});
  assert.equal(comparator.kind,'comparator'); assert.equal(comparator.subtract,true); assert.equal(comparator.powered,true);
});

test('redstone geometry includes independent tracks, posts, selector and connected ramps', () => {
  const helpers = section(app, 'function modelAddMiniRedstoneTorch(', 'function renderAdvancedShape(');
  assert.match(helpers, /function modelAddRedstoneDeviceBase/);
  assert.match(helpers, /function modelAddRedstoneRail/);
  assert.match(helpers, /function modelAddRedstoneTorchCarrier/);
  const device = section(app, "  }else if(kind==='redstone_device'){", "  }else if(kind==='stairs'){");
  assert.match(device, /delay\*\.075/);
  assert.match(device, /subtract\?/);
  assert.match(device, /output/);
  const wire = section(app, "  if(kind==='redstone_wire'){", '  return false;');
  assert.match(wire, /const addRibbon=/);
  assert.match(wire, /mode==='up'\|\|mode==='tall'/);
});
