'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative));

function readUleb(buffer, state) {
  let value = 0;
  let shift = 0;
  while (true) {
    assert.ok(state.offset < buffer.length, 'unexpected end of WebAssembly LEB128');
    const byte = buffer[state.offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value >>> 0;
    shift += 7;
    assert.ok(shift <= 35, 'invalid WebAssembly LEB128');
  }
}

function readName(buffer, state) {
  const length = readUleb(buffer, state);
  const end = state.offset + length;
  assert.ok(end <= buffer.length, 'invalid WebAssembly name length');
  const value = buffer.toString('utf8', state.offset, end);
  state.offset = end;
  return value;
}

function getSections(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '0061736d01000000', 'valid WebAssembly v1 header');
  const result = new Map();
  const state = { offset: 8 };
  while (state.offset < bytes.length) {
    const id = bytes[state.offset++];
    const size = readUleb(bytes, state);
    const start = state.offset;
    const end = start + size;
    assert.ok(end <= bytes.length, `section ${id} exceeds module size`);
    result.set(id, bytes.subarray(start, end));
    state.offset = end;
  }
  return result;
}

function parseExportNames(section) {
  const state = { offset: 0 };
  const count = readUleb(section, state);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const name = readName(section, state);
    const kind = section[state.offset++];
    const index = readUleb(section, state);
    entries.push({ name, kind, index });
  }
  assert.equal(state.offset, section.length, 'export section must be fully parsed');
  return entries;
}

function parseCodeBodies(section, importedFunctionCount) {
  const state = { offset: 0 };
  const count = readUleb(section, state);
  const bodies = new Map();
  for (let i = 0; i < count; i++) {
    const bodySize = readUleb(section, state);
    const end = state.offset + bodySize;
    assert.ok(end <= section.length, `function body ${i} exceeds code section`);
    bodies.set(importedFunctionCount + i, section.subarray(state.offset, end));
    state.offset = end;
  }
  assert.equal(state.offset, section.length, 'code section must be fully parsed');
  return bodies;
}

function parseImportedFunctionCount(section) {
  const state = { offset: 0 };
  const count = readUleb(section, state);
  let functions = 0;
  for (let i = 0; i < count; i++) {
    readName(section, state);
    readName(section, state);
    const kind = section[state.offset++];
    if (kind === 0) {
      readUleb(section, state);
      functions++;
    } else if (kind === 1) {
      state.offset++; // element type
      const flags = readUleb(section, state);
      readUleb(section, state);
      if (flags & 1) readUleb(section, state);
    } else if (kind === 2) {
      const flags = readUleb(section, state);
      readUleb(section, state);
      if (flags & 1) readUleb(section, state);
    } else if (kind === 3) {
      state.offset += 2;
    } else {
      assert.fail(`unsupported WebAssembly import kind ${kind}`);
    }
  }
  assert.equal(state.offset, section.length, 'import section must be fully parsed');
  return functions;
}

function walkFiles(directory) {
  const entries = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) entries.push(...walkFiles(full));
    else entries.push(full);
  }
  return entries;
}

const raw = read('assets/data/core.wasm');
const packed = zlib.gunzipSync(read('assets/data/core.wasm.gz'));
assert.deepEqual(packed, raw, 'compressed and raw conversion engines must be byte-identical');

const marker = Buffer.from([68, 105, 115, 108, 105, 110, 107]).toString('utf8').toLowerCase();
const runtimeFiles = walkFiles(root).filter(file => !file.includes(`${path.sep}tests${path.sep}`));
const markerHits = runtimeFiles.filter(file => fs.readFileSync(file).toString('latin1').toLowerCase().includes(marker));
assert.deepEqual(markerHits, [], 'runtime source and resources must not contain the removed third-party marker');

const wasmModule = new WebAssembly.Module(raw);
const sections = getSections(raw);
const exportEntries = parseExportNames(sections.get(7));
const actualExportNames = exportEntries.map(entry => entry.name).sort();
const expectedExportNames = ['$', '_', 'Sa', 'Ta', 'aa', 'ba', 'ca', 'da', 'i', 'ka'].sort();
assert.deepEqual(actualExportNames, expectedExportNames, 'only format-conversion and memory allocator exports may remain');
assert.equal(exportEntries.filter(entry => entry.kind === 0).length, 9, 'exactly nine function exports must remain');
assert.equal(exportEntries.find(entry => entry.name === 'i')?.kind, 2, 'linear memory remains exported');

const manifest = JSON.parse(read('tests/wasm-prune-manifest.json').toString('utf8'));
assert.equal(Object.keys(manifest.removed_exports).length, 59, 'all former non-conversion exports must be detached');
assert.equal(manifest.stubbed_function_count, 128, 'all functions outside the retained conversion call closure must be neutralized');
assert.equal(manifest.stubbed_legacy_api_exclusive_count, 95, 'all exclusive old API function bodies must be neutralized');
const importedFunctionCount = parseImportedFunctionCount(sections.get(2));
const bodies = parseCodeBodies(sections.get(10), importedFunctionCount);
for (const functionIndex of manifest.stubbed_function_indices) {
  assert.deepEqual(
    [...bodies.get(functionIndex)],
    [0x00, 0x00, 0x0b],
    `exclusive legacy function ${functionIndex} must be an unreachable stub`
  );
}

// Instantiate the actual post-prune module and exercise the retained allocator API.
const imports = { a: {} };
for (const item of WebAssembly.Module.imports(wasmModule)) {
  imports[item.module][item.name] = () => 0;
}
const instance = new WebAssembly.Instance(wasmModule, imports);
const memory = instance.exports.i;
assert.ok(memory instanceof WebAssembly.Memory, 'WASM linear memory remains available');
const pointer = instance.exports.Ta(64);
assert.ok(pointer > 0 && pointer + 64 <= memory.buffer.byteLength, 'retained allocator returns a valid memory range');
new Uint8Array(memory.buffer, pointer, 8).set([0, 1, 2, 3, 4, 5, 6, 7]);
const conversionResult = instance.exports.aa(pointer, 8, 0);
assert.equal(conversionResult, 0, 'format converter rejects malformed input without trapping');
const errorPointer = instance.exports.da();
assert.ok(errorPointer > 0 && errorPointer < memory.buffer.byteLength, 'format converter retains its error-reporting API');
const errorView = new Uint8Array(memory.buffer);
let errorEnd = errorPointer;
while (errorEnd < memory.buffer.byteLength && errorView[errorEnd] !== 0) errorEnd++;
assert.ok(errorEnd > errorPointer, 'format converter returns a readable diagnostic for malformed input');
instance.exports.Sa(pointer);

const formatWorker = read('assets/workers/format.js').toString('utf8');
for (const oldBinding of [
  '_core_region_count', '_core_vertex_count', '_core_positions_ptr',
  '_core_indices_ptr', '_core_cmd_open', '_core_build', '_core_sp_open',
  '_core_sp_next', '_core_sp_opaque_data_ptr', '_core_sp_trans_data_ptr'
]) {
  assert.equal(formatWorker.includes(oldBinding), false, `format worker must not bind ${oldBinding}`);
}
for (const retainedBinding of [
  '_core_convert_name', '_core_convert_bbox', '_core_convert',
  '_core_convert_size', '_core_convert_ptr', '_core_convert_error',
  '_core_convert_crop', '_malloc', '_free'
]) {
  assert.ok(formatWorker.includes(retainedBinding), `format worker must bind ${retainedBinding}`);
}

assert.equal(fs.existsSync(path.join(root, 'assets/workers/blockmesh.js')), false, 'old geometry worker must be removed');
assert.equal(fs.existsSync(path.join(root, 'assets/data/models.bin')), false, 'old baked-model binary must be removed');
assert.equal(fs.existsSync(path.join(root, 'assets/data/structure-model-registry.json')), false, 'old baked-model registry must be removed');
assert.ok(read('assets/js/worker-factory.js').toString('utf8').includes("format:'format.js'"), 'format worker remains registered');
assert.ok(read('StructureEditor/index.html').toString('utf8').includes('blockflow-baker.js'), 'structure editor must load the independent BlockFlow baker');

console.log('PASS compressed and uncompressed WASM copies are identical');
console.log('PASS no removed third-party marker is present in runtime files');
console.log('PASS WASM compiles and exposes only the 9 retained conversion/allocator functions plus memory');
console.log('PASS 59 old public API exports are removed');
console.log('PASS 128 non-conversion-reachable function bodies are replaced with unreachable stubs, including all 95 old API-exclusive functions');
console.log('PASS retained allocator and format-conversion error path work after module instantiation');
console.log('PASS format worker binds only retained conversion APIs');
console.log('PASS old model worker and pre-baked model resources are absent');
console.log('PASS StructureEditor loads the independent BlockFlow baker');
console.log('SUMMARY 9/9 WASM boundary checks passed');
