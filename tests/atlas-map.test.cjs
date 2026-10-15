const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mapPath = path.join(root, 'assets/data/blockflow-atlas-map.json');
const atlasPath = path.join(root, 'assets/textures/structure/block-atlas.png');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const atlas = fs.readFileSync(atlasPath);
function pngSize(buf) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'valid PNG signature');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
assert.equal(map.format, 'BlockFlow.TextureAtlasMap');
assert.equal(map.schemaVersion, 1);
assert.ok(Number.isInteger(map.width) && Number.isInteger(map.height));
const size = pngSize(atlas);
assert.deepEqual(size, { width: map.width, height: map.height });
const entries = Object.entries(map.textures);
assert.equal(entries.length, 1205);
const unique = new Map();
for (const [id, rect] of entries) {
  assert.ok(Array.isArray(rect) && rect.length === 4, `${id}: rectangle [x,y,w,h]`);
  const [x, y, w, h] = rect;
  assert.ok([x,y,w,h].every(Number.isInteger), `${id}: integer rectangle`);
  assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= map.width && y + h <= map.height, `${id}: in atlas bounds`);
  const key = rect.join(',');
  if (!unique.has(key)) unique.set(key, []);
  unique.get(key).push(id);
}
const rects = [...unique.keys()].map(key => key.split(',').map(Number));
for (let i = 0; i < rects.length; i++) {
  const [ax, ay, aw, ah] = rects[i];
  for (let j = i + 1; j < rects.length; j++) {
    const [bx, by, bw, bh] = rects[j];
    const separated = ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay;
    assert.ok(separated, `texture rectangles ${i} and ${j} overlap`);
  }
}
const app = fs.readFileSync(path.join(root, 'assets/js/structure-app.js'), 'utf8');
assert.ok(app.includes('blockflow-atlas-map.json'));
assert.ok(app.includes('blockflowAtlasMap?.textures'));
assert.ok(!app.includes('legacyAtlasMap'));
assert.ok(!fs.existsSync(path.join(root, 'assets/data/legacy-atlas-map.json')));
console.log(`PASS atlas PNG matches ${map.width}x${map.height} map dimensions`);
console.log(`PASS ${entries.length} texture IDs and ${rects.length} unique rectangles are valid`);
console.log('PASS all unique rectangles are in bounds and non-overlapping');
console.log('PASS BlockFlow loader uses only blockflow-atlas-map.json');
console.log('SUMMARY 4/4 atlas-map tests passed');
