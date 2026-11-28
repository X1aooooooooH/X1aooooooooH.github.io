import { MAX_IMPORT_BYTES, MAX_IMPORT_VOLUME } from './constants.js';
import { TAG, Reader, T, Writer, cloneNBT } from './nbt.js';
import { blockKey, blockTypeFromName, isAirPlaceholderBlock } from './blocks.js';

export function extractBlockIndexLayers(node) {
  // mcstructure format_version=1 常见布局：List<List<Int>>。
  // format_version=2 常见布局：List<IntArray>。
  // 同时兼容旧文件直接使用单个 IntArray 作为主层的情况。
  if (node?.type === TAG.INT_ARRAY && Array.isArray(node.value)) return [node.value];
  if (node?.type !== TAG.LIST || !node.value || !Array.isArray(node.value.items)) return null;

  const items = node.value.items;
  if (items.length < 1 || items.length > 2) return null;

  // v2: 两层（或单层）IntArray。
  if (node.value.elementType === TAG.INT_ARRAY &&
      items.every(item => item?.type === TAG.INT_ARRAY && Array.isArray(item.value))) {
    return items.map(item => item.value);
  }

  // v1: 两层（或单层）List<Int>。NBT Reader 会把每个 Int 包装成 {type, value}。
  if (node.value.elementType === TAG.LIST && items.every(item =>
    item?.type === TAG.LIST && item.value?.elementType === TAG.INT &&
    Array.isArray(item.value.items) && item.value.items.every(value => value?.type === TAG.INT)
  )) {
    return items.map(item => item.value.items.map(value => value.value));
  }

  return null;
}

export function buildStructureBlockMap(X, Y, Z, blockIndices, paletteList) {
  const map = new Map();
  const volume = Math.min(blockIndices.length, X * Y * Z);

  for (let lin = 0; lin < volume; lin++) {
    const palIdx = blockIndices[lin];
    if (palIdx === undefined || palIdx < 0) continue;

    const pe = paletteList[palIdx]?.value;
    if (!pe) continue;

    const name = pe.name?.value || '';
    const type = blockTypeFromName(name);
    if (type === 'air') continue;

    const x = Math.floor(lin / (Y * Z));
    const rem = lin % (Y * Z);
    const y = Math.floor(rem / Z);
    const z = rem % Z;

    const states = pe.states?.value || {};
    const facingRaw = states.facing_direction?.value;
    // 调色板本身就能认出命令方块，即使它缺少 Command 方块实体。
    // 这里先播种空命令和调色板里的条件状态，下面的 block_position_data
    // 一有数据就会覆盖这些默认值。
    map.set(blockKey(x, y, z), {
      x, y, z, type, name, blockType: type, cmd: '',
      cond: states.conditional_bit?.value ? 1 : 0, auto: 1,
      facing: facingRaw === undefined ? 2 : facingRaw, paletteIndex: palIdx
    });
  }

  return map;
}
export async function inflateMcstructurePayload(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('当前浏览器不支持 mcstructure 的 Zlib 解压，请使用最新版 Chrome、Edge 或 Firefox');
  }

  let stream;
  try {
    stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  } catch (e) {
    throw new Error(`mcstructure 内部结构解压初始化失败：${e?.message || e}`);
  }

  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMPORT_BYTES) {
        await reader.cancel();
        throw new Error(`解压后的结构数据超过 ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB 安全上限`);
      }
      chunks.push(value);
    }
  } catch (e) {
    throw new Error(`mcstructure 内部结构解压失败：${e?.message || e}`);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
export async function parseMcstructure(buf) {
  if (!buf || !Number.isFinite(buf.byteLength)) throw new Error('文件数据无效');
  if (buf.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`文件超过 ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB 的导入上限`);
  }

  const root = new Reader(buf).root();
  if (root.type !== TAG.COMPOUND) throw new Error('根标签不是 Compound');

  const rv = root.value;
  // Bedrock 的 .mcstructure 把内部结构 NBT 存成外层根里的一个 Zlib 压缩
  // ByteArray。老文件或本编辑器生成的格式也可能直接放 Compound，
  // 因此保留这条向后兼容的路径。
  const structureNode = rv.structure;
  if (structureNode?.type === TAG.BYTE_ARRAY) {
    const compression = rv.compression?.value;
    if (compression !== 1) {
      throw new Error(`不支持的 mcstructure 压缩类型：${compression ?? '缺失'}（当前支持 Zlib，compression=1）`);
    }
    const innerBytes = await inflateMcstructurePayload(structureNode.value);
    const innerBuffer = innerBytes.buffer.slice(innerBytes.byteOffset, innerBytes.byteOffset + innerBytes.byteLength);
    const innerRoot = new Reader(innerBuffer).root();
    if (innerRoot.type !== TAG.COMPOUND) throw new Error('解压后的 structure 根标签不是 Compound');
    rv.structure = innerRoot;
  } else if (structureNode?.type !== TAG.COMPOUND) {
    throw new Error('structure 必须是压缩的 ByteArray 或兼容的 Compound');
  }

  if (!rv.size) throw new Error('缺少 size');
  const si = rv.size.value.items;
  if (!Array.isArray(si) || si.length !== 3) throw new Error('size 必须恰好包含三个整数');

  const X = si[0]?.value;
  const Y = si[1]?.value;
  const Z = si[2]?.value;
  if (!Number.isInteger(X) || !Number.isInteger(Y) || !Number.isInteger(Z) || X <= 0 || Y <= 0 || Z <= 0) {
    throw new Error(`尺寸非法: ${X}×${Y}×${Z}`);
  }

  let origin = [0, 0, 0];
  if (rv.structure_world_origin) {
    const oi = rv.structure_world_origin.value?.items;
    if (oi && oi.length >= 3) origin = [oi[0].value, oi[1].value, oi[2].value];
  }

  if (!rv.structure) throw new Error('缺少 structure');
  const sv = rv.structure.value;

  const blockIndexLayers = extractBlockIndexLayers(sv.block_indices);
  if (!blockIndexLayers) throw new Error('block_indices 必须是包含一层（旧格式）或两层整数数组的列表');

  const blockIndices = blockIndexLayers[0];
  const volume = X * Y * Z;
  if (!Number.isSafeInteger(volume) || volume <= 0 || volume > MAX_IMPORT_VOLUME) {
    throw new Error(`结构体积 ${X}×${Y}×${Z} 超出安全导入上限（最多 ${MAX_IMPORT_VOLUME.toLocaleString()} 个方块位置）`);
  }
  if (blockIndices.length !== volume) {
    throw new Error(`block_indices 主层长度 ${blockIndices.length} 与结构体积 ${volume} 不一致`);
  }
  if (blockIndexLayers && blockIndexLayers.length === 2 && blockIndexLayers[1].length !== volume) {
    throw new Error(`block_indices 次层长度 ${blockIndexLayers[1].length} 与结构体积 ${volume} 不一致`);
  }

  if (!sv.palette || !sv.palette.value) throw new Error('缺少 palette');
  const pv = sv.palette.value;
  if (!pv.default || !pv.default.value) throw new Error('缺少 palette.default');

  const dv = pv.default.value;
  const paletteNode = dv.block_palette;
  const bpdNode = dv.block_position_data;
  if (!paletteNode?.value || !Array.isArray(paletteNode.value.items)) throw new Error('block_palette 无效');
  if (!bpdNode?.value || typeof bpdNode.value !== 'object') throw new Error('block_position_data 无效');

  const paletteList = paletteNode.value.items;
  const bpd = bpdNode.value;

  const validatePaletteIndices = (indices, label) => {
    for (let i = 0; i < indices.length; i++) {
      const value = indices[i];
      if (!Number.isInteger(value) || value < -1 || value >= paletteList.length) {
        throw new Error(`block_indices ${label}第 ${i} 项的调色板索引 ${value} 无效（调色板长度 ${paletteList.length}）`);
      }
    }
  };
  validatePaletteIndices(blockIndices, '主层');
  if (blockIndexLayers && blockIndexLayers.length === 2) validatePaletteIndices(blockIndexLayers[1], '次层');

  const blockMap = buildStructureBlockMap(X, Y, Z, blockIndices, paletteList);
  let parseWarnings = 0;
  const commandTypes = new Set(['command', 'repeating', 'chain']);

  // 解析方块实体时不按空的 Command 过滤：Command 标签为空或缺失的命令方块，
  // 仍然是命令图里的一个物理节点。
  for (const key of Object.keys(bpd)) {
    try {
      const entry = bpd[key]?.value;
      if (!entry || !entry.block_entity_data?.value) continue;
      if (!/^(0|[1-9]\d*)$/.test(key)) {
        parseWarnings++;
        continue;
      }

      const lin = Number(key);
      if (!Number.isSafeInteger(lin) || lin < 0 || lin >= blockIndices.length) {
        parseWarnings++;
        continue;
      }

      const palIdx = blockIndices[lin];
      if (palIdx === undefined || palIdx < 0) continue;

      const pe = paletteList[palIdx]?.value;
      if (!pe) continue;

      const name = pe.name?.value || '';
      const blockType = blockTypeFromName(name);
      // 告示牌、箱子之类的非命令方块实体不进命令图。
      if (!commandTypes.has(blockType)) continue;

      const bed = entry.block_entity_data.value;
      const cmdStr = typeof bed.Command?.value === 'string' ? bed.Command.value : '';

      const x = Math.floor(lin / (Y * Z));
      const rem = lin % (Y * Z);
      const y = Math.floor(rem / Z);
      const z = rem % Z;

      const states = pe.states?.value || {};
      const facingRaw = states.facing_direction?.value;
      const facing = facingRaw !== undefined ? facingRaw : 2;

      // 游戏导出的命令方块可能带拼错的旧键 LPCondionalMode、新键 conditionalMode，
      // 也可能两者都有。
      const condRaw = bed.conditionalMode?.value ?? bed.LPCondionalMode?.value ?? states.conditional_bit?.value ?? 0;
      const cond = condRaw ? 1 : 0;
      const auto = bed.auto?.value !== undefined ? (bed.auto.value ? 1 : 0) : 1;

      const command = { x, y, z, cmd: cmdStr, cond, auto, facing, blockType };
      const mapped = blockMap.get(blockKey(x, y, z));
      if (mapped) {
        mapped.cmd = cmdStr;
        mapped.cond = cond;
        mapped.auto = auto;
        mapped.blockType = blockType;
        mapped.facing = facing;
      } else {
        blockMap.set(blockKey(x, y, z), { ...command, type: blockType });
      }
    } catch {
      parseWarnings++;
    }
  }

  // BlockFlow 导出的结构会带上这个标记，表示命令链的相对坐标已经归一化过。
  // 再导入时据此跳过归一化：README §1.6 要求相对坐标只归一化一次，
  // 否则每轮导入导出都会按重新算出的 facing 再旋转一次，命令越漂越远。
  const alreadyNormalized = rv.blockflow_normalized?.value === 1;

  // 标记必须打在 blockMap 的方块上：processCommands/traceChain 是从
  // context.blockMap 取方块再拷贝的，只标 commands 数组拦不住归一化。
  if (alreadyNormalized) {
    for (const block of blockMap.values()) block.isBrokenNormalized = true;
  }

  // 根节点取自主层里的每一个物理命令方块，而不是只取 Command 非空的那些；
  // 空的根方块同样是合法节点。
  const commands = [...blockMap.values()]
    .filter(b => commandTypes.has(b.type || b.blockType))
    .map(b => ({
      ...b,
      // 已归一化过的结构不再重复旋转相对坐标
      ...(alreadyNormalized ? { isBrokenNormalized: true } : {}),
      cmd: typeof b.cmd === 'string' ? b.cmd : '',
      cond: b.cond ? 1 : 0,
      auto: b.auto !== 0 ? 1 : 0,
      facing: Number.isInteger(b.facing) ? b.facing : 2,
      blockType: b.blockType || b.type
    }));

  return { root, X, Y, Z, origin, commands, blockMap, blockIndices, paletteList, parseWarnings, normalized: alreadyNormalized };
}

export function buildBed(cmd, cond, wx, wy, wz, auto = 1) {
  const autoValue = auto === 0 ? 0 : 1;
  return T.comp({
    BlockEntityVersion: T.int(0),
    Command: T.str(cmd),
    CustomName: T.str(''),
    ExecuteOnFirstTick: T.byte(0),
    LPCommandMode: T.int(2),
    LPCondionalMode: T.byte(cond),
    LPRedstoneMode: T.byte(0),
    LastExecution: T.long(0n),
    LastOutput: T.str(''),
    LastOutputParams: T.list(TAG.STRING, []),
    SuccessCount: T.int(0),
    TickDelay: T.int(0),
    TrackOutput: T.byte(1),
    Version: T.int(50),
    auto: T.byte(autoValue),
    conditionMet: T.byte(0),
    conditionalMode: T.byte(cond),
    id: T.str('CommandBlock'),
    powered: T.byte(0),
    x: T.int(wx),
    y: T.int(wy),
    z: T.int(wz)
  });
}

export function buildOutput(formatVersion = 2, layout, options = {}) {
  if (!layout) throw new Error('缺少导出布局');

  const allBlocks = layout.blocks;
  if (!allBlocks.some(b => !isAirPlaceholderBlock(b))) throw new Error('没有命令方块');

  // 只在导出时打包：app.chains 本身从不被改写，所以每条链在 3D 编辑器里
  // 始终停在同一 Y 层，并沿着 X 轴继续延伸。
  const minX = allBlocks.reduce((min, b) => Math.min(min, b.x), Infinity);
  const spanX = layout.spanX;
  const maxY = layout.sizeY;
  const maxZ = layout.sizeZ;

  const mk = (name, cond, facing) => T.comp({
    name: T.str(name),
    states: T.comp({ conditional_bit: T.byte(cond), facing_direction: T.int(facing) }),
    version: T.int(18168865)
  });

  const palette = [];
  // facing_direction 是六值枚举：0=下，1=上，2=北，3=南，4=西，5=东。
  // 自闭环需要保留全部取值。
  for (const nm of ['minecraft:command_block', 'minecraft:chain_command_block', 'minecraft:repeating_command_block']) {
    for (let c = 0; c <= 1; c++) {
      for (let facing = 0; facing <= 5; facing++) palette.push(mk(nm, c, facing));
    }
  }

  const airIndex = palette.length;
  palette.push(T.comp({ name: T.str('minecraft:air'), states: T.comp({}), version: T.int(18168865) }));

  const volume = spanX * maxY * maxZ;
  const mainIndices = new Array(volume).fill(airIndex);
  // 次级层故意留空：导出的命令链方块只占主层。两个数组的长度都必须
  // 正好等于结构的体积。
  const secondaryIndices = new Array(volume).fill(-1);

  const bpd = {};
  const offsets = { command: 0, chain: 12, repeating: 24 };

  for (const b of allBlocks) {
    if (isAirPlaceholderBlock(b)) continue;

    const lx = b.x - minX;
    const lin = lx * (maxY * maxZ) + b.y * maxZ + b.z;
    if (!Number.isInteger(lin) || lin < 0 || lin >= volume) {
      throw new Error(`命令方块坐标越界：${b.x}, ${b.y}, ${b.z}`);
    }

    const cond = b.cond ? 1 : 0;
    const facing = Number(b.facing);
    const offset = offsets[b.blockType];
    const paletteIndex = Number.isInteger(offset) && Number.isInteger(facing) && facing >= 0 && facing <= 5
      ? offset + cond * 6 + facing
      : -1;
    if (paletteIndex < 0 || paletteIndex >= airIndex) {
      throw new Error(`无法导出命令方块类型或朝向：${b.blockType}/${b.facing}`);
    }

    mainIndices[lin] = paletteIndex;
    bpd[String(lin)] = T.comp({ block_entity_data: buildBed(b.cmd, cond, lx, b.y, b.z, b.auto) });
  }

  if (formatVersion !== 1 && formatVersion !== 2) {
    throw new Error(`不支持的导出格式版本：${formatVersion}`);
  }

  const base = options.originalRoot ? cloneNBT(options.originalRoot) : T.comp({});
  const rootValue = base.value || {};
  // v1 在外层结构 Compound 里放两层 List<Int>；
  // v2 在 zlib 压缩过的 structure 字节数组里放两层 IntArray。
  rootValue.format_version = T.int(formatVersion);
  delete rootValue.compression;
  rootValue.size = T.list(TAG.INT, [T.int(spanX), T.int(maxY), T.int(maxZ)]);

  const originalStructure = rootValue.structure?.value ? cloneNBT(rootValue.structure.value) : {};
  originalStructure.block_indices = formatVersion === 1
    ? T.list(TAG.LIST, [T.list(TAG.INT, mainIndices.map(T.int)), T.list(TAG.INT, secondaryIndices.map(T.int))])
    : T.list(TAG.INT_ARRAY, [T.ia(mainIndices), T.ia(secondaryIndices)]);

  // 本编辑器只重排命令链；保留源实体的话，它们的位置会和重建后的结构脱节，
  // 所以导出一个空列表。
  originalStructure.entities = T.list(TAG.COMPOUND, []);
  originalStructure.palette = T.comp({
    default: T.comp({
      block_palette: T.list(TAG.COMPOUND, palette),
      block_position_data: T.comp(bpd)
    })
  });
  rootValue.structure = T.comp(originalStructure);

  const origin = Array.isArray(options.sourceOrigin) && options.sourceOrigin.length >= 3
    ? options.sourceOrigin
    : [0, 0, 0];
  rootValue.structure_world_origin = T.list(TAG.INT, [
    T.int(origin[0] || 0), T.int(origin[1] || 0), T.int(origin[2] || 0)
  ]);
  // 记录「本结构的相对坐标已归一化」。Bedrock 会忽略这个未知的根字段，
  // 而 BlockFlow 再次导入时据此跳过归一化，让导入导出的 round-trip 保持幂等。
  rootValue.blockflow_normalized = T.byte(1);

  return T.comp(rootValue);
}

export function setNBTValueLike(comp, key, value, fallbackTag) {
  const old = comp[key];
  // 已有同类型的标量标签就地改值，保留它原本的标签类型；否则用 fallbackTag 新建。
  if (old && typeof old === 'object' && 'type' in old) {
    if (old.type === TAG.BYTE || old.type === TAG.SHORT || old.type === TAG.INT || old.type === TAG.LONG ||
        old.type === TAG.FLOAT || old.type === TAG.DOUBLE || old.type === TAG.STRING) {
      old.value = value;
      return;
    }
  }
  comp[key] = fallbackTag();
}

export function buildNetEaseBed(cmd, cond, wx, wy, wz, auto, template, blockType) {
  const node = template ? cloneNBT(template) : buildBed(cmd, cond, wx, wy, wz, auto);
  const v = node?.value;
  if (!v) return buildBed(cmd, cond, wx, wy, wz, auto);

  const put = (key, value, tag) => setNBTValueLike(v, key, value, tag);
  const command = String(cmd ?? '');

  put('Command', command, () => T.str(command));
  put('CustomName', '', () => T.str(''));
  const commandMode = blockType === 'command' ? 0 : (blockType === 'repeating' ? 1 : 2);
  put('LPCommandMode', commandMode, () => T.int(commandMode));
  put('LPCondionalMode', cond ? 1 : 0, () => T.byte(cond ? 1 : 0));
  put('LPRedstoneMode', 0, () => T.byte(0));
  put('ExecuteOnFirstTick', 0, () => T.byte(0));
  put('LastExecution', 0n, () => T.long(0n));
  put('LastOutput', '', () => T.str(''));
  put('SuccessCount', 0, () => T.int(0));
  put('TickDelay', 0, () => T.int(0));
  put('TrackOutput', 1, () => T.byte(1));
  put('auto', auto === 0 ? 0 : 1, () => T.byte(auto === 0 ? 0 : 1));
  put('conditionMet', 0, () => T.byte(0));
  put('conditionalMode', cond ? 1 : 0, () => T.byte(cond ? 1 : 0));
  put('powered', 0, () => T.byte(0));
  put('x', wx, () => T.int(wx));
  put('y', wy, () => T.int(wy));
  put('z', wz, () => T.int(wz));

  if (!v.LastOutputParams) {
    v.LastOutputParams = T.list(TAG.STRING, []);
  } else if (v.LastOutputParams.type === TAG.LIST && v.LastOutputParams.value?.elementType === TAG.STRING) {
    v.LastOutputParams.value.items = [];
  }
  if (!v.id) v.id = T.str('CommandBlock');
  if (!v.BlockEntityVersion) v.BlockEntityVersion = T.int(0);

  return node;
}

export function buildNetEaseOutput(layout, options = {}) {
  if (!layout) throw new Error('缺少导出布局');

  const root = buildOutput(1, layout);
  const rv = root.value;
  const src = options.originalRoot?.value;
  const srcStructure = src?.structure?.type === TAG.COMPOUND ? src.structure.value : null;
  const outStructure = rv.structure.value;

  // 尽量沿用源结构的方块调色板以及它的排列顺序。
  const sourcePalette = srcStructure?.palette?.value?.default?.value?.block_palette;
  const paletteItems = sourcePalette?.value?.items;
  if (Array.isArray(paletteItems) && paletteItems.length) {
    const palette = paletteItems.map(cloneNBT);

    const keyOf = (entry) => {
      const v = entry?.value || {};
      const states = v.states?.value || {};
      const cond = states.conditional_bit?.value ?? 0;
      const face = states.facing_direction?.value ?? 2;
      return `${v.name?.value || ''}|${cond}|${face}`;
    };

    const byKey = new Map(palette.map((entry, i) => [keyOf(entry), i]));
    const templateByName = new Map(palette.map(entry => [entry.value?.name?.value, entry]));

    let airIdx = palette.findIndex(entry => entry.value?.name?.value === 'minecraft:air');
    if (airIdx < 0) {
      airIdx = palette.length;
      palette.push(T.comp({ name: T.str('minecraft:air'), states: T.comp({}), version: T.int(18168865) }));
    }

    // 同一个（方块名, 条件, 朝向）组合复用同一个调色板项。
    const addState = (name, cond, face) => {
      const key = `${name}|${cond}|${face}`;
      if (byKey.has(key)) return byKey.get(key);

      const template = templateByName.get(name) || templateByName.get('minecraft:command_block') || palette[0];
      const entry = cloneNBT(template);
      entry.value.name = T.str(name);
      if (!entry.value.states || entry.value.states.type !== TAG.COMPOUND) entry.value.states = T.comp({});
      entry.value.states.value.conditional_bit = T.byte(cond ? 1 : 0);
      entry.value.states.value.facing_direction = T.int(face);

      const idx = palette.length;
      palette.push(entry);
      byKey.set(key, idx);
      return idx;
    };

    const newVolume = rv.size.value.items.reduce((n, t) => n * t.value, 1);
    const main = new Array(newVolume).fill(airIdx >= 0 ? airIdx : palette.length - 1);

    const blocks = layout.blocks;
    const minX = blocks.reduce((m, b) => Math.min(m, b.x), Infinity);
    const sx = rv.size.value.items[0].value;
    const sy = rv.size.value.items[1].value;
    const sz = rv.size.value.items[2].value;

    const bpd = {};
    const origin = Array.isArray(options.sourceOrigin) && options.sourceOrigin.length >= 3
      ? options.sourceOrigin
      : [0, 0, 0];

    const sourceBpd = srcStructure?.palette?.value?.default?.value?.block_position_data?.value || {};
    const sourceEntities = Object.values(sourceBpd).map(item => item?.value?.block_entity_data).filter(Boolean);
    const entityTemplate = sourceEntities[0] || null;

    const typeNames = {
      command: 'minecraft:command_block',
      chain: 'minecraft:chain_command_block',
      repeating: 'minecraft:repeating_command_block'
    };

    for (const b of blocks) {
      if (isAirPlaceholderBlock(b)) continue;

      const lx = b.x - minX;
      const lin = lx * (sy * sz) + b.y * sz + b.z;
      if (lx < 0 || lx >= sx || b.y < 0 || b.y >= sy || b.z < 0 || b.z >= sz || lin < 0 || lin >= newVolume) continue;

      const name = typeNames[b.blockType] || typeNames.chain;
      main[lin] = addState(name, b.cond ? 1 : 0, Number.isInteger(Number(b.facing)) ? Number(b.facing) : 2);

      const template = sourceBpd[String(lin)]?.value?.block_entity_data || entityTemplate;
      bpd[String(lin)] = T.comp({
        block_entity_data: buildNetEaseBed(
          b.cmd, b.cond ? 1 : 0,
          (origin[0] || 0) + lx, (origin[1] || 0) + b.y, (origin[2] || 0) + b.z,
          b.auto, template
        )
      });
    }

    outStructure.block_indices = T.list(TAG.LIST, [
      T.list(TAG.INT, main.map(T.int)),
      T.list(TAG.INT, new Array(newVolume).fill(-1).map(T.int))
    ]);

    const sourcePaletteNode = cloneNBT(srcStructure.palette);
    const defaultValue = sourcePaletteNode.value.default.value;
    defaultValue.block_palette = T.list(TAG.COMPOUND, palette);
    defaultValue.block_position_data = T.comp(bpd);
    outStructure.palette = sourcePaletteNode;
  }

  rv.format_version = T.int(1);
  delete rv.compression;
  if (src?.structure_world_origin) rv.structure_world_origin = cloneNBT(src.structure_world_origin);

  return root;
}

export async function serializeOutputForFormat(formatVersion, layout, options = {}) {
  const root = formatVersion === 3 ? buildNetEaseOutput(layout, options) : buildOutput(formatVersion, layout, options);
  // v1 和网易版的外层结构不压缩，直接序列化。
  if (formatVersion === 1 || formatVersion === 3) return new Writer().serialize(root);

  const innerStructure = root.value.structure;
  if (!innerStructure || innerStructure.type !== TAG.COMPOUND) throw new Error('导出结构缺少有效的内部 Compound');

  const innerBytes = new Writer().serialize(innerStructure);
  if (typeof CompressionStream !== 'function') {
    throw new Error('当前浏览器不支持 mcstructure 的 Zlib 压缩，请使用最新版 Chrome、Edge 或 Firefox');
  }
  const compressedStream = new Blob([innerBytes]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());
  root.value.compression = T.int(1);
  root.value.structure = { type: TAG.BYTE_ARRAY, value: compressedBytes };
  return new Writer().serialize(root);
}
