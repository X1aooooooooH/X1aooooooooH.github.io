export function fileURLToPath(url) {
  try { return new URL(String(url)).pathname; } catch { return String(url); }
}
export default { fileURLToPath };
