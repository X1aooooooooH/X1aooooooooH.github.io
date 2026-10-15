/* BlockFlow format engine.
 * Native JavaScript readers and writers for BlockFlow structure formats.
 * The implementation owns its NBT, palette, packed-state and archive routines.
 */
(() => {
  'use strict';

  const TAG = Object.freeze({ END:0, BYTE:1, SHORT:2, INT:3, LONG:4, FLOAT:5, DOUBLE:6, BYTE_ARRAY:7, STRING:8, LIST:9, COMPOUND:10, INT_ARRAY:11, LONG_ARRAY:12 });
  const MAX_BYTES = 256 * 1024 * 1024;
  const MAX_VOLUME = 2_000_000;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder('utf-8', { fatal:false });

  const tag = (type, value) => ({ type, value });
  const compound = value => tag(TAG.COMPOUND, value);
  const list = (elementType, items) => tag(TAG.LIST, { elementType, items });
  const byte = value => tag(TAG.BYTE, Number(value) | 0);
  const short = value => tag(TAG.SHORT, Number(value) | 0);
  const int = value => tag(TAG.INT, Number(value) | 0);
  const long = value => tag(TAG.LONG, BigInt(value || 0));
  const float = value => tag(TAG.FLOAT, Number(value) || 0);
  const double = value => tag(TAG.DOUBLE, Number(value) || 0);
  const string = value => tag(TAG.STRING, String(value ?? ''));
  const intArray = values => tag(TAG.INT_ARRAY, Int32Array.from(values || []));
  const longArray = values => tag(TAG.LONG_ARRAY, BigInt64Array.from(values || [], BigInt));
  const valueOf = node => node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, 'value') ? node.value : node;
  const field = (node, key, fallback = undefined) => node?.value?.[key] ? valueOf(node.value[key]) : fallback;
  const nodeField = (node, key) => node?.value?.[key] || null;
  const asBytes = value => value instanceof Uint8Array ? value : new Uint8Array(value);
  const toArrayBuffer = value => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);

  class NBTReader {
    constructor(bytes, littleEndian = false) {
      this.bytes = asBytes(bytes);
      if (this.bytes.byteLength > MAX_BYTES) throw new Error('NBT 文件超过 256 MiB 安全限制');
      this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
      this.pos = 0;
      this.le = !!littleEndian;
    }
    ensure(count) {
      if (!Number.isSafeInteger(count) || count < 0 || this.pos + count > this.bytes.length) throw new Error('NBT 数据不完整或长度越界');
    }
    u8() { this.ensure(1); return this.view.getUint8(this.pos++); }
    i8() { this.ensure(1); return this.view.getInt8(this.pos++); }
    u16() { this.ensure(2); const v = this.view.getUint16(this.pos, this.le); this.pos += 2; return v; }
    i16() { this.ensure(2); const v = this.view.getInt16(this.pos, this.le); this.pos += 2; return v; }
    i32() { this.ensure(4); const v = this.view.getInt32(this.pos, this.le); this.pos += 4; return v; }
    i64() { this.ensure(8); const v = this.view.getBigInt64(this.pos, this.le); this.pos += 8; return v; }
    f32() { this.ensure(4); const v = this.view.getFloat32(this.pos, this.le); this.pos += 4; return v; }
    f64() { this.ensure(8); const v = this.view.getFloat64(this.pos, this.le); this.pos += 8; return v; }
    raw(count) { this.ensure(count); const out = this.bytes.slice(this.pos, this.pos + count); this.pos += count; return out; }
    str() { const size = this.u16(); return textDecoder.decode(this.raw(size)); }
    payload(type, depth = 0) {
      if (depth > 128) throw new Error('NBT 嵌套深度超过安全上限');
      switch (type) {
        case TAG.END: return null;
        case TAG.BYTE: return this.i8();
        case TAG.SHORT: return this.i16();
        case TAG.INT: return this.i32();
        case TAG.LONG: return this.i64();
        case TAG.FLOAT: return this.f32();
        case TAG.DOUBLE: return this.f64();
        case TAG.BYTE_ARRAY: { const n = this.i32(); if (n < 0 || n > MAX_BYTES) throw new Error('NBT ByteArray 长度无效'); return this.raw(n); }
        case TAG.STRING: return this.str();
        case TAG.LIST: {
          const elementType = this.u8(), n = this.i32();
          if (n < 0 || n > 4_000_000 || (elementType === TAG.END && n !== 0)) throw new Error('NBT List 长度无效');
          const items = new Array(n);
          for (let i = 0; i < n; i++) items[i] = this.payload(elementType, depth + 1);
          return { elementType, items };
        }
        case TAG.COMPOUND: {
          const out = Object.create(null); let count = 0;
          while (true) {
            const childType = this.u8();
            if (childType === TAG.END) break;
            if (++count > 2_000_000) throw new Error('NBT Compound 项目过多');
            const name = this.str();
            out[name] = tag(childType, this.payload(childType, depth + 1));
          }
          return out;
        }
        case TAG.INT_ARRAY: {
          const n = this.i32(); if (n < 0 || n > 4_000_000 || n > Math.floor((this.bytes.length - this.pos) / 4)) throw new Error('NBT IntArray 长度无效');
          const out = new Int32Array(n); for (let i = 0; i < n; i++) out[i] = this.i32(); return out;
        }
        case TAG.LONG_ARRAY: {
          const n = this.i32(); if (n < 0 || n > 4_000_000 || n > Math.floor((this.bytes.length - this.pos) / 8)) throw new Error('NBT LongArray 长度无效');
          const out = new BigInt64Array(n); for (let i = 0; i < n; i++) out[i] = this.i64(); return out;
        }
        default: throw new Error(`不支持的 NBT 标签类型：${type}`);
      }
    }
    root() {
      const type = this.u8();
      if (type !== TAG.COMPOUND) throw new Error('NBT 根标签必须是 Compound');
      const name = this.str(); const value = this.payload(type);
      if (this.pos !== this.bytes.length) throw new Error('NBT 末尾存在未解析数据');
      return { type, name, value };
    }
  }

  class NBTWriter {
    constructor(littleEndian = false) { this.le = !!littleEndian; this.parts = []; }
    push(bytes) { this.parts.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }
    number(size, setter, value) { const bytes = new Uint8Array(size); new DataView(bytes.buffer)[setter](0, value, this.le); this.push(bytes); }
    u8(v) { this.number(1, 'setUint8', v); }
    i8(v) { this.number(1, 'setInt8', v); }
    u16(v) { this.number(2, 'setUint16', v); }
    i16(v) { this.number(2, 'setInt16', v); }
    i32(v) { this.number(4, 'setInt32', v); }
    i64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v), this.le); this.push(b); }
    f32(v) { this.number(4, 'setFloat32', v); }
    f64(v) { this.number(8, 'setFloat64', v); }
    raw(bytes) { this.push(asBytes(bytes)); }
    str(value) { const bytes = textEncoder.encode(String(value ?? '')); if (bytes.length > 65535) throw new Error('NBT 字符串过长'); this.u16(bytes.length); this.raw(bytes); }
    payload(type, value, depth = 0) {
      if (depth > 128) throw new Error('NBT 嵌套深度超过安全上限');
      switch (type) {
        case TAG.END: break;
        case TAG.BYTE: this.i8(value); break;
        case TAG.SHORT: this.i16(value); break;
        case TAG.INT: this.i32(value); break;
        case TAG.LONG: this.i64(value); break;
        case TAG.FLOAT: this.f32(value); break;
        case TAG.DOUBLE: this.f64(value); break;
        case TAG.BYTE_ARRAY: this.i32(value.length); this.raw(value); break;
        case TAG.STRING: this.str(value); break;
        case TAG.LIST: {
          this.u8(value.elementType); this.i32(value.items.length);
          for (const item of value.items) this.payload(value.elementType, item, depth + 1);
          break;
        }
        case TAG.COMPOUND:
          for (const [name, child] of Object.entries(value)) { this.u8(child.type); this.str(name); this.payload(child.type, child.value, depth + 1); }
          this.u8(TAG.END); break;
        case TAG.INT_ARRAY: this.i32(value.length); for (const n of value) this.i32(n); break;
        case TAG.LONG_ARRAY: this.i32(value.length); for (const n of value) this.i64(n); break;
        default: throw new Error(`无法写入 NBT 标签 ${type}`);
      }
    }
    root(root) {
      this.u8(TAG.COMPOUND); this.str(root.name || ''); this.payload(TAG.COMPOUND, root.value);
      let size = 0; for (const part of this.parts) size += part.length;
      const out = new Uint8Array(size); let offset = 0;
      for (const part of this.parts) { out.set(part, offset); offset += part.length; }
      return out;
    }
  }

  async function inflate(bytes, format = 'gzip') {
    if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持所需的压缩格式');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function deflate(bytes, format = 'gzip') {
    if (typeof CompressionStream !== 'function') throw new Error('当前浏览器不支持所需的压缩格式');
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function maybeGunzip(bytes) {
    const b = asBytes(bytes);
    return b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b ? await inflate(b, 'gzip') : b;
  }

  function listItems(node, expectedType = null) {
    if (!node || node.type !== TAG.LIST) return [];
    if (expectedType != null && node.value.elementType !== expectedType) return [];
    return node.value.items || [];
  }
  function int3(node, fallback = [0,0,0]) {
    if (!node) return fallback.slice();
    if (node.type === TAG.INT_ARRAY || node.type === TAG.LONG_ARRAY) return Array.from(node.value).slice(0,3).map(Number);
    if (node.type === TAG.LIST) return node.value.items.slice(0,3).map(Number);
    if (node.type === TAG.COMPOUND) return ['x','y','z'].map(k => Number(field(node,k,0)));
    return fallback.slice();
  }
  function checkedSize(size) {
    if (!Array.isArray(size) || size.length !== 3 || size.some(v => !Number.isInteger(v) || v <= 0)) throw new Error('结构尺寸必须是三个正整数');
    const volume = size[0] * size[1] * size[2];
    if (!Number.isSafeInteger(volume) || volume > MAX_VOLUME) throw new Error(`结构体积超过 ${MAX_VOLUME.toLocaleString()} 个方块的安全限制`);
    return volume;
  }
  function canonicalIndex(x,y,z,size) { return x * size[1] * size[2] + y * size[2] + z; }
  function javaIndex(x,y,z,size) { return y * size[0] * size[2] + z * size[0] + x; }
  function emptyCanonical(size) {
    const volume = checkedSize(size);
    return { size:size.slice(), palette:[{name:'minecraft:air', properties:{}}], blocks:new Int32Array(volume), secondary:new Int32Array(volume).fill(-1), blockEntities:new Map(), entities:[], origin:[0,0,0], warnings:[] };
  }
  function stateString(node) {
    if (!node) return '';
    const v = node.value;
    if (node.type === TAG.BYTE) return v ? 'true' : 'false';
    return String(v);
  }
  function bedrockPaletteEntry(node) {
    const name = String(field(node,'name','minecraft:air'));
    const statesNode = nodeField(node,'states'); const properties = Object.create(null);
    if (statesNode?.type === TAG.COMPOUND) for (const [key, value] of Object.entries(statesNode.value)) properties[key] = stateString(value);
    return { name, properties, bedrockStates:statesNode ? structuredCloneSafe(statesNode) : null, version:Number(field(node,'version',18168865)) };
  }
  function structuredCloneSafe(value) {
    if (value == null || typeof value !== 'object') return value;
    if (ArrayBuffer.isView(value)) return value.slice();
    if (Array.isArray(value)) return value.map(structuredCloneSafe);
    const out = Object.create(null); for (const key of Object.keys(value)) out[key] = structuredCloneSafe(value[key]); return out;
  }
  function unwrapBlockEntity(node) {
    if (!node || node.type !== TAG.COMPOUND) return compound(Object.create(null));
    const wrapped = node.value?.block_entity_data;
    return wrapped?.type === TAG.COMPOUND ? structuredCloneSafe(wrapped) : structuredCloneSafe(node);
  }
  function commandModeForName(name) {
    if (name === 'minecraft:repeating_command_block') return 1;
    if (name === 'minecraft:chain_command_block') return 2;
    return 0;
  }
  function isCommandBlockName(name) {
    return name === 'minecraft:command_block' || name === 'minecraft:repeating_command_block' || name === 'minecraft:chain_command_block';
  }
  function coordinatesForIndex(index, size) {
    const x = Math.floor(index / (size[1] * size[2]));
    const rem = index % (size[1] * size[2]);
    const y = Math.floor(rem / size[2]);
    return [x, y, rem % size[2]];
  }
  function javaBlockEntity(node, canonical, index) {
    const result = unwrapBlockEntity(node);
    const position = coordinatesForIndex(index, canonical.size);
    const blockIndex = canonical.blocks[index];
    const blockName = canonical.palette[blockIndex]?.name || '';
    if (isCommandBlockName(blockName) || result.value?.Command) {
      result.value.id = string('minecraft:command_block');
      result.value.x = int(position[0]); result.value.y = int(position[1]); result.value.z = int(position[2]);
      if (!result.value.TrackOutput) result.value.TrackOutput = byte(1);
      if (!result.value.UpdateLastExecution) result.value.UpdateLastExecution = byte(0);
      if (!result.value.auto) result.value.auto = byte(Number(valueOf(result.value.auto)) ? 1 : 0);
      delete result.value.LPCommandMode;
      delete result.value.LPCondionalMode;
      delete result.value.LPRedstoneMode;
      delete result.value.ExecuteOnFirstTick;
      delete result.value.Version;
    }
    return result;
  }
  function bedrockBlockEntity(node, canonical, index) {
    const source = unwrapBlockEntity(node);
    const result = source.type === TAG.COMPOUND ? structuredCloneSafe(source) : compound(Object.create(null));
    const blockIndex = canonical.blocks[index];
    const blockName = canonical.palette[blockIndex]?.name || '';
    if (isCommandBlockName(blockName) || result.value?.Command) {
      const [x,y,z] = coordinatesForIndex(index, canonical.size);
      const conditional = canonical.palette[blockIndex]?.properties?.conditional;
      const conditionalValue = conditional === true || conditional === 'true' || conditional === '1';
      result.value.id = string('CommandBlock');
      result.value.x = int(x); result.value.y = int(y); result.value.z = int(z);
      result.value.LPCommandMode = int(commandModeForName(blockName));
      result.value.LPCondionalMode = byte(conditionalValue ? 1 : 0);
      result.value.conditionalMode = byte(conditionalValue ? 1 : 0);
      if (!result.value.ExecuteOnFirstTick) result.value.ExecuteOnFirstTick = byte(0);
      if (!result.value.LPRedstoneMode) result.value.LPRedstoneMode = byte(0);
      if (!result.value.TickDelay) result.value.TickDelay = int(0);
      if (!result.value.TrackOutput) result.value.TrackOutput = byte(1);
      if (!result.value.Version) result.value.Version = int(50);
    }
    return compound({ block_entity_data: result });
  }

  function getBedrockLayers(node, volume) {
    if (node?.type !== TAG.LIST) throw new Error('mcstructure 缺少 block_indices');
    const { elementType, items } = node.value;
    const result = [];
    if (elementType === TAG.INT_ARRAY) {
      for (const item of items) result.push(Array.from(item.value || item));
    } else if (elementType === TAG.LIST) {
      for (const item of items) {
        if (item?.elementType !== TAG.INT) throw new Error('mcstructure block_indices 内层必须是整数列表');
        result.push(Array.from(item.items, Number));
      }
    } else throw new Error('mcstructure block_indices 类型不受支持');
    if (!result.length || result.length > 2 || result.some(layer => layer.length !== volume)) throw new Error('mcstructure block_indices 长度与尺寸不匹配');
    return result;
  }
  function parseMcstructure(bytes) {
    const root = new NBTReader(bytes, true).root();
    const size = int3(nodeField(root,'size'));
    const volume = checkedSize(size);
    const structure = nodeField(root,'structure');
    const layers = getBedrockLayers(nodeField(structure,'block_indices'), volume);
    const def = nodeField(nodeField(nodeField(structure,'palette'),'default'),'block_palette');
    const palette = listItems(def, TAG.COMPOUND).map(raw => bedrockPaletteEntry({ type:TAG.COMPOUND, value:raw }));
    if (!palette.length) throw new Error('mcstructure 调色板为空');
    for (const layer of layers) for (const index of layer) if (!Number.isInteger(index) || index < -1 || index >= palette.length) throw new Error('mcstructure 方块索引越界');
    const canonical = { size, palette, blocks:Int32Array.from(layers[0]), secondary:new Int32Array(volume).fill(-1), blockEntities:new Map(), entities:[], origin:int3(nodeField(root,'structure_world_origin')), warnings:[] };
    if (layers[1]) canonical.secondary = Int32Array.from(layers[1]);
    const bpd = nodeField(nodeField(nodeField(structure,'palette'),'default'),'block_position_data');
    if (bpd?.type === TAG.COMPOUND) for (const [key, val] of Object.entries(bpd.value)) {
      const index = Number(key); if (Number.isInteger(index) && index >= 0 && index < volume) canonical.blockEntities.set(index, structuredCloneSafe(val));
    }
    canonical.entities = listItems(nodeField(structure,'entities'), TAG.COMPOUND).map(structuredCloneSafe);
    return canonical;
  }
  function stateNodeFromString(value) {
    const str = String(value);
    if (str === 'true' || str === 'false') return byte(str === 'true' ? 1 : 0);
    if (/^-?\d+$/.test(str)) { const n = Number(str); if (Number.isSafeInteger(n)) return int(n); }
    return string(str);
  }
  function canonicalPaletteTag(entry) {
    const states = Object.create(null);
    if (entry.bedrockStates?.type === TAG.COMPOUND) {
      for (const [k,v] of Object.entries(entry.bedrockStates.value)) states[k] = structuredCloneSafe(v);
    } else {
      for (const [k,v] of Object.entries(entry.properties || {})) states[k] = stateNodeFromString(v);
    }
    return compound({ name:string(entry.name), states:compound(states), version:int(entry.version || 18168865) });
  }
  function serializeMcstructure(canonical) {
    const [sx,sy,sz] = canonical.size, volume = checkedSize(canonical.size);
    if (canonical.blocks.length !== volume) throw new Error('内部方块数组长度错误');
    const paletteTags = canonical.palette.map(canonicalPaletteTag);
    const layer0 = Array.from(canonical.blocks, Number);
    const layer1 = canonical.secondary?.length === volume ? Array.from(canonical.secondary, Number) : new Array(volume).fill(-1);
    const paletteMap = Object.create(null);
    for (const [index, entry] of canonical.blockEntities || []) {
      if (!Number.isInteger(index) || index < 0 || index >= volume) continue;
      paletteMap[String(index)] = bedrockBlockEntity(entry, canonical, index);
    }
    const root = compound({
      format_version:int(1),
      size:list(TAG.INT,[sx,sy,sz]),
      structure:compound({
        block_indices:list(TAG.LIST,[{elementType:TAG.INT,items:layer0},{elementType:TAG.INT,items:layer1}]),
        entities:list(TAG.COMPOUND,(canonical.entities || []).map(structuredCloneSafe)),
        palette:compound({ default:compound({ block_palette:list(TAG.COMPOUND,paletteTags.map(node=>node.value)), block_position_data:compound(paletteMap) }) })
      }),
      structure_world_origin:list(TAG.INT,canonical.origin || [0,0,0])
    });
    return new NBTWriter(true).root({ type:TAG.COMPOUND, name:'', value:root.value });
  }

  function javaStateKey(entry) {
    const pairs = Object.entries(entry.properties || {}).sort(([a],[b]) => a.localeCompare(b));
    return entry.name + (pairs.length ? '[' + pairs.map(([k,v]) => `${k}=${v}`).join(',') + ']' : '');
  }
  function parseJavaStateKey(key) {
    const text = String(key); const m = /^([^[]+)(?:\[(.*)\])?$/.exec(text);
    if (!m) throw new Error(`无法解析方块状态：${text}`);
    const properties = Object.create(null);
    if (m[2]) for (const part of m[2].split(',')) { const i = part.indexOf('='); if (i > 0) properties[part.slice(0,i).trim()] = part.slice(i+1).trim(); }
    return { name:m[1], properties };
  }
  function javaPaletteNode(entry) {
    const properties = Object.create(null);
    for (const [k,v] of Object.entries(entry.properties || {})) properties[k] = string(v);
    const value = { Name:string(entry.name) };
    if (Object.keys(properties).length) value.Properties = compound(properties);
    return compound(value);
  }
  function parseJavaPaletteNode(node) {
    const name = String(field(node,'Name',field(node,'name','minecraft:air')));
    const propNode = nodeField(node,'Properties') || nodeField(node,'properties');
    const properties = Object.create(null);
    if (propNode?.type === TAG.COMPOUND) for (const [k,v] of Object.entries(propNode.value)) properties[k] = String(valueOf(v));
    return { name, properties };
  }
  function paletteLookup(palette, entry, cache) {
    const key = javaStateKey(entry);
    if (cache.has(key)) return cache.get(key);
    const index = palette.length;
    palette.push({ name:entry.name, properties:entry.properties || {} }); cache.set(key,index); return index;
  }
  function readPackedLongs(longs, bits, count, tight) {
    const out = new Uint32Array(count); const mask = (1n << BigInt(bits)) - 1n;
    if (tight) {
      for (let i=0;i<count;i++) {
        const bit = BigInt(i * bits), word = Number(bit >> 6n), shift = Number(bit & 63n);
        let value = BigInt.asUintN(64, BigInt(longs[word] || 0n)) >> BigInt(shift);
        if (shift + bits > 64 && word + 1 < longs.length) value |= BigInt.asUintN(64, BigInt(longs[word+1])) << BigInt(64-shift);
        out[i] = Number(value & mask);
      }
    } else {
      const perLong = Math.floor(64 / bits);
      for (let i=0;i<count;i++) { const word=Math.floor(i/perLong), shift=(i%perLong)*bits; out[i]=Number((BigInt.asUintN(64,BigInt(longs[word]||0n))>>BigInt(shift))&mask); }
    }
    return out;
  }
  function writePackedLongs(values, bits, tight) {
    const mask = (1n << BigInt(bits)) - 1n;
    if (tight) {
      const count = Math.ceil(values.length * bits / 64), longs = new BigInt64Array(count);
      for (let i=0;i<values.length;i++) {
        const bit = BigInt(i * bits), word = Number(bit >> 6n), shift = Number(bit & 63n), value = BigInt(values[i]) & mask;
        longs[word] = BigInt.asIntN(64, BigInt.asUintN(64,longs[word]) | (value << BigInt(shift)));
        if (shift + bits > 64) longs[word+1] = BigInt.asIntN(64, BigInt.asUintN(64,longs[word+1]) | (value >> BigInt(64-shift)));
      }
      return longs;
    }
    const perLong=Math.floor(64/bits), count=Math.ceil(values.length/perLong), longs=new BigInt64Array(count);
    for (let i=0;i<values.length;i++) { const word=Math.floor(i/perLong),shift=(i%perLong)*bits; longs[word]=BigInt.asIntN(64,BigInt.asUintN(64,longs[word])|((BigInt(values[i])&mask)<<BigInt(shift))); }
    return longs;
  }
  function parseLitematic(bytes) {
    return maybeGunzip(bytes).then(raw => {
      const root = new NBTReader(raw,false).root(); const regionsNode=nodeField(root,'Regions');
      if (!regionsNode || regionsNode.type!==TAG.COMPOUND) throw new Error('Litematic 缺少 Regions');
      const regions=Object.entries(regionsNode.value); if (!regions.length) throw new Error('Litematic 没有结构区域');
      const [regionName, regionTag] = regions[0];
      const region=regionTag.value, sizeRaw=int3(nodeField(regionTag,'Size'));
      const size=sizeRaw.map(Math.abs), volume=checkedSize(size), position=int3(nodeField(regionTag,'Position'));
      const paletteNode=nodeField(regionTag,'BlockStatePalette');
      const palette=listItems(paletteNode,TAG.COMPOUND).map(raw=>parseJavaPaletteNode({type:TAG.COMPOUND,value:raw}));
      if (!palette.length) throw new Error('Litematic 方块调色板为空');
      const bits=Math.max(2,Math.ceil(Math.log2(palette.length)));
      const packed=Array.from(valueOf(nodeField(regionTag,'BlockStates')) || [],BigInt);
      const decoded=readPackedLongs(packed,bits,volume,true);
      const canonical=emptyCanonical(size); canonical.palette=palette;
      for(let y=0;y<size[1];y++)for(let z=0;z<size[2];z++)for(let x=0;x<size[0];x++){
        const pi=javaIndex(x,y,z,size),ci=canonicalIndex(x,y,z,size);
        let srcX=x,srcY=y,srcZ=z;
        if(sizeRaw[0]<0)srcX=size[0]-1-x;if(sizeRaw[1]<0)srcY=size[1]-1-y;if(sizeRaw[2]<0)srcZ=size[2]-1-z;
        const src=javaIndex(srcX,srcY,srcZ,size);const p=decoded[src];canonical.blocks[ci]=p<palette.length?p:0;
      }
      canonical.origin=position;
      if(regions.length>1) canonical.warnings.push(`Litematic 含有 ${regions.length} 个区域；当前导入第一个区域「${regionName}」，其余区域未合并。`);
      for(const blockEntity of listItems(nodeField(regionTag,'TileEntities'),TAG.COMPOUND)){
        const x=Number(field({type:TAG.COMPOUND,value:blockEntity},'x',0))-position[0];
        const y=Number(field({type:TAG.COMPOUND,value:blockEntity},'y',0))-position[1];
        const z=Number(field({type:TAG.COMPOUND,value:blockEntity},'z',0))-position[2];
        if(x>=0&&y>=0&&z>=0&&x<size[0]&&y<size[1]&&z<size[2])canonical.blockEntities.set(canonicalIndex(x,y,z,size),compound(blockEntity));
      }
      return canonical;
    });
  }
  function writeLitematic(canonical,name='BlockFlow') {
    const size=canonical.size, volume=checkedSize(size); const palette=[{name:'minecraft:air',properties:{}}], cache=new Map([[javaStateKey(palette[0]),0]]);
    const values=new Uint32Array(volume);
    for(let y=0;y<size[1];y++)for(let z=0;z<size[2];z++)for(let x=0;x<size[0];x++){
      const ci=canonicalIndex(x,y,z,size),src=canonical.blocks[ci];const entry=src>=0?canonical.palette[src]:palette[0];
      values[javaIndex(x,y,z,size)]=paletteLookup(palette,entry||palette[0],cache);
    }
    const bits=Math.max(2,Math.ceil(Math.log2(palette.length))), packed=writePackedLongs(values,bits,true);
    const tiles=[];
    for(const [index,node] of canonical.blockEntities){
      if(index<0||index>=volume) continue;
      tiles.push(javaBlockEntity(node, canonical, index));
    }
    const region=compound({
      Position:compound({x:int(0),y:int(0),z:int(0)}),
      Size:compound({x:int(size[0]),y:int(size[1]),z:int(size[2])}),
      BlockStatePalette:list(TAG.COMPOUND,palette.map(entry=>javaPaletteNode(entry).value)),
      BlockStates:longArray(packed),
      TileEntities:list(TAG.COMPOUND,tiles.map(node=>node.value)), Entities:list(TAG.COMPOUND,canonical.entities||[]),
      PendingBlockTicks:list(TAG.COMPOUND,[]), PendingFluidTicks:list(TAG.COMPOUND,[])
    });
    const now=BigInt(Date.now());
    const metadata=compound({Name:string(name),Author:string('BlockFlow'),Description:string(''),RegionCount:int(1),TotalBlocks:long(values.reduce((a,v)=>a+(palette[v]?.name==='minecraft:air'?0:1),0)),TotalVolume:long(volume),TimeCreated:long(now),TimeModified:long(now),EnclosingSize:compound({x:int(size[0]),y:int(size[1]),z:int(size[2])})});
    const root=compound({Version:int(6),SubVersion:int(1),MinecraftDataVersion:int(3953),Metadata:metadata,Regions:compound({BlockFlow:region})});
    return new NBTWriter(false).root({type:TAG.COMPOUND,name:'',value:root.value});
  }

  function decodeVarInts(bytes, count) {
    const out=new Uint32Array(count);let p=0;
    for(let i=0;i<count;i++){let value=0,shift=0,b;do{if(p>=bytes.length||shift>28)throw new Error('Schematic BlockData VarInt 损坏');b=bytes[p++];value|=(b&127)<<shift;shift+=7;}while(b&128);out[i]=value>>>0;}
    if(p>bytes.length)throw new Error('Schematic BlockData 越界');return out;
  }
  function encodeVarInts(values) {
    const out=[];
    for(const raw of values){let v=Number(raw)>>>0;while(v>=128){out.push((v&127)|128);v>>>=7;}out.push(v);}
    return Uint8Array.from(out);
  }
  function readBlockEntities(listNode, canonical, kind) {
    for(const entry of listItems(listNode,TAG.COMPOUND)){
      const posNode=nodeField({type:TAG.COMPOUND,value:entry},'Pos');
      let pos=posNode?int3(posNode):[Number(field({type:TAG.COMPOUND,value:entry},'x',0)),Number(field({type:TAG.COMPOUND,value:entry},'y',0)),Number(field({type:TAG.COMPOUND,value:entry},'z',0))];
      const [x,y,z]=pos;if(x<0||y<0||z<0||x>=canonical.size[0]||y>=canonical.size[1]||z>=canonical.size[2])continue;
      let copy=structuredCloneSafe(entry);
      if(kind==='sponge') { if(copy.Id&&!copy.id)copy.id=copy.Id; delete copy.Id; delete copy.Pos; }
      canonical.blockEntities.set(canonicalIndex(x,y,z,canonical.size),compound(copy));
    }
  }
  function parseSchem(bytes) {
    return maybeGunzip(bytes).then(raw=>{
      const root=new NBTReader(raw,false).root();
      const rootValue=root.value; const sNode=nodeField(root,'Schematic') || root;
      const v=Number(field(sNode,'Version',2));
      const width=Number(field(sNode,'Width',0)),height=Number(field(sNode,'Height',0)),length=Number(field(sNode,'Length',0));
      const size=[width,height,length],volume=checkedSize(size);const canonical=emptyCanonical(size);
      let paletteNode=null,dataNode=null,entitiesNode=null;
      if(v>=3){const blocksNode=nodeField(sNode,'Blocks');paletteNode=nodeField(blocksNode,'Palette');dataNode=nodeField(blocksNode,'Data');entitiesNode=nodeField(blocksNode,'BlockEntities');}
      else{paletteNode=nodeField(sNode,'Palette');dataNode=nodeField(sNode,'BlockData');entitiesNode=nodeField(sNode,'TileEntities');}
      if(!paletteNode||paletteNode.type!==TAG.COMPOUND)throw new Error('Schematic 缺少方块调色板');
      const entries=Object.entries(paletteNode.value).map(([key,n])=>[key,Number(valueOf(n))]);
      const byIndex=[];for(const [key,index] of entries){if(index<0||index>=volume+1)continue;byIndex[index]=parseJavaStateKey(key);}
      if(!byIndex.length)throw new Error('Schematic 调色板为空');canonical.palette=byIndex.map(v=>v||{name:'minecraft:air',properties:{}});
      const data=asBytes(valueOf(dataNode)||new Uint8Array());const indices=decodeVarInts(data,volume);
      for(let i=0;i<volume;i++){const x=i%width,z=Math.floor(i/width)%length,y=Math.floor(i/(width*length));canonical.blocks[canonicalIndex(x,y,z,size)]=indices[i]<canonical.palette.length?indices[i]:0;}
      readBlockEntities(entitiesNode,canonical,'sponge');return canonical;
    });
  }
  function writeSchem(canonical) {
    const size=canonical.size, volume=checkedSize(size), palette=[],cache=new Map(),dataValues=new Uint32Array(volume);
    for(let y=0;y<size[1];y++)for(let z=0;z<size[2];z++)for(let x=0;x<size[0];x++){
      const i=javaIndex(x,y,z,size),ci=canonicalIndex(x,y,z,size),entry=canonical.palette[canonical.blocks[ci]]||{name:'minecraft:air',properties:{}};
      dataValues[i]=paletteLookup(palette,entry,cache);
    }
    const paletteCompound=Object.create(null);for(let i=0;i<palette.length;i++)paletteCompound[javaStateKey(palette[i])]=int(i);
    const blockEntities=[];
    for(const [index,node] of canonical.blockEntities){
      if(index<0||index>=volume) continue;
      const e=javaBlockEntity(node, canonical, index).value;
      e.Id=e.id||string('minecraft:command_block'); delete e.id;
      e.Pos=intArray(coordinatesForIndex(index,size)); blockEntities.push(e);
    }
    const schematic=compound({Version:int(3),DataVersion:int(3953),Width:short(size[0]),Height:short(size[1]),Length:short(size[2]),Offset:intArray([0,0,0]),Blocks:compound({Palette:compound(paletteCompound),Data:tag(TAG.BYTE_ARRAY,encodeVarInts(dataValues)),BlockEntities:list(TAG.COMPOUND,blockEntities)}),Entities:list(TAG.COMPOUND,[])});
    return deflate(new NBTWriter(false).root({type:TAG.COMPOUND,name:'',value:{Schematic:schematic}}));
  }

  const LEGACY_TO_JAVA = new Map([
    [0,'minecraft:air'],[1,'minecraft:stone'],[2,'minecraft:grass_block'],[3,'minecraft:dirt'],[4,'minecraft:cobblestone'],[5,'minecraft:oak_planks'],[6,'minecraft:oak_sapling'],[7,'minecraft:bedrock'],[8,'minecraft:water'],[9,'minecraft:water'],[10,'minecraft:lava'],[11,'minecraft:lava'],[12,'minecraft:sand'],[13,'minecraft:gravel'],[14,'minecraft:gold_ore'],[15,'minecraft:iron_ore'],[16,'minecraft:coal_ore'],[17,'minecraft:oak_log'],[18,'minecraft:oak_leaves'],[20,'minecraft:glass'],[21,'minecraft:lapis_ore'],[22,'minecraft:lapis_block'],[24,'minecraft:sandstone'],[41,'minecraft:gold_block'],[42,'minecraft:iron_block'],[45,'minecraft:bricks'],[46,'minecraft:tnt'],[47,'minecraft:bookshelf'],[48,'minecraft:mossy_cobblestone'],[49,'minecraft:obsidian'],[50,'minecraft:torch'],[51,'minecraft:fire'],[52,'minecraft:spawner'],[54,'minecraft:chest'],[56,'minecraft:diamond_ore'],[57,'minecraft:diamond_block'],[58,'minecraft:crafting_table'],[61,'minecraft:furnace'],[62,'minecraft:furnace'],[64,'minecraft:oak_door'],[65,'minecraft:ladder'],[67,'minecraft:stone_stairs'],[69,'minecraft:lever'],[73,'minecraft:redstone_ore'],[76,'minecraft:redstone_torch'],[77,'minecraft:stone_button'],[78,'minecraft:snow'],[79,'minecraft:ice'],[80,'minecraft:snow_block'],[82,'minecraft:clay'],[87,'minecraft:netherrack'],[88,'minecraft:soul_sand'],[89,'minecraft:glowstone'],[95,'minecraft:white_stained_glass'],[98,'minecraft:stone_bricks'],[103,'minecraft:melon'],[107,'minecraft:oak_fence_gate'],[116,'minecraft:enchanting_table'],[121,'minecraft:end_stone'],[130,'minecraft:ender_chest'],[133,'minecraft:emerald_block'],[152,'minecraft:redstone_block'],[153,'minecraft:nether_quartz_ore'],[155,'minecraft:quartz_block'],[159,'minecraft:white_terracotta'],[165,'minecraft:slime_block'],[166,'minecraft:barrier'],[169,'minecraft:sea_lantern'],[170,'minecraft:hay_block'],[172,'minecraft:terracotta'],[173,'minecraft:coal_block'],[174,'minecraft:packed_ice'],[179,'minecraft:red_sandstone'],[198,'minecraft:end_rod'],[200,'minecraft:chorus_flower'],[201,'minecraft:purpur_block'],[202,'minecraft:purpur_pillar'],[206,'minecraft:end_stone_bricks'],[213,'minecraft:magma_block'],[214,'minecraft:nether_wart_block'],[215,'minecraft:red_nether_bricks'],[216,'minecraft:bone_block'],[255,'minecraft:structure_block']
  ]);

  const JAVA_TO_LEGACY = new Map();
  for (const [id,name] of LEGACY_TO_JAVA) if (!JAVA_TO_LEGACY.has(name)) JAVA_TO_LEGACY.set(name,id);

  function parseLegacySchematic(bytes) {
    return maybeGunzip(bytes).then(raw => {
      const root = new NBTReader(raw,false).root();
      const width=Number(field(root,'Width',0)),height=Number(field(root,'Height',0)),length=Number(field(root,'Length',0));
      const size=[width,height,length],volume=checkedSize(size),canonical=emptyCanonical(size);
      const blocks=asBytes(valueOf(nodeField(root,'Blocks'))||new Uint8Array());
      const data=asBytes(valueOf(nodeField(root,'Data'))||new Uint8Array());
      const add=asBytes(valueOf(nodeField(root,'AddBlocks'))||new Uint8Array());
      if(blocks.length<volume||data.length<volume)throw new Error('旧版 Schematic 的 Blocks/Data 数组长度不足');
      const customPalette=listItems(nodeField(root,'BlockFlowPalette'),TAG.COMPOUND).map(n=>({name:String(field({type:TAG.COMPOUND,value:n},'Name','minecraft:air')),properties:Object.fromEntries(Object.entries(nodeField({type:TAG.COMPOUND,value:n},'Properties')?.value||{}).map(([k,v])=>[k,String(valueOf(v))]))}));
      const customIndices=valueOf(nodeField(root,'BlockFlowIndices'));
      if(customPalette.length&&customIndices?.length===volume){
        canonical.palette=customPalette;canonical.blocks=Int32Array.from(customIndices);
      }else{
        const byKey=new Map();canonical.palette=[];
        const high=(i)=>{const b=add[Math.floor(i/2)]||0;return (i&1)?(b>>4)&15:b&15;};
        for(let i=0;i<volume;i++){
          const id=blocks[i]|(high(i)<<8),name=LEGACY_TO_JAVA.get(id)||'minecraft:air';
          const meta=data[i]&15,entry={name,properties:{legacy_data:String(meta)}};
          const key=javaStateKey(entry);let pi=byKey.get(key);if(pi==null){pi=canonical.palette.length;canonical.palette.push(entry);byKey.set(key,pi);} 
          const x=i%width,z=Math.floor(i/width)%length,y=Math.floor(i/(width*length));canonical.blocks[canonicalIndex(x,y,z,size)]=pi;
        }
      }
      readBlockEntities(nodeField(root,'TileEntities'),canonical,'legacy');
      return canonical;
    });
  }
  async function writeLegacySchematic(canonical) {
    const [sx,sy,sz]=canonical.size,volume=checkedSize(canonical.size);
    if([sx,sy,sz].some(v=>v>32767))throw new Error('旧版 .schematic 的尺寸不能超过 32767');
    const blocks=new Uint8Array(volume),data=new Uint8Array(volume),add=new Uint8Array(Math.ceil(volume/2));
    const indices=new Int32Array(volume);let lost=0;
    for(let i=0;i<volume;i++){
      const x=i%sx,z=Math.floor(i/sx)%sz,y=Math.floor(i/(sx*sz));const ci=canonicalIndex(x,y,z,canonical.size);const p=canonical.blocks[ci];const entry=canonical.palette[p]||{name:'minecraft:air',properties:{}};
      let legacy=JAVA_TO_LEGACY.get(entry.name);
      if(legacy==null){legacy=0;lost++;}
      blocks[i]=legacy&255;const hi=(legacy>>8)&15;if(i&1)add[Math.floor(i/2)]|=hi<<4;else add[Math.floor(i/2)]|=hi;
      data[i]=Number(entry.properties?.legacy_data||0)&15;indices[ci]=p;
    }
    const palette=canonical.palette.map(entry=>compound({Name:string(entry.name),Properties:compound(Object.fromEntries(Object.entries(entry.properties||{}).map(([k,v])=>[k,string(v)])))}));
    const tileEntities=[];
    for(const [index,node] of canonical.blockEntities){
      if(index<0||index>=volume) continue;
      const e=javaBlockEntity(node, canonical, index).value;
      e.id=string('Control');
      const [x,y,z]=coordinatesForIndex(index,canonical.size);e.x=int(x);e.y=int(y);e.z=int(z);
      tileEntities.push(e);
    }
    const root=compound({Materials:string('Alpha'),Width:short(sx),Height:short(sy),Length:short(sz),WEOrigin:intArray([0,0,0]),Blocks:tag(TAG.BYTE_ARRAY,blocks),Data:tag(TAG.BYTE_ARRAY,data),AddBlocks:tag(TAG.BYTE_ARRAY,add),Entities:list(TAG.COMPOUND,[]),TileEntities:list(TAG.COMPOUND,tileEntities),BlockFlowPalette:list(TAG.COMPOUND,palette.map(node=>node.value)),BlockFlowIndices:intArray(indices)});
    const out=await deflate(new NBTWriter(false).root({type:TAG.COMPOUND,name:'',value:root.value}));
    return {bytes:out,warnings:lost?[`${lost} 个方块没有对应的旧版 1.12 方块 ID；标准 Blocks 数组中已写为空气，BlockFlow 自定义扩展保留完整名称和状态。`]:[]};
  }

  function parseStructureTemplate(bytes) {
    return maybeGunzip(bytes).then(raw=>{
      const root=new NBTReader(raw,false).root();
      const paletteNodes=listItems(nodeField(root,'palette'),TAG.COMPOUND);
      const palette=paletteNodes.map(raw=>parseJavaPaletteNode({type:TAG.COMPOUND,value:raw}));
      const blockNodes=listItems(nodeField(root,'blocks'),TAG.COMPOUND);
      if(!palette.length||!blockNodes.length)throw new Error('Java 结构 NBT 缺少 palette 或 blocks');
      let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(const b of blockNodes){const p=int3(nodeField({type:TAG.COMPOUND,value:b},'pos'));for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}}
      const size=max.map((v,i)=>v-min[i]+1);checkedSize(size);const canonical=emptyCanonical(size);canonical.palette=palette;
      for(const b of blockNodes){const bn={type:TAG.COMPOUND,value:b};const p=int3(nodeField(bn,'pos')).map((v,i)=>v-min[i]);const state=Number(field(bn,'state',-1));if(state<0||state>=palette.length)continue;const index=canonicalIndex(p[0],p[1],p[2],size);canonical.blocks[index]=state;const nbt=nodeField(bn,'nbt');if(nbt?.type===TAG.COMPOUND)canonical.blockEntities.set(index,structuredCloneSafe(nbt));}
      for(const e of listItems(nodeField(root,'entities'),TAG.COMPOUND))canonical.entities.push(structuredCloneSafe(e));
      canonical.origin=min.map(v=>Number.isFinite(v)?v:0);return canonical;
    });
  }

  function writeWsmr(canonical) {
    const size=canonical.size,volume=checkedSize(size);
    const palette=canonical.palette.map(entry=>compound({Name:string(entry.name),Properties:compound(Object.fromEntries(Object.entries(entry.properties||{}).map(([k,v])=>[k,string(v)])))}));
    const blockEntities=[];
    for(const [index,node] of canonical.blockEntities){blockEntities.push(compound({Index:int(index),Data:node?.type===TAG.COMPOUND?structuredCloneSafe(node):compound({})}));}
    const root=compound({BlockFlowWSMR:compound({Version:int(2),Size:intArray(size),Origin:intArray(canonical.origin||[0,0,0]),Palette:list(TAG.COMPOUND,palette.map(node=>node.value)),Blocks:intArray(canonical.blocks),SecondaryBlocks:intArray(canonical.secondary||new Int32Array(volume).fill(-1)),BlockEntities:list(TAG.COMPOUND,blockEntities.map(node=>node.value)),Entities:list(TAG.COMPOUND,canonical.entities||[])})});
    return deflate(new NBTWriter(false).root({type:TAG.COMPOUND,name:'',value:root.value}));
  }
  async function parseWsmr(bytes) {
    const raw=await maybeGunzip(bytes);const root=new NBTReader(raw,false).root();const body=nodeField(root,'BlockFlowWSMR');
    if(!body||Number(field(body,'Version',0))!==2)throw new Error('该 WSMR 不是 BlockFlow 原生格式 v2；旧版 WSMR 兼容解析尚未迁移');
    const size=int3(nodeField(body,'Size'));const volume=checkedSize(size);const p=listItems(nodeField(body,'Palette'),TAG.COMPOUND).map(n=>({name:String(field({type:TAG.COMPOUND,value:n},'Name','minecraft:air')),properties:Object.fromEntries(Object.entries(nodeField({type:TAG.COMPOUND,value:n},'Properties')?.value||{}).map(([k,v])=>[k,String(valueOf(v))]))}));
    const blocks=Array.from(valueOf(nodeField(body,'Blocks'))||[]);if(blocks.length!==volume)throw new Error('WSMR Blocks 长度与尺寸不匹配');
    const canonical={size,palette:p,blocks:Int32Array.from(blocks),secondary:Int32Array.from(valueOf(nodeField(body,'SecondaryBlocks'))||new Int32Array(volume).fill(-1)),blockEntities:new Map(),entities:listItems(nodeField(body,'Entities'),TAG.COMPOUND).map(v=>structuredCloneSafe(v)),origin:int3(nodeField(body,'Origin')),warnings:[]};
    for(const n of listItems(nodeField(body,'BlockEntities'),TAG.COMPOUND)){const bn={type:TAG.COMPOUND,value:n};canonical.blockEntities.set(Number(field(bn,'Index',-1)),structuredCloneSafe(nodeField(bn,'Data')));}
    return canonical;
  }

  async function parseZip(bytes) {
    const b=asBytes(bytes);
    if(b.byteLength>MAX_BYTES)throw new Error('ZIP 文件超过 256 MiB 安全限制');
    const view=new DataView(b.buffer,b.byteOffset,b.byteLength);let eocd=-1;
    for(let p=Math.max(0,b.length-65557);p<=b.length-22;p++){if(view.getUint32(p,true)===0x06054b50)eocd=p;}
    if(eocd<0)throw new Error('ZIP 目录结束记录不存在');
    const count=view.getUint16(eocd+10,true),centralOffset=view.getUint32(eocd+16,true);
    if(count>8192||centralOffset>=b.length)throw new Error('ZIP 条目数量或中央目录偏移超出安全范围');
    let p=centralOffset,totalExpanded=0;const files=[];
    for(let i=0;i<count;i++){
      if(p+46>b.length||view.getUint32(p,true)!==0x02014b50)throw new Error('ZIP 中央目录损坏');
      const method=view.getUint16(p+10,true),compressedSize=view.getUint32(p+20,true),size=view.getUint32(p+24,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),localOffset=view.getUint32(p+42,true);
      if(size>MAX_BYTES||compressedSize>MAX_BYTES)throw new Error('ZIP 单个文件超过 256 MiB 安全限制');
      totalExpanded+=size;if(totalExpanded>MAX_BYTES)throw new Error('ZIP 解压后总大小超过 256 MiB 安全限制');
      const nameStart=p+46,nameEnd=nameStart+nameLen,next=nameEnd+extraLen+commentLen;
      if(next>b.length)throw new Error('ZIP 中央目录条目长度越界');
      const name=textDecoder.decode(b.subarray(nameStart,nameEnd));p=next;
      if(name.endsWith('/'))continue;
      const lp=localOffset;if(lp+30>b.length||view.getUint32(lp,true)!==0x04034b50)throw new Error(`ZIP 本地文件头损坏：${name}`);
      const localName=view.getUint16(lp+26,true),localExtra=view.getUint16(lp+28,true),start=lp+30+localName+localExtra,end=start+compressedSize;
      if(end>b.length)throw new Error(`ZIP 文件数据越界：${name}`);
      const compressed=b.subarray(start,end);let data;
      if(method===0)data=compressed.slice();else if(method===8)data=await inflate(compressed,'deflate-raw');else continue;
      if(data.length!==size)throw new Error(`ZIP 文件 ${name} 解压长度不符`);
      files.push({name,bytes:data});
    }
    return files;
  }
  async function parseArchive(bytes,name) {
    const files=await parseZip(bytes);
    const preferred=files.filter(f=>/\.mcstructure$/i.test(f.name)).concat(files.filter(f=>/\.(litematic|schem|schematic|nbt|wsmr)$/i.test(f.name)));
    if(!preferred.length){
      if(files.some(f=>/\.ldb$|\.log$/.test(f.name)||f.name.toLowerCase().includes('/db/')))throw new Error('检测到 Bedrock LevelDB 世界存档。当前原生引擎已移除旧世界转换器，LevelDB 读写模块正在独立迁移；请先从世界中导出 .mcstructure。');
      throw new Error('压缩包中没有可识别的结构文件');
    }
    const selected=preferred[0];return parseInput(selected.bytes,selected.name);
  }

  async function parseMca(bytes,name) {
    const b=asBytes(bytes);if(b.length<8192)throw new Error('MCA 文件头不完整');
    const m=/r\.(-?\d+)\.(-?\d+)\.mca$/i.exec(name||'');const regionX=m?Number(m[1]):0,regionZ=m?Number(m[2]):0;
    const v=new DataView(b.buffer,b.byteOffset,b.byteLength),chunks=[];let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let slot=0;slot<1024;slot++){
      const off=v.getUint32(slot*4,false)>>>8,sectors=v.getUint8(slot*4+3);if(!off||!sectors)continue;
      const start=off*4096;if(start+5>b.length)continue;const length=v.getUint32(start,false),compression=v.getUint8(start+4);if(length<1||start+4+length>b.length)continue;
      let raw;if(compression===1)raw=await inflate(b.subarray(start+5,start+4+length),'gzip');else if(compression===2)raw=await inflate(b.subarray(start+5,start+4+length),'deflate');else if(compression===3)raw=b.slice(start+5,start+4+length);else continue;
      const root=new NBTReader(raw,false).root();const level=nodeField(root,'Level')||root;const sections=listItems(nodeField(level,'sections')||nodeField(level,'Sections'),TAG.COMPOUND);const cx=regionX*32+(slot%32),cz=regionZ*32+Math.floor(slot/32);
      for(const sec of sections){
        const sy=Number(field(sec,'Y',0)),bs=nodeField(sec,'block_states')||nodeField(sec,'BlockStates');if(!bs)continue;
        const pal=listItems(nodeField(bs,'palette')||nodeField(bs,'Palette'),TAG.COMPOUND).map(raw=>parseJavaPaletteNode({type:TAG.COMPOUND,value:raw}));if(!pal.length)continue;
        const longNode=nodeField(bs,'data')||nodeField(bs,'Data');const packed=Array.from(valueOf(longNode)||[],BigInt);const bits=Math.max(4,Math.ceil(Math.log2(pal.length)));const decoded=readPackedLongs(packed,bits,4096,false);
        for(let i=0;i<4096;i++){const pi=decoded[i];if(pi>=pal.length||pal[pi].name==='minecraft:air')continue;const lx=i&15,lz=(i>>4)&15,ly=(i>>8)&15;const x=cx*16+lx,y=sy*16+ly,z=cz*16+lz;min=[Math.min(min[0],x),Math.min(min[1],y),Math.min(min[2],z)];max=[Math.max(max[0],x),Math.max(max[1],y),Math.max(max[2],z)];chunks.push({x,y,z,entry:pal[pi]});}
      }
    }
    if(!chunks.length)throw new Error('MCA 中没有找到可读取的现代方块调色板区块');
    const origin=min.slice(),size=max.map((v,i)=>v-min[i]+1),canonical=emptyCanonical(size);canonical.palette=[];const cache=new Map();
    for(const b of chunks){const pi=paletteLookup(canonical.palette,b.entry,cache);canonical.blocks[canonicalIndex(b.x-origin[0],b.y-origin[1],b.z-origin[2],size)]=pi;}
    canonical.origin=origin;canonical.warnings.push('MCA 导入仅读取具有现代 block_states 调色板的区块；实体、方块实体和旧版无调色板区块未完整迁移。');return canonical;
  }

  function readBDXString(reader) {
    const start = reader.p;
    while (reader.p < reader.bytes.length && reader.bytes[reader.p] !== 0) reader.p++;
    if (reader.p >= reader.bytes.length) throw new Error('BDX 字符串未终止');
    const value = textDecoder.decode(reader.bytes.subarray(start, reader.p));
    reader.p++;
    return value;
  }
  class BDXReader {
    constructor(bytes) {
      this.bytes = asBytes(bytes);
      this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
      this.p = 0;
    }
    ensure(count) { if (this.p + count > this.bytes.length) throw new Error('BDX 数据意外结束'); }
    u8() { this.ensure(1); return this.view.getUint8(this.p++); }
    i8() { this.ensure(1); return this.view.getInt8(this.p++); }
    u16() { this.ensure(2); const v = this.view.getUint16(this.p, false); this.p += 2; return v; }
    i16() { this.ensure(2); const v = this.view.getInt16(this.p, false); this.p += 2; return v; }
    u32() { this.ensure(4); const v = this.view.getUint32(this.p, false); this.p += 4; return v; }
    i32() { this.ensure(4); const v = this.view.getInt32(this.p, false); this.p += 4; return v; }
    str() { return readBDXString(this); }
  }
  function normalizeBdxName(name) {
    const value = String(name || 'air').replace(/^:/, '');
    return value.includes(':') ? value : `minecraft:${value}`;
  }
  function parseBdxStates(text) {
    const source = String(text || '').trim();
    if (!source || source === '[]' || source === '{}') return {};
    const candidates = [source];
    if (source.startsWith('[') && source.endsWith(']')) candidates.push(`{${source.slice(1, -1)}}`);
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) return Object.fromEntries(parsed.filter(v => v && typeof v === 'object').flatMap(v => Object.entries(v)) .map(([k,v]) => [k, String(v)]));
        if (parsed && typeof parsed === 'object') return Object.fromEntries(Object.entries(parsed).map(([k,v]) => [k, String(v)]));
      } catch {}
    }
    throw new Error(`无法解析 BDX 方块状态：${source.slice(0, 100)}`);
  }
  function parseBDXCommandData(reader) {
    const mode = reader.u32();
    const command = reader.str();
    const customName = reader.str();
    const lastOutput = reader.str();
    const tickDelay = reader.i32();
    const executeOnFirstTick = reader.u8();
    const trackOutput = reader.u8();
    const conditional = reader.u8();
    const needsRedstone = reader.u8();
    return { mode, command, customName, lastOutput, tickDelay, executeOnFirstTick, trackOutput, conditional, needsRedstone };
  }
  function bdxCommandEntity(commandData, x, y, z) {
    const modeName = commandData.mode === 1 ? 'minecraft:repeating_command_block' : commandData.mode === 2 ? 'minecraft:chain_command_block' : 'minecraft:command_block';
    return compound({ block_entity_data:compound({
      id:string('CommandBlock'), x:int(x), y:int(y), z:int(z), Command:string(commandData.command),
      CustomName:string(commandData.customName), LastOutput:string(commandData.lastOutput),
      TickDelay:int(commandData.tickDelay), ExecuteOnFirstTick:byte(commandData.executeOnFirstTick),
      TrackOutput:byte(commandData.trackOutput), LPCondionalMode:byte(commandData.conditional),
      conditionalMode:byte(commandData.conditional), LPRedstoneMode:byte(commandData.needsRedstone ? 0 : 1),
      LPCommandMode:int(commandData.mode), auto:byte(commandData.needsRedstone ? 0 : 1),
      Version:int(50), BlockEntityVersion:int(0)
    }) });
  }
  async function parseBDX(bytes) {
    let raw = asBytes(bytes);
    if (raw[0] === 0x42 && raw[1] === 0x44 && raw[2] === 0x5a) raw = await inflate(raw.subarray(3), 'gzip');
    else if (raw[0] === 0x42 && raw[1] === 0x44 && raw[2] === 0x40) {
      const errors = [];
      for (const format of ['brotli', 'br']) {
        try { raw = await inflate(raw.subarray(3), format); break; } catch (error) { errors.push(error); }
      }
      if (raw[0] === 0x42 && raw[1] === 0x44 && raw[2] === 0x40) throw new Error('该 BDX 使用 Brotli 压缩，但此浏览器没有原生 Brotli 解码器。请使用未压缩或 BDZ/GZIP BDX。');
    }
    const reader = new BDXReader(raw);
    if (reader.u8() !== 0x42 || reader.u8() !== 0x44 || reader.u8() !== 0x58 || reader.u8() !== 0) throw new Error('BDX 文件头无效');
    const author = reader.str();
    const strings = [];
    const placements = [];
    const constant = index => {
      if (!Number.isInteger(index) || index < 0 || index >= strings.length) throw new Error(`BDX 字符串池索引 ${index} 越界`);
      return strings[index];
    };
    let x = 0, y = 0, z = 0, runtimePool = null, terminated = false;
    const place = (name, properties = {}, legacyData = null, command = null, blockEntity = null) => {
      if (placements.length >= MAX_VOLUME) throw new Error('BDX 方块数量超过安全限制');
      placements.push({ x, y, z, name:normalizeBdxName(name), properties, legacyData, command, blockEntity });
    };
    const placeCommand = (name, data, legacyData = 0) => place(name, legacyData == null ? {} : { legacy_data:String(legacyData) }, legacyData, data);
    while (reader.p < reader.bytes.length) {
      const op = reader.u8();
      if (op === 0x58) { if (reader.p < reader.bytes.length && reader.bytes[reader.p] === 0x45) reader.p++; terminated = true; break; }
      switch (op) {
        case 1: {
          if (strings.length >= 65535) throw new Error('BDX 常量字符串数量超过格式限制');
          strings.push(reader.str());
          break;
        }
        case 5: {
          const blockName = constant(reader.u16());
          const stateText = constant(reader.u16());
          place(blockName, parseBdxStates(stateText));
          break;
        }
        case 6: z += reader.u16(); break;
        case 7: { const name = constant(reader.u16()); const data = reader.u16(); place(name, { legacy_data:String(data) }, data); break; }
        case 8: z++; break;
        case 9: break;
        case 12: z += reader.u32(); break;
        case 13: { const name = constant(reader.u16()); place(name, parseBdxStates(reader.str())); break; }
        case 14: x++; break;
        case 15: x--; break;
        case 16: y++; break;
        case 17: y--; break;
        case 18: z++; break;
        case 19: z--; break;
        case 20: x += reader.i16(); break;
        case 21: x += reader.i32(); break;
        case 22: y += reader.i16(); break;
        case 23: y += reader.i32(); break;
        case 24: z += reader.i16(); break;
        case 25: z += reader.i32(); break;
        case 26: {
          const data = parseBDXCommandData(reader);
          if (placements.length) placements[placements.length - 1].command = data;
          break;
        }
        case 27: {
          const name = constant(reader.u16()); const legacy = reader.u16();
          placeCommand(name, parseBDXCommandData(reader), legacy);
          break;
        }
        case 28: x += reader.i8(); break;
        case 29: y += reader.i8(); break;
        case 30: z += reader.i8(); break;
        case 31: runtimePool = reader.u8(); break;
        case 32: case 33: case 34: case 35: case 37: case 38:
          throw new Error(`BDX 操作码 ${op} 依赖运行时方块池${runtimePool == null ? '' : ` ${runtimePool}`}；BlockFlow 当前没有该版本的运行时 ID 表，已停止导入以避免错放方块。`);
        case 36: {
          const legacy = reader.u16();
          placeCommand('minecraft:command_block', parseBDXCommandData(reader), legacy);
          break;
        }
        case 39: { const size = reader.u32(); reader.ensure(size); reader.p += size; break; }
        case 40: {
          const name = constant(reader.u16()); const legacy = reader.u16(); const slotCount = reader.u8();
          const items = [];
          for (let i=0;i<slotCount;i++) {
            const itemName=reader.str(), count=reader.u8(), damage=reader.u16(), slot=reader.u8();
            items.push(compound({Name:string(normalizeBdxName(itemName)),Count:byte(count),Damage:short(damage),Slot:byte(slot)}));
          }
          place(name,{legacy_data:String(legacy)},legacy,null,compound({block_entity_data:compound({id:string('minecraft:chest'),Items:list(TAG.COMPOUND,items.map(v=>v.value))})}));
          break;
        }
        case 41: throw new Error('BDX PlaceBlockWithNBTData（操作码 41）包含内嵌 NBT 缓冲区，当前解析器尚未支持该变长数据段。');
        case 90: { const signatureLength=reader.u8(); reader.ensure(signatureLength); reader.p+=signatureLength; terminated=true; break; }
        default: throw new Error(`BDX 操作码 ${op} 尚未支持（偏移 ${reader.p-1}）`);
      }
      if (Math.abs(x)>2_000_000 || Math.abs(y)>2_000_000 || Math.abs(z)>2_000_000) throw new Error('BDX 坐标超出安全边界');
    }
    if (!terminated) throw new Error('BDX 缺少结束标记 X');
    if (!placements.length) throw new Error('BDX 没有放置任何方块');
    const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
    for(const block of placements){min[0]=Math.min(min[0],block.x);min[1]=Math.min(min[1],block.y);min[2]=Math.min(min[2],block.z);max[0]=Math.max(max[0],block.x);max[1]=Math.max(max[1],block.y);max[2]=Math.max(max[2],block.z);}
    const size=max.map((value,index)=>value-min[index]+1); checkedSize(size);
    const canonical=emptyCanonical(size);canonical.palette=[];const cache=new Map();
    for(const block of placements){
      const entry={name:block.name,properties:block.properties};
      const pi=paletteLookup(canonical.palette,entry,cache);
      const index=canonicalIndex(block.x-min[0],block.y-min[1],block.z-min[2],size);
      canonical.blocks[index]=pi;
      if(block.command)canonical.blockEntities.set(index,bdxCommandEntity(block.command,block.x-min[0],block.y-min[1],block.z-min[2]));
      else if(block.blockEntity)canonical.blockEntities.set(index,block.blockEntity);
    }
    canonical.origin=min;
    canonical.warnings.push(`BDX 作者字段：${author||'未知'}。部分运行时 ID、内嵌 NBT 操作和容器数据格式尚未完整支持。`);
    return canonical;
  }

  async function parseInput(bytes, name='') {
    const ext=(String(name).match(/\.([a-z0-9]+)(?:$|[?#])/i)||[])[1]?.toLowerCase()||'';const b=asBytes(bytes);
    if(!b.length)throw new Error('文件为空');
    if(ext==='mcstructure')return parseMcstructure(b);
    if(ext==='litematic')return parseLitematic(b);
    if(ext==='schem')return parseSchem(b);
    if(ext==='schematic')return parseLegacySchematic(b);
    if(ext==='wsmr')return parseWsmr(b);
    if(ext==='nbt')return parseStructureTemplate(b);
    if(ext==='bdx')return parseBDX(b);
    if(ext==='mca')return parseMca(b,name);
    if(ext==='mcpack'||ext==='mcaddon'||ext==='zip')return parseArchive(b,name);
    if(ext==='mcworld')return parseArchive(b,name);
    // Sniff the format for callers that provide a generic file name.
    if(b[0]===0x1f&&b[1]===0x8b){const raw=await inflate(b,'gzip');try{return parseStructureTemplate(raw);}catch{}try{return parseSchem(raw);}catch{}try{return parseLitematic(raw);}catch{} }
    throw new Error(`尚未支持输入格式：${ext||'未知'}`);
  }

  function stats(canonical) {
    const counts=new Map();let nonair=0;
    for(let i=0;i<canonical.blocks.length;i++){const pi=canonical.blocks[i];if(pi<0)continue;const name=canonical.palette[pi]?.name||'minecraft:air';if(name==='minecraft:air'||name==='minecraft:cave_air'||name==='minecraft:void_air')continue;counts.set(name,(counts.get(name)||0)+1);nonair++;}
    return { total:canonical.blocks.length, nonair, counts:[...counts.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count) };
  }

  function normalizeForTarget(canonical) {
    const copy={...canonical,blocks:new Int32Array(canonical.blocks),secondary:new Int32Array(canonical.secondary||[]),blockEntities:new Map(canonical.blockEntities||[])};
    const volume=checkedSize(copy.size);if(copy.secondary.length!==volume)copy.secondary=new Int32Array(volume).fill(-1);
    let secondaryCount=0;
    for(let i=0;i<volume;i++)if(copy.blocks[i]<0&&copy.secondary[i]>=0)copy.blocks[i]=copy.secondary[i];else if(copy.secondary[i]>=0)secondaryCount++;
    if(secondaryCount)copy.warnings=[...(copy.warnings||[]),`${secondaryCount} 个位置包含第二层方块；目标格式不支持双层共位，已优先保留主层。`];
    return copy;
  }

  async function convert(bytes, targetFormat, name='structure', crop=null) {
    const started=Date.now();let canonical;
    const ext=(String(name).match(/\.([a-z0-9]+)(?:$|[?#])/i)||[])[1]?.toLowerCase()||'';
    if(ext==='mcstructure')canonical=parseMcstructure(asBytes(bytes));else canonical=await parseInput(bytes,name);
    let bbox=null;
    if(crop){
      const min=crop.slice(0,3),max=crop.slice(3,6),newSize=max.map((v,i)=>v-min[i]+1);checkedSize(newSize);
      const cropped=emptyCanonical(newSize);cropped.palette=canonical.palette;cropped.origin=min;
      for(let x=0;x<newSize[0];x++)for(let y=0;y<newSize[1];y++)for(let z=0;z<newSize[2];z++){
        const sx=x+min[0]-(canonical.origin?.[0]||0),sy=y+min[1]-(canonical.origin?.[1]||0),sz=z+min[2]-(canonical.origin?.[2]||0);
        if(sx<0||sy<0||sz<0||sx>=canonical.size[0]||sy>=canonical.size[1]||sz>=canonical.size[2])continue;
        const src=canonicalIndex(sx,sy,sz,canonical.size),dst=canonicalIndex(x,y,z,newSize);cropped.blocks[dst]=canonical.blocks[src];cropped.secondary[dst]=canonical.secondary[src];if(canonical.blockEntities.has(src))cropped.blockEntities.set(dst,canonical.blockEntities.get(src));
      }
      canonical=cropped;bbox=[...min,...max];
    } else {
      const min=canonical.origin||[0,0,0];bbox=[...min,...min.map((v,i)=>v+canonical.size[i]-1)];
    }
    let out,warnings=[...(canonical.warnings||[])];const normalized=normalizeForTarget(canonical);
    switch(Number(targetFormat)){
      case 0: out=serializeMcstructure(normalized);break;
      case 1: out=await deflate(writeLitematic(normalized, String(name).replace(/\.[^.]+$/,'')));break;
      case 2: out=await writeSchem(normalized);break;
      case 3: out=await writeWsmr(normalized);break;
      case 4: throw new Error('BDX 导出需要 Brotli 压缩器与完整运行时方块池映射；当前版本不会生成不兼容的伪 BDX 文件。');
      case 5: {const result=await writeLegacySchematic(normalized);out=result.bytes;warnings.push(...result.warnings);break;}
      case 6: throw new Error('mcworld 导出依赖 Bedrock LevelDB 世界数据库格式。当前纯 JavaScript 引擎尚未实现 LevelDB 写入；请先导出 .mcstructure。');
      default: throw new Error(`未知目标格式编号：${targetFormat}`);
    }
    return { out, bbox, stats:stats(canonical), warnings, elapsed:Date.now()-started };
  }

  self.BlockFlowFormatEngine = Object.freeze({ convert, parseInput, parseMcstructure, serializeMcstructure, TAG });
})();
