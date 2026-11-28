import assert from 'node:assert/strict';
import * as core from '../src/core/broken-chain.js';
import * as skill from '../skills/be-cmd/scripts/lib/chain.js';

const rotations = [
  ['/execute if block ~1 ~2 ~3 stone run fill ~ ~ ~ ~5 ~5 ~5 stone', 4],
  ['/fill ~ ~ ~ ~1 ~1 ~1 stone', 3],
  ['/setblock ~~~-1 chain_command_block', 4],
  ['/fill ~~~ ~~~1 ~~~2 stone', 5]
];
for (const [cmd, facing] of rotations) {
  assert.equal(
    skill.rotateRelativeCoordinateTriples(cmd, facing),
    core.rotateRelativeCoordinateTriples(cmd, facing),
    'rotation drift: ' + cmd
  );
}

assert.equal(skill.isSetblockMarker('/setblock ~~~-1 Chain_Command_Block', 'first'), true);
assert.equal(core.startsCommand('/fooXbar', 'foo.bar'), false, 'core command regex must escape dots');
assert.equal(core.startsCommand('/foo.bar', 'foo.bar'), true);
for (const impl of [core, skill]) {
  const empty = impl.detectSelfClosedCycles(new Map());
  assert.ok(Array.isArray(empty), 'cycle detection must return a tuple');
  assert.deepEqual(empty.cycles, []);
  assert.equal(empty.keys.size, 0);
}
const conditions = [
  { key: 'head', cmd: '/testfor @a', cond: 0, facing: 2 },
  { key: 'first', cmd: '/setblock ~~~-1 chain_command_block', cond: 0, facing: 2 },
  { key: 'second', cmd: '/setblock ~~~ chain_command_block', cond: 0, facing: 2 }
];
skill.normalizeBrokenChainBlocks(conditions, { kind: 'testfor', direction: 2, facingMap: new Map() });
assert.equal(conditions[1].cond, 1, 'default applyCondition must set the testfor marker');
assert.equal(conditions[2].cond, 0);
assert.doesNotThrow(() => skill.findBrokenSetblockIndexes([null, '/setblock ~~~ chain_command_block']));
assert.equal(
  skill.brokenKindFromBlocks([
    { cmd: '/execute as @a run fill ~ ~ ~ ~1 ~1 ~1 stone' },
    { cmd: '/say ordinary' }
  ]),
  null,
  'unmarked chain must not be classified as broken'
);
assert.equal(
  skill.isBrokenChainPlaceholder(['', '/setblock ~~~ chain_command_block', '/setblock ~~~ chain_command_block']),
  true,
  'placeholder must accept string commands'
);

const original = '/fill ~1 ~ ~ ~2 ~ ~ stone';
const marker = { key: 'marker', cmd: '/setblock ~~~-1 chain_command_block', facing: 2, is_broken_normalized: false };
const body = { key: 'body', cmd: original, facing: 3, is_broken_normalized: false };
skill.normalizeBrokenChainBlocks([marker, body], {
  kind: 'execute',
  direction: 4,
  facingMap: new Map([['marker', 4]])
});
assert.equal(
  body.cmd,
  skill.rotateRelativeCoordinateTriples(original, 3),
  'chain body must rotate with its own facing, not the head direction'
);

console.log('skill chain checks passed');
