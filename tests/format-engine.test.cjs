'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/workers/format-engine.js'), 'utf8');
const context = {
  TextEncoder, TextDecoder, Uint8Array, Int8Array, Uint16Array, Int16Array,
  Int32Array, Uint32Array, BigInt64Array, ArrayBuffer, DataView, Blob, Response,
  CompressionStream, DecompressionStream, Date, Math, Number, String, Boolean,
  Object, Array, Map, Set, Promise, Error, TypeError, RangeError, RegExp,
  JSON, BigInt, console
};
context.self = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'format-engine.js' });

function tag(type, value) { return { type, value }; }
function commandEntity(command) {
  return tag(10, { block_entity_data: tag(10, {
    Command: tag(8, command), CustomName: tag(8, 'BlockFlow test'),
    TickDelay: tag(3, 4), auto: tag(1, 1), TrackOutput: tag(1, 1)
  }) });
}

(async () => {
  const engine = context.BlockFlowFormatEngine;
  assert.ok(engine && typeof engine.convert === 'function');

  const sample = {
    size: [2, 2, 2], origin: [4, 5, 6],
    palette: [
      { name: 'minecraft:air', properties: {} },
      { name: 'minecraft:stone', properties: {} },
      { name: 'minecraft:chain_command_block', properties: { facing_direction: '2', conditional: 'true' } }
    ],
    blocks: Int32Array.from([0, 1, 2, 1, 0, 2, 1, 0]),
    secondary: new Int32Array(8).fill(-1),
    blockEntities: new Map([[2, commandEntity('say blockflow')]]),
    entities: [], warnings: []
  };

  const mcstructure = engine.serializeMcstructure(sample);
  const parsedBedrock = engine.parseMcstructure(mcstructure);
  assert.deepEqual(Array.from(parsedBedrock.size), [2, 2, 2]);
  assert.deepEqual(Array.from(parsedBedrock.blocks), Array.from(sample.blocks));
  assert.equal(parsedBedrock.palette[1].name, 'minecraft:stone');
  assert.equal(parsedBedrock.palette[2].name, 'minecraft:chain_command_block');
  assert.ok(parsedBedrock.blockEntities.has(2));
  console.log('PASS Bedrock NBT parse/serialize preserves dimensions, palette, blocks and block entities');

  for (const [formatId, extension] of [[1, 'litematic'], [2, 'schem'], [3, 'wsmr'], [5, 'schematic']]) {
    const converted = await engine.convert(mcstructure, formatId, 'roundtrip.mcstructure');
    assert.ok(converted.out instanceof Uint8Array && converted.out.length > 0, `${extension} output must be generated`);
    const restored = await engine.parseInput(converted.out, `roundtrip.${extension}`);
    assert.deepEqual(Array.from(restored.size), [2, 2, 2], `${extension} dimensions`);
    assert.deepEqual(Array.from(restored.blocks), Array.from(sample.blocks), `${extension} block order and indices`);
    assert.equal(restored.palette[1].name, 'minecraft:stone', `${extension} palette state`);
    assert.ok(restored.blockEntities.has(2), `${extension} command block entity`);
    const entityNode = restored.blockEntities.get(2);
    const commandNode = entityNode?.value?.Command || entityNode?.value?.block_entity_data?.value?.Command;
    assert.equal(commandNode?.value, 'say blockflow', `${extension} command text`);
    console.log(`PASS mcstructure -> ${extension} -> canonical round trip`);
  }

  const toSchem = await engine.convert(mcstructure, 2, 'roundtrip.mcstructure');
  const schemBack = await engine.parseInput(toSchem.out, 'roundtrip.schem');
  const javaCommand = schemBack.blockEntities.get(2);
  assert.equal(javaCommand.value.Command.value, 'say blockflow');
  assert.equal(javaCommand.value.id.value, 'minecraft:command_block');
  const backToBedrock = engine.serializeMcstructure(schemBack);
  const bedrockAgain = engine.parseMcstructure(backToBedrock);
  const bedrockCommand = bedrockAgain.blockEntities.get(2).value.block_entity_data.value;
  assert.equal(bedrockCommand.Command.value, 'say blockflow');
  assert.equal(bedrockCommand.LPCommandMode.value, 2);
  assert.equal(bedrockCommand.conditionalMode.value, 1);
  console.log('PASS command block NBT conversion between Bedrock and Java formats');

  const bdxParts = [
    new TextEncoder().encode('BDX\0'),
    new TextEncoder().encode('BlockFlow clean-room test\0'),
    Uint8Array.of(1), new TextEncoder().encode('minecraft:stone\0'),
    Uint8Array.of(1), new TextEncoder().encode('{}\0'),
    Uint8Array.of(5, 0, 0, 0, 1, 0x58, 0x45)
  ];
  const bdxLength = bdxParts.reduce((sum, part) => sum + part.length, 0);
  const bdx = new Uint8Array(bdxLength);
  let bdxOffset = 0;
  for (const part of bdxParts) { bdx.set(part, bdxOffset); bdxOffset += part.length; }
  const parsedBdx = await engine.parseInput(bdx, 'simple.bdx');
  assert.deepEqual(Array.from(parsedBdx.size), [1, 1, 1]);
  assert.equal(parsedBdx.palette[parsedBdx.blocks[0]].name, 'minecraft:stone');
  assert.ok(parsedBdx.warnings.some(warning => warning.includes('BDX 作者字段')));
  console.log('PASS uncompressed BDX string pool and block placement import');

  const bdxCommandParts = [
    new TextEncoder().encode('BDX\0'), new TextEncoder().encode('Command test\0'),
    Uint8Array.of(1), new TextEncoder().encode('minecraft:chain_command_block\0'),
    Uint8Array.of(1), new TextEncoder().encode('{}\0'),
    Uint8Array.of(27, 0, 0, 0, 0),
    Uint8Array.of(0, 0, 0, 2), new TextEncoder().encode('say bdx\0'),
    new TextEncoder().encode('BlockFlow\0'), new TextEncoder().encode('\0'),
    Uint8Array.of(0, 0, 0, 0), Uint8Array.of(0, 1, 1, 0),
    Uint8Array.of(0x58, 0x45)
  ];
  const commandLength = bdxCommandParts.reduce((sum, part) => sum + part.length, 0);
  const bdxCommand = new Uint8Array(commandLength);
  let commandOffset = 0;
  for (const part of bdxCommandParts) { bdxCommand.set(part, commandOffset); commandOffset += part.length; }
  const parsedBdxCommand = await engine.parseInput(bdxCommand, 'command.bdx');
  const bdxEntity = parsedBdxCommand.blockEntities.get(0).value.block_entity_data.value;
  assert.equal(bdxEntity.Command.value, 'say bdx');
  assert.equal(bdxEntity.LPCommandMode.value, 2);
  assert.equal(bdxEntity.conditionalMode.value, 1);
  console.log('PASS BDX command-block payload maps into Bedrock block-entity data');

  function makeStoredZip(fileName, payload) {
    const name = new TextEncoder().encode(fileName);
    const data = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    central.set(name, 46);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, 1, true);
    endView.setUint16(10, 1, true);
    endView.setUint32(12, central.length, true);
    endView.setUint32(16, local.length, true);
    const zip = new Uint8Array(local.length + central.length + end.length);
    zip.set(local, 0); zip.set(central, local.length); zip.set(end, local.length + central.length);
    return zip;
  }
  const pack = makeStoredZip('structures/demo.mcstructure', mcstructure);
  const packedStructure = await engine.parseInput(pack, 'demo.mcpack');
  assert.deepEqual(Array.from(packedStructure.blocks), Array.from(sample.blocks));
  const worldPackStructure = await engine.parseInput(pack, 'demo.mcworld');
  assert.deepEqual(Array.from(worldPackStructure.blocks), Array.from(sample.blocks));
  console.log('PASS ZIP, MCPack and embedded-MCStructure container import');

  const badNbt = new Uint8Array([0]);
  await assert.rejects(engine.parseInput(badNbt, 'broken.mcstructure'), /NBT|根标签|完整/);
  await assert.rejects(engine.convert(mcstructure, 6, 'roundtrip.mcstructure'), /LevelDB/);
  console.log('PASS malformed input and unsupported LevelDB output fail safely');
  console.log('SUMMARY 10/10 format-engine tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
