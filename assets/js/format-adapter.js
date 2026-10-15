
/* Public format-adapter API. Each converter is callable independently by the editor. */
(() => {
  'use strict';
  const OUTPUT_FORMATS = Object.freeze([
    { id: 0, key: 'mcstructure', ext: '.mcstructure', label: 'Mcstructure（基岩版）' },
    { id: 1, key: 'litematic', ext: '.litematic', label: 'Litematic（Litematica）' },
    { id: 2, key: 'schem', ext: '.schem', label: 'Schem（Sponge / WorldEdit）' },
    { id: 3, key: 'wsmr', ext: '.wsmr', label: 'WSMR（中间格式）' },
    { id: 4, key: 'bdx', ext: '.bdx', label: 'BDX（基岩版）' },
    { id: 5, key: 'schematic', ext: '.schematic', label: 'Schematic（MCEdit 旧版）' },
    { id: 6, key: 'mcworld', ext: '.mcworld', label: 'Mcworld（基岩版世界）' }
  ]);
  const INPUT_EXTENSIONS = Object.freeze(['.mcstructure','.litematic','.schem','.wsmr','.bdx','.schematic','.nbt','.mca','.mcworld','.mcpack','.mcaddon','.zip']);
  const FORMAT_BY_EXT = new Map(OUTPUT_FORMATS.map(f => [f.ext, f]));
  let worker = null, readyPromise = null, readyResolve = null, readyReject = null, sequence = 0;
  const pending = new Map();
  function extensionOf(name) { const m = /\.[a-z0-9]+$/i.exec(String(name || '')); return m ? m[0].toLowerCase() : ''; }
  function detectFormat(name) { const ext = extensionOf(name); if (!INPUT_EXTENSIONS.includes(ext)) throw new Error(`不支持的结构文件格式：${ext || '未知扩展名'}`); return ext.slice(1); }
  function ensureWorker() {
    if (worker && readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    try {
      worker = BlockFlowWorkers.create('format');
      worker.onmessage = event => {
        const data = event.data || {};
        if (data.type === 'ready') { readyResolve(data); return; }
        if (data.type === 'init-error') {
          const error = new Error(data.message || '格式转换器初始化失败');
          readyReject(error);
          for (const task of pending.values()) task.reject(error);
          pending.clear();
          worker?.terminate(); worker = null; readyPromise = null;
          return;
        }
        const task = pending.get(data.id); if (!task) return;
        if (data.type === 'progress') { task.onProgress?.(data.message); return; }
        pending.delete(data.id);
        if (data.type === 'error') task.reject(new Error(data.message || '格式转换失败'));
        else if (data.type === 'result') task.resolve({ bytes: new Uint8Array(data.out), bbox: data.bbox || null });
      };
      worker.onerror = event => {
        const error = new Error(event.message || '格式转换 Worker 运行失败');
        readyReject?.(error); for (const task of pending.values()) task.reject(error); pending.clear();
        worker.terminate(); worker = null; readyPromise = null;
      };
    } catch (error) { readyReject(error); worker = null; readyPromise = null; }
    return readyPromise;
  }
  async function convert(bytes, targetFormat, name='structure', options={}) {
    const format = OUTPUT_FORMATS.find(item => item.key === targetFormat || item.id === targetFormat || item.ext === targetFormat);
    if (!format) throw new Error(`未知的目标格式：${targetFormat}`);
    const src = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
    if (!src.byteLength) throw new Error('文件为空');
    await ensureWorker();
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress: options.onProgress });
      try { worker.postMessage({ type:'convert', id, bytes:src, targetFormat:format.id, name, crop:options.crop || null }, [src.buffer]); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }
  function warningsForImport(sourceFormat) {
    const warnings = [];
    if (sourceFormat === 'bdx') warnings.push('BDX 与 mcstructure 的信息范围不同；部分方块实体数据可能无法完整往返。');
    if (sourceFormat === 'schematic') warnings.push('旧版 .schematic 面向 Java 1.12；新版本方块和部分方块实体信息可能在转换时丢失。');
    if (sourceFormat === 'mcworld' || sourceFormat === 'mca') warnings.push('世界/区块文件可能包含多个区域；当前转换规则对多区域输入仅取第 1 个区域。需要指定坐标范围时，请在文件名中使用 @[x,y,z]~[x,y,z]。');
    return warnings;
  }
  function warningsForExport(key, bbox) {
    const warnings = [];
    if (key === 'bdx') warnings.push('BDX 导出不保留原点信息；转换核心注明箱子内物品暂不保留。');
    if (key === 'schematic') warnings.push('旧版 .schematic 可能无法表达新版本方块；BlockFlow 会写入标准 TileEntities 命令方块数据及兼容清单，但第三方旧工具可能忽略扩展字段。');
    if (key === 'mcworld' && bbox) warnings.push('已将结构写入虚空世界；世界坐标范围已编码进文件名。');
    return warnings;
  }
  const converters = Object.freeze(Object.fromEntries(OUTPUT_FORMATS.map(format => [format.key, Object.freeze({
    ...format,
    async importToCanonical(bytes, name=`import${format.ext}`, options={}) {
      const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (format.key === 'mcstructure') return { bytes:new Uint8Array(input), converted:false, bbox:null, warnings:[] };
      const result = await convert(input, 'mcstructure', name, options);
      return { ...result, converted:true, warnings:warningsForImport(format.key) };
    },
    async exportFromCanonical(bytes, name=`export${format.ext}`, options={}) {
      const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (format.key === 'mcstructure') return { bytes:new Uint8Array(input), bbox:null, warnings:[] };
      const result = await convert(input, format.key, name, options);
      return { ...result, warnings:warningsForExport(format.key, result.bbox) };
    }
  })])));
  const INPUT_ONLY_FORMATS = Object.freeze(['nbt','mca','mcpack','mcaddon','zip']);
  const inputConverters = Object.freeze({
    ...converters,
    ...Object.fromEntries(INPUT_ONLY_FORMATS.map(key => [key, Object.freeze({
      key, ext:'.'+key, label:key.toUpperCase()+'（仅导入）',
      async importToCanonical(bytes, name=`import.${key}`, options={}) {
        const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const result = await convert(input, 'mcstructure', name, options);
        return { ...result, converted:true, warnings:warningsForImport(key) };
      }
    })]))
  });
  async function importToMcstructure(file, options={}) {
    if (!(file instanceof Blob)) throw new TypeError('导入参数必须是 File 或 Blob');
    const sourceFormat = detectFormat(file.name || options.name || '');
    const input = new Uint8Array(await file.arrayBuffer());
    const adapter = inputConverters[sourceFormat];
    if (!adapter) throw new Error(`尚未注册 ${sourceFormat} 的导入适配器`);
    const result = await adapter.importToCanonical(input, file.name || 'structure', options);
    return { bytes:result.bytes, sourceFormat, converted:result.converted !== false, bbox:result.bbox || null, warnings:result.warnings || warningsForImport(sourceFormat) };
  }
  async function exportFromMcstructure(bytes, targetFormat, name='structure', options={}) {
    const format = OUTPUT_FORMATS.find(item => item.key === targetFormat || item.id === targetFormat || item.ext === targetFormat);
    if (!format) throw new Error(`未知的导出格式：${targetFormat}`);
    const result = await converters[format.key].exportFromCanonical(bytes, name, options);
    return { bytes:result.bytes, format, bbox:result.bbox || null, warnings:result.warnings || [] };
  }
  window.BFSEFormats = Object.freeze({
    outputFormats:OUTPUT_FORMATS,
    converters,
    inputConverters,
    inputExtensions:INPUT_EXTENSIONS,
    detectFormat,
    convert,
    importToMcstructure,
    exportFromMcstructure,
    ready:ensureWorker
  });
})();

