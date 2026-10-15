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
  assert.match(signModel, /modelAddBox\(host,b,\[boardW,boardH,boardDepth\]/);
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
  assert.match(lever, /DodecahedronGeometry/);
  assert.match(lever, /open_bit.*powered_bit/);
});

test('buttons, repeaters, comparators and redstone dust use solid model geometry', () => {
  const button = section(app, "  }else if(kind==='button'){", "  }else if(kind==='lever'){");
  assert.match(button, /BoxGeometry/);
  assert.match(button, /CylinderGeometry/);
  assert.match(button, /button_pressed_bit/);
  const redstone = section(app, "  }else if(kind==='redstone_device'){", "  }else if(kind==='stairs'){");
  assert.match(redstone, /modelAddMiniRedstoneTorch/);
  const miniTorch = section(app, 'function modelAddMiniRedstoneTorch(', 'function renderAdvancedShape(');
  assert.match(miniTorch, /CylinderGeometry/);
  assert.match(miniTorch, /ConeGeometry/);
  assert.match(redstone, /repeater_delay/);
  assert.match(redstone, /subtract_mode/);
  const wire = section(app, "  if(kind==='redstone_wire'){", '  return false;');
  assert.match(wire, /modelColorMat/);
  assert.match(wire, /addShapeBox/);
  assert.doesNotMatch(wire, /modelTintedTextureMaterial|getShapeTextureMaterial/);
  assert.doesNotMatch(app, /function modelTintedTextureMaterial\(/);
});
