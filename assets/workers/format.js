/* BlockFlow's independent structure-format worker.
 * All NBT, palette, packed-state and archive conversion is implemented in
 * format-engine.js; this worker only transports data and reports progress.
 */
'use strict';

try {
  importScripts('format-engine.js');
  if (!self.BlockFlowFormatEngine) throw new Error('BlockFlow 格式引擎未能初始化');
  self.postMessage({ type: 'ready', engine: 'BlockFlow JavaScript Format Engine', version: 1 });
} catch (error) {
  self.postMessage({ type: 'init-error', message: error?.message || String(error) });
}

function cropFromName(name) {
  const match = /@\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]~\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/.exec(String(name || ''));
  if (!match) return null;
  const values = match.slice(1).map(Number);
  if (values[3] < values[0] || values[4] < values[1] || values[5] < values[2]) return null;
  return values;
}

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type !== 'convert') return;
  const id = message.id;
  try {
    if (!self.BlockFlowFormatEngine) throw new Error('BlockFlow 格式引擎尚未准备好');
    const bytes = message.bytes instanceof Uint8Array ? message.bytes : new Uint8Array(message.bytes || 0);
    if (!bytes.byteLength) throw new Error('文件为空');
    self.postMessage({ type: 'progress', id, message: '正在使用 BlockFlow 原生格式引擎转换…' });
    const result = await self.BlockFlowFormatEngine.convert(
      bytes,
      Number(message.targetFormat),
      String(message.name || 'structure'),
      message.crop || cropFromName(message.name)
    );
    const out = result.out instanceof Uint8Array ? result.out : new Uint8Array(result.out);
    const transferable = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength ? out : out.slice();
    self.postMessage({
      type: 'result', id,
      out: transferable.buffer,
      bbox: result.bbox || null,
      stats: result.stats || null,
      warnings: result.warnings || [],
      elapsed: result.elapsed || 0
    }, [transferable.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error?.message || String(error) });
  }
};
