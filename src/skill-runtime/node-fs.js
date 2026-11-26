// Browser shim for the small read-only part of node:fs used by be-cmd's
// syntax.js / format.js. ID files are preloaded by skill-ids-data.js.
const FILES = (typeof window !== 'undefined' && window.__BE_CMD_IDS__) || {};
const baseName = file => String(file ?? '').replace(/\\/g, '/').split('/').pop();

export function readFileSync(file) {
  const name = baseName(file);
  if (Object.prototype.hasOwnProperty.call(FILES, name)) return FILES[name];
  throw new Error('浏览器运行时未预加载文件：' + name);
}

export function existsSync(file) {
  return Object.prototype.hasOwnProperty.call(FILES, baseName(file));
}

export function writeFileSync() {
  throw new Error('浏览器运行时不允许写文件');
}

export function mkdirSync() {}
export function readdirSync() { return Object.keys(FILES); }

export default { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync };
