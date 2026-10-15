'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'assets/workers/format.js');
const enginePath = path.join(root, 'assets/workers/format-engine.js');
const workerSource = fs.readFileSync(workerPath, 'utf8');
const messages = [];

const sandbox = {
  console,
  TextEncoder, TextDecoder,
  Uint8Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array,
  Uint8ClampedArray, Float32Array, Float64Array, BigInt64Array,
  ArrayBuffer, DataView, Blob, Response, CompressionStream, DecompressionStream,
  Date, Math, Number, String, Boolean, Object, Array, Map, Set,
  Promise, Error, TypeError, RangeError, RegExp, JSON, BigInt, parseInt, isNaN,
  setTimeout, clearTimeout, URL,
  postMessage: message => messages.push(message)
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.importScripts = (...urls) => {
  for (const url of urls) {
    const file = path.resolve(path.dirname(workerPath), String(url));
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  }
};
vm.createContext(sandbox);
vm.runInContext(workerSource, sandbox, { filename: workerPath });

(async () => {
  const ready = messages.find(message => message.type === 'ready');
  assert.ok(ready, messages.find(message => message.type === 'init-error')?.message || 'worker did not initialize');
  assert.equal(ready.engine, 'BlockFlow JavaScript Format Engine');
  assert.equal(ready.version, 1);

  const engine = sandbox.BlockFlowFormatEngine;
  assert.ok(engine && typeof engine.serializeMcstructure === 'function');
  const sample = {
    size: [1, 1, 1], origin: [0, 0, 0],
    palette: [{ name: 'minecraft:stone', properties: {} }],
    blocks: Int32Array.from([0]), secondary: Int32Array.from([-1]),
    blockEntities: new Map(), entities: [], warnings: []
  };
  const input = engine.serializeMcstructure(sample);
  await sandbox.onmessage({ data: {
    type: 'convert', id: 101, bytes: input,
    targetFormat: 1, name: 'sample.mcstructure'
  } });
  const result = messages.find(message => message.id === 101 && message.type === 'result');
  assert.ok(result, messages.find(message => message.id === 101 && message.type === 'error')?.message || 'worker conversion failed');
  const restored = await engine.parseInput(new Uint8Array(result.out), 'sample.litematic');
  assert.deepEqual(Array.from(restored.size), [1, 1, 1]);
  assert.equal(restored.palette[restored.blocks[0]].name, 'minecraft:stone');

  await sandbox.onmessage({ data: {
    type: 'convert', id: 102, bytes: new Uint8Array([0]),
    targetFormat: 0, name: 'invalid.mcstructure'
  } });
  const bad = messages.find(message => message.id === 102 && message.type === 'error');
  assert.ok(bad, 'malformed input must be rejected');

  assert.equal(/WebAssembly|_core_convert|Emscripten/i.test(workerSource), false,
    'format worker must contain only the BlockFlow JavaScript engine bridge');
  assert.equal(fs.existsSync(path.join(root, 'assets/data/core.wasm')), false,
    'old native converter binary must not be shipped');
  assert.equal(fs.existsSync(path.join(root, 'assets/data/core.wasm.gz')), false,
    'compressed old native converter binary must not be shipped');

  console.log('PASS format Worker initializes the BlockFlow JavaScript engine');
  console.log('PASS Worker converts a Bedrock structure to Litematic and round-trips it');
  console.log('PASS malformed input returns a controlled error');
  console.log('PASS no old native runtime bindings or binary assets remain');
  console.log('SUMMARY 4/4 format Worker tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
