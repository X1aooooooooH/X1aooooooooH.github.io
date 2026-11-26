// Minimal POSIX-ish path helpers for the browser skill runtime.
const norm = p => String(p ?? '').replace(/\\/g, '/');
export function dirname(p) {
  const s = norm(p).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i <= 0 ? (i === 0 ? '/' : '.') : s.slice(0, i);
}
export function basename(p) {
  const s = norm(p).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}
export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i);
}
export function join(...parts) {
  const out = [];
  for (const part of parts) {
    if (part == null || part === '') continue;
    out.push(norm(part).replace(/^\/+|\/+$/g, ''));
  }
  return out.join('/').replace(/\/+/g, '/');
}
export function resolve(...parts) {
  let out = '';
  for (const part of parts) {
    if (part == null || part === '') continue;
    const p = norm(part);
    if (p.startsWith('/')) out = p;
    else out = out ? out.replace(/\/+$/, '') + '/' + p : p;
  }
  const stack = [];
  for (const part of out.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return '/' + stack.join('/');
}
export default { dirname, basename, extname, join, resolve };
