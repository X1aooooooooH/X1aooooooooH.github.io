import { MAX_IMPORT_BYTES, MAX_NBT_ARRAY_ITEMS, MAX_NBT_DEPTH, MAX_NBT_LIST_ITEMS } from './constants.js?v=r49-cleanup-20261129';

export const TAG = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12
};
export class Reader {
  constructor(buf) {
    this.dv = new DataView(buf);
    this.p = 0;
    this.dec = new TextDecoder('utf-8');
  }
  remaining() {
    return this.dv.byteLength - this.p;
  }
  i8() {
    const v = this.dv.getInt8(this.p);
    this.p += 1;
    return v;
  }
  u8() {
    const v = this.dv.getUint8(this.p);
    this.p += 1;
    return v;
  }
  i16() {
    const v = this.dv.getInt16(this.p, true);
    this.p += 2;
    return v;
  }
  u16() {
    const v = this.dv.getUint16(this.p, true);
    this.p += 2;
    return v;
  }
  i32() {
    const v = this.dv.getInt32(this.p, true);
    this.p += 4;
    return v;
  }
  u32() {
    const v = this.dv.getUint32(this.p, true);
    this.p += 4;
    return v;
  }
  i64() {
    const lo = BigInt(this.u32());
    const hi = BigInt(this.u32());
    return BigInt.asIntN(64, (hi << 32n) | lo);
  }
  f32() {
    const v = this.dv.getFloat32(this.p, true);
    this.p += 4;
    return v;
  }
  f64() {
    const v = this.dv.getFloat64(this.p, true);
    this.p += 8;
    return v;
  }
  bytes(n) {
    if (!Number.isInteger(n) || n < 0 || n > this.remaining())
      throw new Error('NBT 字节数组长度非法或数据不完整');
    const o = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.p, n).slice();
    this.p += n;
    return o;
  }
  str() {
    const len = this.u16();
    return this.dec.decode(this.bytes(len));
  }
  body(t, depth = 0) {
    if (depth > MAX_NBT_DEPTH) throw new Error(`NBT 嵌套深度超过安全上限 ${MAX_NBT_DEPTH}`);
    switch (t) {
      case TAG.END:
        return null;
      case TAG.BYTE:
        return { type: t, value: this.i8() };
      case TAG.SHORT:
        return { type: t, value: this.i16() };
      case TAG.INT:
        return { type: t, value: this.i32() };
      case TAG.LONG:
        return { type: t, value: this.i64() };
      case TAG.FLOAT:
        return { type: t, value: this.f32() };
      case TAG.DOUBLE:
        return { type: t, value: this.f64() };
      case TAG.BYTE_ARRAY: {
        const n = this.i32();
        if (n < 0 || n > MAX_IMPORT_BYTES) throw new Error('NBT ByteArray 长度超过安全上限');
        return { type: t, value: this.bytes(n) };
      }
      case TAG.STRING:
        return { type: t, value: this.str() };
      case TAG.LIST: {
        const et = this.u8(),
          n = this.i32();
        if (
          n < 0 ||
          n > MAX_NBT_LIST_ITEMS ||
          (et === TAG.END && n !== 0) ||
          (et !== TAG.END && n > this.remaining())
        )
          throw new Error('NBT 列表长度非法、超过安全上限或数据不完整');
        const items = [];
        for (let i = 0; i < n; i++) items.push(this.body(et, depth + 1));
        return { type: t, value: { elementType: et, items } };
      }
      case TAG.COMPOUND: {
        const o = {};
        while (true) {
          const ct = this.u8();
          if (ct === TAG.END) break;
          const name = this.str();
          o[name] = this.body(ct, depth + 1);
        }
        return { type: t, value: o };
      }
      case TAG.INT_ARRAY: {
        const n = this.i32();
        if (n < 0 || n > MAX_NBT_ARRAY_ITEMS || n > Math.floor(this.remaining() / 4))
          throw new Error('NBT IntArray 长度非法、超过安全上限或数据不完整');
        const a = new Array(n);
        for (let i = 0; i < n; i++) a[i] = this.i32();
        return { type: t, value: a };
      }
      case TAG.LONG_ARRAY: {
        const n = this.i32();
        if (n < 0 || n > MAX_NBT_ARRAY_ITEMS || n > Math.floor(this.remaining() / 8))
          throw new Error('NBT LongArray 长度非法、超过安全上限或数据不完整');
        const a = new Array(n);
        for (let i = 0; i < n; i++) a[i] = this.i64();
        return { type: t, value: a };
      }
    }
    throw new Error('Unknown tag: ' + t);
  }
  root() {
    const t = this.u8();
    this.str();
    return this.body(t, 0);
  }
}
export const T = {
  byte: (v) => ({ type: TAG.BYTE, value: v }),
  int: (v) => ({ type: TAG.INT, value: v }),
  long: (v) => ({ type: TAG.LONG, value: typeof v === 'bigint' ? v : BigInt(v) }),
  str: (v) => ({ type: TAG.STRING, value: v }),
  ia: (a) => ({ type: TAG.INT_ARRAY, value: a }),
  list: (et, items) => ({ type: TAG.LIST, value: { elementType: et, items } }),
  comp: (o) => ({ type: TAG.COMPOUND, value: o })
};
export class Writer {
  constructor() {
    this.parts = [];
    this.enc = new TextEncoder();
  }
  push(a) {
    this.parts.push(a);
  }
  u8(v) {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.push(b);
  }
  i8(v) {
    const b = new Uint8Array(1);
    new DataView(b.buffer).setInt8(0, v);
    this.push(b);
  }
  i16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v, true);
    this.push(b);
  }
  u16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this.push(b);
  }
  i32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    this.push(b);
  }
  i64(v) {
    const b = new Uint8Array(8);
    const dv = new DataView(b.buffer);
    const bi = typeof v === 'bigint' ? v : BigInt(v);
    dv.setUint32(0, Number(bi & 0xffffffffn), true);
    dv.setUint32(4, Number((bi >> 32n) & 0xffffffffn), true);
    this.push(b);
  }
  f32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this.push(b);
  }
  f64(v) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.push(b);
  }
  bytes(a) {
    this.push(new Uint8Array(a));
  }
  str(s) {
    const e = this.enc.encode(String(s ?? ''));
    if (e.length > 0xffff) throw new Error(`NBT 字符串 UTF-8 长度为 ${e.length} 字节，超过 65535 字节上限`);
    this.u16(e.length);
    this.bytes(e);
  }
  body(t, v) {
    switch (t) {
      case TAG.END:
        break;
      case TAG.BYTE:
        this.i8(v);
        break;
      case TAG.SHORT:
        this.i16(v);
        break;
      case TAG.INT:
        this.i32(v);
        break;
      case TAG.LONG:
        this.i64(v);
        break;
      case TAG.FLOAT:
        this.f32(v);
        break;
      case TAG.DOUBLE:
        this.f64(v);
        break;
      case TAG.BYTE_ARRAY:
        this.i32(v.length);
        this.bytes(v);
        break;
      case TAG.STRING:
        this.str(v);
        break;
      case TAG.LIST:
        this.u8(v.elementType);
        this.i32(v.items.length);
        for (const it of v.items) this.body(v.elementType, it.value);
        break;
      case TAG.COMPOUND:
        for (const n of Object.keys(v)) {
          const c = v[n];
          this.u8(c.type);
          this.str(n);
          this.body(c.type, c.value);
        }
        this.u8(TAG.END);
        break;
      case TAG.INT_ARRAY:
        this.i32(v.length);
        for (const x of v) this.i32(x);
        break;
      case TAG.LONG_ARRAY:
        this.i32(v.length);
        for (const x of v) this.i64(x);
        break;
    }
  }
  serialize(root) {
    this.u8(root.type);
    this.str('');
    this.body(root.type, root.value);
    let total = 0;
    for (const p of this.parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of this.parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }
}
export function cloneNBT(node) {
  if (node == null) return node;
  if (Array.isArray(node)) return node.map(cloneNBT);
  if (typeof node !== 'object') return node;
  if (node instanceof Uint8Array) return node.slice();
  const out = {};
  for (const k of Object.keys(node)) out[k] = cloneNBT(node[k]);
  return out;
}
