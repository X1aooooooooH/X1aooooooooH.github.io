import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync('index.html', 'utf8');
const meta = html.match(/name="blockflow-build" content="([^"]+)"/)?.[1] || '';
const versions = new Set([...html.matchAll(/\?v=([^"'&]+)/g)].map((match) => match[1]));
const missing = [];
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.js')) files.push(file);
  }
})('src');
for (const file of files) {
  if (file.startsWith(path.join('src', 'data'))) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)) {
    const spec = match[1];
    const version = spec.match(/\?v=([^"'&]+)/)?.[1];
    if (!version) missing.push(file + ' -> ' + spec);
    else versions.add(version);
  }
}
if (missing.length) {
  console.error('internal imports without cache version:', missing);
  process.exit(1);
}
if (versions.size !== 1) {
  console.error('versions are not unique:', [...versions]);
  process.exit(1);
}
const [version] = versions;
if (meta !== version) {
  console.error('build meta does not match assets:', { meta, asset: version });
  process.exit(1);
}
console.log('release marker ok:', meta, '| internal imports:', files.length);
