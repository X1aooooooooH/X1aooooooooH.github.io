import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/* ---------------- NBT ---------------- */

export const END = 0, BYTE = 1, SHORT = 2, INT = 3, LONG = 4, FLOAT = 5, DOUBLE = 6;
export const BYTE_ARRAY = 7, STRING = 8, LIST = 9, COMPOUND = 10, INT_ARRAY = 11, LONG_ARRAY = 12;

export const TAG_NAMES = ["end", "byte", "short", "int", "long", "float", "double",
  "byte_array", "string", "list", "compound", "int_array", "long_array"];

const MAX_DEPTH = 128;
const MAX_LIST_ITEMS = 1_000_000;
const MAX_ARRAY_ITEMS = 1_000_000;

export class NbtError extends Error {}

export class Tag {
  constructor(type, value, elem = null) {
    this.type = type;
    this.value = value;
    this.elem = elem;
  }

  static byte(v) { return new Tag(BYTE, v); }
  static short(v) { return new Tag(SHORT, v); }
  static int(v) { return new Tag(INT, v); }
  static long(v) { return new Tag(LONG, v); }
  static float(v) { return new Tag(FLOAT, v); }
  static double(v) { return new Tag(DOUBLE, v); }
  static string(v) { return new Tag(STRING, String(v)); }
  static intArray(values) { return new Tag(INT_ARRAY, [...values]); }
  static compound(entries = new Map()) {
    return new Tag(COMPOUND, entries instanceof Map ? entries : new Map(Object.entries(entries)));
  }
  static listOf(elem, items) { return new Tag(LIST, [...items], elem); }

  get(key, fallback = null) {
    if (this.type !== COMPOUND) return fallback;
    return this.value.has(key) ? this.value.get(key) : fallback;
  }

  plain(key, fallback = null) {
    const child = this.get(key);
    return child === null ? fallback : child.value;
  }

  plainList(key) {
    const child = this.get(key);
    if (!child || child.type !== LIST) return [];
    return child.value.map(item => item.value);
  }
}

class Reader {
  constructor(data) {
    this.data = Buffer.from(data);
    this.pos = 0;
  }

  remaining() { return this.data.length - this.pos; }

  take(n) {
    if (n < 0 || this.pos + n > this.data.length) {
      throw new NbtError("截断的 NBT：" + this.pos + " 处需要 " + n + " 字节");
    }
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  i8() { const v = this.data.readInt8(this.pos); this.pos += 1; return v; }
  u8() { const v = this.data.readUInt8(this.pos); this.pos += 1; return v; }
  i16() { const v = this.data.readInt16LE(this.pos); this.pos += 2; return v; }
  u16() { const v = this.data.readUInt16LE(this.pos); this.pos += 2; return v; }
  i32() { const v = this.data.readInt32LE(this.pos); this.pos += 4; return v; }
  i64() { const v = Number(this.data.readBigInt64LE(this.pos)); this.pos += 8; return v; }
  f32() { const v = this.data.readFloatLE(this.pos); this.pos += 4; return v; }
  f64() { const v = this.data.readDoubleLE(this.pos); this.pos += 8; return v; }

  string() {
    const length = this.u16();
    return this.take(length).toString("utf8");
  }

  body(type, depth = 0) {
    if (depth > MAX_DEPTH) throw new NbtError("NBT 嵌套超过 " + MAX_DEPTH + " 层");
    switch (type) {
      case END: return new Tag(END, null);
      case BYTE: return new Tag(BYTE, this.i8());
      case SHORT: return new Tag(SHORT, this.i16());
      case INT: return new Tag(INT, this.i32());
      case LONG: return new Tag(LONG, this.i64());
      case FLOAT: return new Tag(FLOAT, this.f32());
      case DOUBLE: return new Tag(DOUBLE, this.f64());
      case BYTE_ARRAY: {
        const length = this.i32();
        if (length < 0 || length > this.remaining()) throw new NbtError("非法的字节数组长度 " + length);
        return new Tag(BYTE_ARRAY, this.take(length));
      }
      case STRING: return new Tag(STRING, this.string());
      case LIST: {
        const elem = this.u8();
        const length = this.i32();
        if (length < 0 || length > MAX_LIST_ITEMS) throw new NbtError("非法的列表长度 " + length);
        if (elem === END && length !== 0) throw new NbtError("元素类型为 END 的列表必须为空");
        if (elem !== END && length > this.remaining()) throw new NbtError("列表长度 " + length + " 超过剩余字节");
        const items = [];
        for (let i = 0; i < length; i++) items.push(this.body(elem, depth + 1));
        return new Tag(LIST, items, elem);
      }
      case COMPOUND: {
        const out = new Map();
        for (;;) {
          const childType = this.u8();
          if (childType === END) break;
          const name = this.string();
          out.set(name, this.body(childType, depth + 1));
        }
        return new Tag(COMPOUND, out);
      }
      case INT_ARRAY: {
        const length = this.i32();
        if (length < 0 || length > MAX_ARRAY_ITEMS || length * 4 > this.remaining()) {
          throw new NbtError("非法的整数数组长度 " + length);
        }
        const out = [];
        for (let i = 0; i < length; i++) out.push(this.i32());
        return new Tag(INT_ARRAY, out);
      }
      case LONG_ARRAY: {
        const length = this.i32();
        if (length < 0 || length > MAX_ARRAY_ITEMS || length * 8 > this.remaining()) {
          throw new NbtError("非法的长整数数组长度 " + length);
        }
        const out = [];
        for (let i = 0; i < length; i++) out.push(this.i64());
        return new Tag(LONG_ARRAY, out);
      }
      default:
        throw new NbtError("未知标签类型 " + type + "（字节 " + this.pos + "）");
    }
  }

  root() {
    const type = this.u8();
    if (type !== COMPOUND) throw new NbtError("根标签是 " + (TAG_NAMES[type] ?? type) + "，需要 compound");
    this.string();
    return this.body(COMPOUND);
  }
}

class Writer {
  constructor() {
    this.parts = [];
  }

  push(buffer) { this.parts.push(buffer); }

  u8(v) { this.push(Buffer.from([v & 255])); }
  i8(v) { const b = Buffer.alloc(1); b.writeInt8(v); this.push(b); }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v); this.push(b); }
  u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v & 65535); this.push(b); }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); this.push(b); }
  i64(v) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); this.push(b); }
  f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.push(b); }
  f64(v) { const b = Buffer.alloc(8); b.writeDoubleLE(v); this.push(b); }

  string(s) {
    const data = Buffer.from(String(s), "utf8");
    if (data.length > 65535) throw new NbtError("字符串 " + data.length + " 字节，超过 NBT 的 65535 上限");
    this.u16(data.length);
    this.push(data);
  }

  body(tag) {
    const { type: t, value: v } = tag;
    switch (t) {
      case END: return;
      case BYTE: return this.i8(v);
      case SHORT: return this.i16(v);
      case INT: return this.i32(v);
      case LONG: return this.i64(v);
      case FLOAT: return this.f32(v);
      case DOUBLE: return this.f64(v);
      case BYTE_ARRAY: this.i32(v.length); return this.push(Buffer.from(v));
      case STRING: return this.string(v);
      case LIST: {
        const elem = tag.elem ?? (v.length ? v[0].type : END);
        this.u8(elem);
        this.i32(v.length);
        for (const item of v) this.body(item);
        return;
      }
      case COMPOUND: {
        for (const [name, child] of v) {
          this.u8(child.type);
          this.string(name);
          this.body(child);
        }
        this.u8(END);
        return;
      }
      case INT_ARRAY:
        this.i32(v.length);
        for (const x of v) this.i32(x);
        return;
      case LONG_ARRAY:
        this.i32(v.length);
        for (const x of v) this.i64(x);
        return;
      default:
        throw new NbtError("无法序列化标签类型 " + t);
    }
  }

  serialize(root) {
    this.u8(root.type);
    this.string("");
    this.body(root);
    return Buffer.concat(this.parts);
  }
}

export function parseNbt(data) { return new Reader(data).root(); }
export function serializeNbt(root) { return new Writer().serialize(root); }

export function cloneTag(tag) {
  if (tag.type === COMPOUND) {
    const out = new Map();
    for (const [k, v] of tag.value) out.set(k, cloneTag(v));
    return new Tag(COMPOUND, out);
  }
  if (tag.type === LIST) return new Tag(LIST, tag.value.map(cloneTag), tag.elem);
  if (tag.type === INT_ARRAY || tag.type === LONG_ARRAY) return new Tag(tag.type, [...tag.value]);
  return new Tag(tag.type, tag.value);
}

/* ---------------- mcstructure ---------------- */

export const NETHER = 2;

export const FACING_VEC = new Map([
  [0, [0, -1, 0]], [1, [0, 1, 0]], [2, [0, 0, -1]],
  [3, [0, 0, 1]], [4, [-1, 0, 0]], [5, [1, 0, 0]],
]);

export const BLOCK_NAMES = new Map([
  ["command", "minecraft:command_block"],
  ["repeating", "minecraft:repeating_command_block"],
  ["chain", "minecraft:chain_command_block"],
]);

export const NAME_TO_TYPE = new Map([...BLOCK_NAMES].map(([k, v]) => [v, k]));
NAME_TO_TYPE.set("minecraft:air", "air");

export const COMMAND_TYPES = ["command", "repeating", "chain"];
export const PALETTE_STATE_VERSION = 18168865;
export const PALETTE_OFFSETS = new Map([["command", 0], ["chain", 12], ["repeating", 24]]);

const BED_TEMPLATE = [
  ["BlockEntityVersion", "int", 0], ["Command", "str", ""], ["CustomName", "str", ""],
  ["ExecuteOnFirstTick", "byte", 0], ["LPCommandMode", "int", 2], ["LPCondionalMode", "byte", 0],
  ["LPRedstoneMode", "byte", 0], ["LastExecution", "long", 0], ["LastOutput", "str", ""],
  ["LastOutputParams", "list_str", []], ["SuccessCount", "int", 0], ["TickDelay", "int", 0],
  ["TrackOutput", "byte", 1], ["Version", "int", 50], ["auto", "byte", 1],
  ["conditionMet", "byte", 0], ["conditionalMode", "byte", 0], ["id", "str", "CommandBlock"],
  ["powered", "byte", 0], ["x", "int", 0], ["y", "int", 0], ["z", "int", 0],
];

export class StructureError extends Error {}

export function blockKey(x, y, z) { return x + "," + y + "," + z; }

export class Block {
  constructor(x, y, z, type, facing = NETHER, cmd = "", cond = 0, auto = 1,
    isAuxiliary = false, isAirPlaceholder = false, brokenWrongFacing = false,
    isBrokenNormalized = false, selfClosedCycle = false) {
    this.x = x; this.y = y; this.z = z;
    this.type = type;
    this.facing = facing;
    this.cmd = cmd;
    this.cond = cond;
    this.auto = auto;
    this.is_auxiliary = isAuxiliary;
    this.is_air_placeholder = isAirPlaceholder;
    this.broken_wrong_facing = brokenWrongFacing;
    this.is_broken_normalized = isBrokenNormalized;
    this.self_closed_cycle = selfClosedCycle;
  }

  get key() { return blockKey(this.x, this.y, this.z); }

  offset(facing, step = 1) {
    const vec = FACING_VEC.get(Number(facing));
    if (!vec) return null;
    return [this.x + vec[0] * step, this.y + vec[1] * step, this.z + vec[2] * step];
  }

  copy(changes = {}) {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this, changes);
  }
}

export class Structure {
  constructor(size, { origin = [0, 0, 0], formatVersion = 2, blocks = new Map(),
    palette = [], root = null, inner = null, warnings = [] } = {}) {
    this.size = size;
    this.origin = origin;
    this.format_version = formatVersion;
    this.blocks = blocks;
    this.palette = palette;
    this.root = root;
    this.inner = inner;
    this.warnings = warnings;
  }

  get volume() { return this.size[0] * this.size[1] * this.size[2]; }

  linearIndex(x, y, z) {
    const [, sy, sz] = this.size;
    return x * sy * sz + y * sz + z;
  }

  coordFromIndex(lin) {
    const [, sy, sz] = this.size;
    const x = Math.floor(lin / (sy * sz));
    const rem = lin % (sy * sz);
    return [x, Math.floor(rem / sz), rem % sz];
  }

  commandBlocks() {
    return [...this.blocks.values()].filter(b => COMMAND_TYPES.includes(b.type));
  }

  bounds() {
    const blocks = [...this.blocks.values()];
    if (!blocks.length) return [0, 0, 0, 0, 0, 0];
    const xs = blocks.map(b => b.x), ys = blocks.map(b => b.y), zs = blocks.map(b => b.z);
    return [Math.min(...xs), Math.min(...ys), Math.min(...zs), Math.max(...xs), Math.max(...ys), Math.max(...zs)];
  }
}

function statesOf(paletteTag) {
  const states = paletteTag.get("states");
  if (!states || states.type !== COMPOUND) return new Map();
  return new Map([...states.value].map(([k, v]) => [k, v.value]));
}

function iterIndexLayers(tag) {
  if (tag.type === INT_ARRAY) return [[...tag.value]];
  if (tag.type !== LIST) return null;
  const items = tag.value;
  if (items.length < 1 || items.length > 2) return null;
  if (items.every(item => item.type === INT_ARRAY)) return items.map(item => [...item.value]);
  if (items.every(item => item.type === LIST && item.elem === INT)) {
    return items.map(item => item.value.map(v => v.value));
  }
  return null;
}

export function loadStructure(file, keepRaw = true) {
  const name = path.basename(String(file));
  const data = fs.readFileSync(file);
  let root;
  try {
    root = parseNbt(data);
  } catch (error) {
    throw new StructureError(name + ": 不是合法的 NBT（" + error.message + "）");
  }
  const rv = root.value;
  const formatVersion = rv.has("format_version") ? rv.get("format_version").value : 2;

  const sizeTag = rv.get("size");
  if (!sizeTag || sizeTag.type !== LIST || sizeTag.value.length !== 3) {
    throw new StructureError(name + ": 缺少合法的 size");
  }
  const size = sizeTag.value.map(t => Number(t.value));
  if (size.some(v => v <= 0)) throw new StructureError(name + ": 非法尺寸 " + size);

  let origin = [0, 0, 0];
  if (rv.has("structure_world_origin")) {
    origin = rv.get("structure_world_origin").value.slice(0, 3).map(t => Number(t.value));
  }

  const structureTag = rv.get("structure");
  if (!structureTag) throw new StructureError(name + ": 缺少 structure");
  const warnings = [];
  let inner;
  if (structureTag.type === BYTE_ARRAY) {
    const compression = rv.has("compression") ? rv.get("compression").value : null;
    if (compression !== 1 && compression !== null) {
      throw new StructureError(name + ": 不支持的压缩方式 " + compression);
    }
    try {
      inner = parseNbt(zlib.inflateSync(structureTag.value));
    } catch (error) {
      throw new StructureError(name + ": 无法解压 structure（" + error.message + "）");
    }
  } else if (structureTag.type === COMPOUND) {
    inner = structureTag;
  } else {
    throw new StructureError(name + ": structure 必须是 compound 或 byte array");
  }

  const iv = inner.value;
  const indicesTag = iv.get("block_indices");
  if (!indicesTag) throw new StructureError(name + ": 缺少 block_indices");
  const layers = iterIndexLayers(indicesTag);
  if (!layers) throw new StructureError(name + ": 不支持的 block_indices 布局");
  const main = layers[0];
  const volume = size[0] * size[1] * size[2];
  if (main.length !== volume) {
    throw new StructureError(name + ": block_indices 有 " + main.length + " 项，应为 " + volume);
  }

  const paletteTag = iv.get("palette");
  if (!paletteTag) throw new StructureError(name + ": 缺少 palette");
  const defaultTag = paletteTag.get("default");
  if (!defaultTag) throw new StructureError(name + ": 缺少 palette.default");
  const palette = defaultTag.get("block_palette");
  if (!palette || palette.type !== LIST) throw new StructureError(name + ": block_palette 非法");
  const paletteItems = palette.value;

  const bpdTag = defaultTag.get("block_position_data");
  const bpd = bpdTag && bpdTag.type === COMPOUND ? bpdTag.value : new Map();

  const structure = new Structure(size, {
    origin, formatVersion: Number(formatVersion), palette: paletteItems,
    root: keepRaw ? root : null, inner: keepRaw ? inner : null, warnings,
  });

  const statesCache = new Map();
  main.forEach((paletteIndex, lin) => {
    if (paletteIndex < 0 || paletteIndex >= paletteItems.length) return;
    const entry = paletteItems[paletteIndex];
    const name = entry.plain("name", "");
    const type = NAME_TO_TYPE.get(name) ?? "other";
    if (type === "air" || type === "other") return;
    let states = statesCache.get(paletteIndex);
    if (!states) {
      states = statesOf(entry);
      statesCache.set(paletteIndex, states);
    }
    const [x, y, z] = structure.coordFromIndex(lin);
    structure.blocks.set(blockKey(x, y, z), new Block(x, y, z, type,
      Number(states.get("facing_direction") ?? NETHER),
      "", states.get("conditional_bit", 0) ? 1 : 0));
  });

  for (const [key, entry] of bpd) {
    if (!/^\d+$/.test(key)) {
      warnings.push("忽略非数字的 block_position_data 键 " + JSON.stringify(key));
      continue;
    }
    const lin = Number(key);
    if (lin >= volume) {
      warnings.push("忽略越界的 block_position_data 键 " + key);
      continue;
    }
    const bedTag = entry.get("block_entity_data");
    if (!bedTag || bedTag.type !== COMPOUND) continue;
    const [x, y, z] = structure.coordFromIndex(lin);
    let block = structure.blocks.get(blockKey(x, y, z));
    if (!block) {
      if (bedTag.plain("id", "") !== "CommandBlock") continue;
      const paletteIndex = main[lin];
      if (paletteIndex < 0 || paletteIndex >= paletteItems.length) continue;
      const type = NAME_TO_TYPE.get(paletteItems[paletteIndex].plain("name", ""));
      if (!COMMAND_TYPES.includes(type)) continue;
      block = new Block(x, y, z, type);
      structure.blocks.set(blockKey(x, y, z), block);
    }
    const bed = bedTag.value;
    block.cmd = bed.has("Command") && bed.get("Command").type === STRING ? bed.get("Command").value : "";
    for (const condKey of ["conditionalMode", "LPCondionalMode"]) {
      if (bed.has(condKey)) { block.cond = bed.get(condKey).value ? 1 : 0; break; }
    }
    if (bed.has("auto")) block.auto = Number(bed.get("auto").value) === 0 ? 0 : 1;
    if (bed.has("x")) {
      block.x = Number(bed.get("x").value);
      block.y = Number((bed.get("y") ?? Tag.int(block.y)).value);
      block.z = Number((bed.get("z") ?? Tag.int(block.z)).value);
    }
  }

  return structure;
}

function paletteEntry(name, cond, facing, version) {
  return Tag.compound(new Map([
    ["name", Tag.string(name)],
    ["states", Tag.compound(new Map([
      ["conditional_bit", Tag.byte(cond ? 1 : 0)],
      ["facing_direction", Tag.int(facing)],
    ]))],
    ["version", Tag.int(version)],
  ]));
}

// 方块实体的默认字段是常量，建一次共享即可；每个方块只覆盖会变的那几项。
const BED_DEFAULTS = new Map(BED_TEMPLATE.map(([key, kind, fallback]) => {
  const tag = kind === "int" ? Tag.int(fallback)
    : kind === "byte" ? Tag.byte(fallback)
    : kind === "long" ? Tag.long(fallback)
    : kind === "str" ? Tag.string(fallback)
    : Tag.listOf(STRING, []);
  return [key, tag];
}));

function commandBed(block, lx) {
  const values = new Map(BED_DEFAULTS);
  values.set("Command", Tag.string(block.cmd));
  values.set("LPCommandMode", Tag.int(2));
  values.set("conditionalMode", Tag.byte(block.cond ? 1 : 0));
  values.set("LPCondionalMode", Tag.byte(block.cond ? 1 : 0));
  values.set("auto", Tag.byte(block.auto === 0 ? 0 : 1));
  values.set("x", Tag.int(lx));
  values.set("y", Tag.int(block.y));
  values.set("z", Tag.int(block.z));
  return Tag.compound(values);
}

function indicesTag(main, volume, style) {
  if (style === "int_array") {
    return Tag.listOf(INT_ARRAY, [Tag.intArray(main), Tag.intArray(new Array(volume).fill(-1))]);
  }
  return Tag.listOf(LIST, [
    Tag.listOf(INT, main.map(v => Tag.int(v))),
    Tag.listOf(INT, new Array(volume).fill(Tag.int(-1))),
  ]);
}

// 原版 36 个状态 + 空气的调色板是固定的，缓存后每次构建只复制数组，不重建标签。
let standardPaletteCache = null;
function standardPalette() {
  if (!standardPaletteCache) {
    const palette = [];
    for (const name of ["minecraft:command_block", "minecraft:chain_command_block", "minecraft:repeating_command_block"]) {
      for (const cond of [0, 1]) {
        for (let facing = 0; facing < 6; facing++) {
          palette.push(paletteEntry(name, cond, facing, PALETTE_STATE_VERSION));
        }
      }
    }
    palette.push(Tag.compound(new Map([
      ["name", Tag.string("minecraft:air")],
      ["states", Tag.compound(new Map())],
      ["version", Tag.int(PALETTE_STATE_VERSION)],
    ])));
    standardPaletteCache = palette;
  }
  return standardPaletteCache;
}

function buildInner(blocks, size, style, sourcePalette = null) {
  const [sx, sy, sz] = size;
  const volume = sx * sy * sz;

  if (sourcePalette) {
    const palette = sourcePalette.map(entry => cloneTag(entry));
    let airIndex = palette.findIndex(entry => entry.plain("name", "") === "minecraft:air");
    if (airIndex < 0) {
      airIndex = palette.length;
      palette.push(paletteEntry("minecraft:air", 0, 0, PALETTE_STATE_VERSION));
    }
    const keyOf = entry => {
      const states = statesOf(entry);
      return entry.plain("name", "") + "\u0000" + states.get("conditional_bit", 0) + "\u0000" +
        states.get("facing_direction", NETHER);
    };
    const indexByKey = new Map();
    palette.forEach((entry, i) => indexByKey.set(keyOf(entry), i));
    const templateByName = new Map();
    for (const entry of palette) {
      const name = entry.plain("name", "");
      if (!templateByName.has(name)) templateByName.set(name, entry);
    }
    const main = new Array(volume).fill(airIndex);
    const bpd = new Map();
    for (const block of blocks) {
      const name = BLOCK_NAMES.get(block.type);
      const cond = block.cond ? 1 : 0;
      const key = name + "\u0000" + cond + "\u0000" + block.facing;
      let idx = indexByKey.get(key);
      if (idx === undefined) {
        const template = templateByName.get(name) ?? templateByName.get("minecraft:command_block") ?? palette[0];
        const entry = cloneTag(template);
        entry.value.set("name", Tag.string(name));
        let states = entry.get("states");
        if (!states || states.type !== COMPOUND) {
          entry.value.set("states", Tag.compound(new Map()));
          states = entry.value.get("states");
        }
        states.value.set("conditional_bit", Tag.byte(cond));
        states.value.set("facing_direction", Tag.int(block.facing));
        idx = palette.length;
        palette.push(entry);
        indexByKey.set(key, idx);
      }
      const lin = block.x * sy * sz + block.y * sz + block.z;
      main[lin] = idx;
      bpd.set(String(lin), Tag.compound(new Map([["block_entity_data", commandBed(block, block.x)]])));
    }
    return Tag.compound(new Map([
      ["block_indices", indicesTag(main, volume, "list_int")],
      ["entities", Tag.listOf(COMPOUND, [])],
      ["palette", Tag.compound(new Map([["default", Tag.compound(new Map([
        ["block_palette", Tag.listOf(COMPOUND, palette)],
        ["block_position_data", Tag.compound(bpd)],
      ]))]]))],
    ]));
  }

  const palette = [...standardPalette()];
  const air = palette.length - 1;
  const main = new Array(volume).fill(air);
  const bpd = new Map();
  for (const block of blocks) {
    const lin = block.x * sy * sz + block.y * sz + block.z;
    if (lin < 0 || lin >= volume) {
      throw new StructureError("方块 (" + block.x + "," + block.y + "," + block.z + ") 超出 " + size);
    }
    main[lin] = PALETTE_OFFSETS.get(block.type) + (block.cond ? 1 : 0) * 6 + Number(block.facing);
    bpd.set(String(lin), Tag.compound(new Map([["block_entity_data", commandBed(block, block.x)]])));
  }
  return Tag.compound(new Map([
    ["block_indices", indicesTag(main, volume, style)],
    ["entities", Tag.listOf(COMPOUND, [])],
    ["palette", Tag.compound(new Map([["default", Tag.compound(new Map([
      ["block_palette", Tag.listOf(COMPOUND, palette)],
      ["block_position_data", Tag.compound(bpd)],
    ]))]]))],
  ]));
}

function normalized(blocks) {
  if (!blocks.length) return [[], [1, 1, 1]];
  const minX = Math.min(...blocks.map(b => b.x));
  const minY = Math.min(...blocks.map(b => b.y));
  const minZ = Math.min(...blocks.map(b => b.z));
  const norm = blocks.map(b => b.copy({ x: b.x - minX, y: b.y - minY, z: b.z - minZ }));
  return [norm, [
    Math.max(...norm.map(b => b.x)) + 1,
    Math.max(...norm.map(b => b.y)) + 1,
    Math.max(...norm.map(b => b.z)) + 1,
  ]];
}

export function buildStructure(blocks, size = null, {
  formatVersion = 2, origin = [0, 0, 0], base = null, netease = false,
} = {}) {
  if (formatVersion !== 1 && formatVersion !== 2) {
    throw new StructureError("format_version 只能是 1 或 2，收到 " + formatVersion);
  }
  if (size === null) {
    [blocks, size] = normalized(blocks);
  } else {
    for (const block of blocks) {
      if (!(block.x >= 0 && block.x < size[0] && block.y >= 0 && block.y < size[1] && block.z >= 0 && block.z < size[2])) {
        throw new StructureError("方块 (" + block.x + "," + block.y + "," + block.z + ") 超出 " + size);
      }
    }
  }
  const style = formatVersion === 1 ? "list_int" : "int_array";
  const sourcePalette = netease && base ? base.palette : null;
  const inner = buildInner(blocks, size, style, sourcePalette);
  const rootValue = base && base.root ? new Map(base.root.value) : new Map();
  rootValue.set("format_version", Tag.int(formatVersion));
  rootValue.set("size", Tag.listOf(INT, size.map(v => Tag.int(v))));
  rootValue.set("structure_world_origin", Tag.listOf(INT, origin.map(v => Tag.int(v))));
  if (formatVersion === 2) {
    const compressed = zlib.deflateSync(serializeNbt(inner), { level: 6 });
    rootValue.set("compression", Tag.int(1));
    rootValue.set("structure", new Tag(BYTE_ARRAY, compressed));
  } else {
    rootValue.delete("compression");
    rootValue.set("structure", inner);
  }
  const root = Tag.compound(rootValue);
  return [root, serializeNbt(root)];
}

export function summary(structure) {
  const counts = new Map();
  let withText = 0;
  for (const block of structure.blocks.values()) {
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
    if (block.cmd.trim()) withText++;
  }
  return {
    size: [...structure.size],
    origin: [...structure.origin],
    format_version: structure.format_version,
    palette_entries: structure.palette.length,
    command_blocks: structure.blocks.size,
    block_types: Object.fromEntries(counts),
    commands_with_text: withText,
    warnings: structure.warnings,
  };
}
