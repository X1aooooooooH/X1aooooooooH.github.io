import assert from 'node:assert/strict';

const names = ['catalogue', 'chain', 'format', 'rules', 'syntax', 'tools', 'util'];
for (const name of names) {
  const forward = await import(`../src/skill-runtime/lib/${name}.js`);
  const direct = await import(`../skills/be-cmd/scripts/lib/${name}.js`);
  assert.deepEqual(
    Object.keys(forward).sort(),
    Object.keys(direct).sort(),
    `forwarder ${name}.js exports differ from the real skill module`
  );
}
console.log('skill runtime forwarders ok:', names.join(', '));
