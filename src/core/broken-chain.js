import { FACING_VEC } from './constants.js?v=r51-ai-modules-20261129';
import { blockKey, getOffsetPosition } from './blocks.js?v=r51-ai-modules-20261129';

/**
 * 断链（broken chain）识别与归一化的**唯一实现**。
 *
 * 这里放的是「规则」，不是「流程」：
 *   - 什么算断链头、什么算 /setblock 标记、相对坐标怎么转换，全部在本文件定义。
 *   - 怎么遍历结构、怎么追踪一条链、怎么排布导出，属于 trace.js 和 layout.js。
 *
 * 改断链行为时只改这个文件。trace.js / layout.js / text-editor.js / ai/context.js
 * 都通过下面的导出调用，不各自实现规则。
 *
 * 对应 README 的章节：
 *   §1.1 断链头类型（testfor / execute，命令前可有可无 '/'）
 *        -> startsCommand / isTestforCommand / isExecuteRunRelativeCommand
 *   §1.2 支持的命令（setblock / fill / clone / structure）
 *        -> getRelativeCommandOperation
 *   §1.3 相对坐标识别（不限定 ~~~ 模板）
 *        -> hasRelativeCoordinateSyntax
 *   §1.4 间隔方块（空气 / 普通方块 / 命令方块都可能是 gap）
 *        -> identifyBrokenHeadGeometry 的 gap 处理
 *   §1.5 多组断链（每组独立识别）
 *        -> 规则层只认单组，多组由调用方循环
 *   §1.6 断链后坐标转换到 Z 轴
 *        -> rotateRelativeCoordinateTriples / normalizeBrokenChainBlocks
 *   §1.7 辅助方块（gap 里的命令方块是真实节点，其余是空气占位）
 *        -> identifyBrokenHeadGeometry 的 auxiliary / placeholder
 *   §1.8 /execute ... at @ 排除
 *        -> hasExecuteAtBeforeRun
 *   §1.9 一条链最多一个循环命令方块
 *        -> 由 trace.js 依据本文件的类型判断拆链
 *
 * 分区：
 *   1. 命令行识别       startsCommand / is*Command / hasRelativeCoordinateSyntax
 *   2. 标记方块识别     isSetblockMarker / isSetblockFirstMarker / isSetblockSecondMarker / isBrokenHeadMarkerBlock
 *   3. 断链头几何识别   identifyBrokenHeadGeometry
 *   4. 链级识别         findBrokenChainSetblockIndexes / getBrokenHeadKind / isBrokenChainPlaceholder
 *   5. 相对坐标处理     parseRelativeComponent / formatRelativeComponent / rotateRelativeVector / rotateRelativeCoordinateTriples
 *   6. 归一化           normalizeBrokenChainBlocks
 *   7. 自闭环检测       detectSelfClosedCycles
 *
 * 注意：函数体沿用历史紧凑写法（无空格、单行 if）。为了保证行为可验证，
 * 本轮只做分区与文档化，逐节展开留到后续单独进行。
 */

// ─────────────────────────────────────────────────────────────
// 7. 自闭环检测
// ─────────────────────────────────────────────────────────────

// Detect intentional self-closed command-block loops. Only cycles of 2–4
// chain-command blocks are treated as supported loops; larger loops are left
// to the normal validation path because they are considered malformed layouts.
function cycleResult(cycles, keys, oversized) {
  const result = [cycles, keys, oversized];
  result.cycles = cycles;
  result.keys = keys;
  result.oversized = oversized;
  return result;
}
export function detectSelfClosedCycles(blockMap, maxCycleSize = 4, brokenKeys = new Set()) {
  const cycles = [];
  const signatures = new Set();
  const oversized = [];
  if (!(blockMap instanceof Map)) return cycleResult(cycles, new Set(), oversized);
  for (const start of blockMap.values()) {
    if (!start || start.type !== 'chain') continue;
    const path = [];
    const position = new Map();
    let current = start;
    let guard = 0;
    while (current && current.type === 'chain' && guard++ < Math.min(blockMap.size + 1, 10000)) {
      const key = blockKey(current.x, current.y, current.z);
      if (position.has(key)) {
        const keys = path.slice(position.get(key));
        // Broken-head markers intentionally face into one another. That is a
        // broken-head encoding, not a self-closed chain. Besides the exact
        // /setblock templates, exclude every block that belongs to a detected
        // broken-head pattern; execute-style markers use `air` or other commands
        // and would otherwise turn a downward chain into a false 2-block loop.
        const markerCycle = keys.some((cycleKey) => {
          if (brokenKeys.has(cycleKey)) return true;
          const node = blockMap.get(cycleKey);
          return isSetblockFirstMarker(node?.cmd || '') || isSetblockSecondMarker(node?.cmd || '');
        });
        if (keys.length >= 2 && keys.length <= maxCycleSize && !markerCycle) {
          const signature = [...keys].sort().join('|');
          if (!signatures.has(signature)) {
            signatures.add(signature);
            cycles.push(keys);
          }
        } else if (keys.length > maxCycleSize && !markerCycle) {
          const signature = [...keys].sort().join('|');
          if (!signatures.has('oversized:' + signature)) {
            signatures.add('oversized:' + signature);
            oversized.push(keys);
          }
        }
        break;
      }
      position.set(key, path.length);
      path.push(key);
      const p = getOffsetPosition(current, current.facing, 1);
      current = p ? blockMap.get(blockKey(p.x, p.y, p.z)) : null;
      if (current && current.type !== 'chain') break;
    }
  }
  return cycleResult(cycles, new Set(cycles.flat()), oversized);
}
// ─────────────────────────────────────────────────────────────
// 1. 命令行识别
// ─────────────────────────────────────────────────────────────

const escapeRe = (text) => String(text).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
// Minecraft command text may include the leading slash or omit it.
export function startsCommand(cmd, name) {
  return new RegExp('^\\s*\\/?' + escapeRe(name) + '\\b', 'i').test(String(cmd ?? '').trim());
}
export function isTestforCommand(cmd) {
  return startsCommand(cmd, 'testfor');
}
export function hasRelativeCoordinateSyntax(cmd) {
  const s = String(cmd ?? '');
  // Bedrock structures in the wild use both spaced coordinates (~ ~ ~-1)
  // and compact project notation (~~~-1). Accept either form.
  return (
    /(?:^|[\s,])~(?:-?\d+(?:\.\d+)?)?(?=$|[\s,])/.test(s) ||
    /(?:^|[\s,])(?:~(?:-?\d+(?:\.\d+)?)?){3}(?=$|[\s,])/.test(s)
  );
}
export function getRelativeCommandOperation(cmd) {
  const s = String(cmd ?? '').trim();
  const execute = s.match(/^\/?execute\b[\s\S]*?\brun\s+\/?(setblock|fill|clone|structure)\b/i);
  if (execute) return execute[1].toLowerCase();
  const direct = s.match(/^\/?(setblock|fill|clone|structure)\b/i);
  return direct ? direct[1].toLowerCase() : null;
}
export function isSupportedRelativeCommand(cmd) {
  return !!getRelativeCommandOperation(cmd) && hasRelativeCoordinateSyntax(cmd);
}
// ─────────────────────────────────────────────────────────────
// 2. 标记方块识别
// ─────────────────────────────────────────────────────────────

// Broken-head markers are /setblock templates. `fill`, `clone` and especially
// `structure load` are often ordinary commands with relative coordinates; they
// must not be mistaken for the two special /setblock marker blocks.
export function isSetblockRelativeCommand(cmd) {
  return getRelativeCommandOperation(cmd) === 'setblock' && hasRelativeCoordinateSyntax(cmd);
}
export function hasExecuteAtBeforeRun(cmd) {
  const source = String(cmd ?? '').trim();
  if (!/^\s*\/?execute\b/i.test(source)) return false;
  const runMatch = /\brun\b/i.exec(source);
  const head = runMatch ? source.slice(0, runMatch.index) : source;
  // Bedrock's `/execute ... at @s ... run ...` is a normal positional execute
  // command, not the broken-head template. Only inspect the subcommands before
  // `run`; arguments after `run` must not affect broken-head detection.
  return /(?:^|\s)at\s+@/i.test(head);
}
export function isExecuteRunRelativeCommand(cmd) {
  return (
    /^\s*\/?execute\b/i.test(String(cmd ?? '').trim()) &&
    !hasExecuteAtBeforeRun(cmd) &&
    isSupportedRelativeCommand(cmd)
  );
}
export function isSetblockMarker(cmd, position) {
  const s = String(cmd ?? '').trim();
  if (!startsCommand(s, 'setblock') || !/\bchain_command_block\b/i.test(s)) return false;
  const beforeBlock = s.replace(/^\s*\/?setblock\b/i, '').split(/\bchain_command_block\b/i)[0];
  const compact = beforeBlock.replace(/\s+/g, '');
  return position === 'first' ? compact === '~~~-1' : compact === '~~~';
}
export function isSetblockFirstMarker(cmd) {
  return isSetblockMarker(cmd, 'first');
}
export function isSetblockSecondMarker(cmd) {
  return isSetblockMarker(cmd, 'second');
}
export function isBrokenHeadMarkerBlock(b) {
  return (
    !!b &&
    ['command', 'repeating', 'chain'].includes(b.type || b.blockType) &&
    String(b.cmd || '').trim() !== '' &&
    isSetblockRelativeCommand(b.cmd || '')
  );
}
// ─────────────────────────────────────────────────────────────
// 3. 断链头几何识别
// ─────────────────────────────────────────────────────────────

// Shared broken-head recognizer. The gap is a geometric slot, not a required
// block type: it may be air, an ordinary block, water/lava, or any command block.
export function identifyBrokenHeadGeometry(root, getExact, isMarker) {
  if (!root || typeof getExact !== 'function' || typeof isMarker !== 'function') return null;
  const cmd = String(root.cmd || '').trim();
  const isCommandRecord = (b) => !!b && ['command', 'repeating', 'chain'].includes(b.type || b.blockType);
  const make = (kind, direction, previous, gap, marker, rootDirection = direction) => {
    // Only the two `-gap` forms own a physical auxiliary slot between the
    // command head/first marker and the final marker. The `-direct` forms place
    // the two markers next to each other, so inventing a placeholder there would
    // shift the whole chain by one block and display a phantom blank block.
    const hasGap = kind.endsWith('-gap');
    const gapPosition = hasGap && previous ? getOffsetPosition(previous, direction, 1) : null;
    const gapIsCommand = hasGap && isCommandRecord(gap);
    // A command block in the auxiliary slot is a real physical chain node. Keep
    // its original command/type/condition/auto values and mark it so relayout
    // and text editing do not downgrade it to an ordinary chain block.
    const auxiliary = gapIsCommand ? { ...gap, isAuxiliary: true } : null;
    const placeholder =
      gapPosition && !gapIsCommand
        ? {
            ...gapPosition,
            type: 'placeholder',
            blockType: 'chain',
            cmd: '',
            cond: 0,
            auto: 1,
            facing: direction,
            isAirPlaceholder: true,
            marked: false,
            note: ''
          }
        : null;
    return {
      kind,
      direction,
      rootDirection,
      wrongFacingBlock: marker,
      previous,
      gap,
      placeholder,
      auxiliary,
      // Non-command gaps stay virtual air slots; command gaps become editable
      // physical nodes in the same chain.
      blocks: [
        ...(kind.startsWith('testfor') ? [previous] : []),
        ...(auxiliary ? [auxiliary] : []),
        ...(placeholder ? [placeholder] : []),
        marker
      ].filter(Boolean),
      skipped: gap || null
    };
  };
  const candidateDirections = [
    Number.isInteger(root.facing) ? root.facing : 2,
    ...Object.keys(FACING_VEC).map(Number)
  ].filter((value, index, array) => FACING_VEC[value] && array.indexOf(value) === index);
  if (isTestforCommand(cmd)) {
    for (const rootDirection of candidateDirections) {
      const first = getExact(root, rootDirection, 1);
      if (!isMarker(first)) continue;
      const directions = [rootDirection, first.facing].filter(
        (value, index, array) =>
          Number.isInteger(value) && FACING_VEC[value] && array.indexOf(value) === index
      );
      for (const direction of directions) {
        const secondDirect = getExact(first, direction, 1);
        const secondGap = getExact(first, direction, 2);
        // Prefer the explicit one-slot gap when both positions contain relative
        // command text. This lets an impulse command block occupy the gap without
        // being mistaken for the second marker solely because it has a command.
        if (isMarker(secondGap))
          return make('testfor-gap', direction, first, secondDirect, secondGap, rootDirection);
        if (isMarker(secondDirect))
          return make('testfor-direct', direction, first, null, secondDirect, rootDirection);
      }
    }
    return null;
  }
  if (isExecuteRunRelativeCommand(cmd)) {
    for (const direction of candidateDirections) {
      const first = getExact(root, direction, 1);
      const second = getExact(root, direction, 2);
      if (isMarker(second)) return make('execute-gap', direction, root, first, second, direction);
      if (isMarker(first)) return make('execute-direct', direction, root, null, first, direction);
    }
  }
  return null;
}
// ─────────────────────────────────────────────────────────────
// 4. 链级识别：从一组方块里判断断链类型
// ─────────────────────────────────────────────────────────────

export function findBrokenChainSetblockIndexes(items) {
  const list = Array.isArray(items) ? items : [];
  const found = [];
  for (let i = 0; i < list.length; i++) {
    const value =
      typeof list[i] === 'string' ? String(list[i] || '').trim() : String(list[i]?.cmd || '').trim();
    if (isSetblockRelativeCommand(value)) {
      found.push(i);
      if (found.length === 2) break;
    }
  }
  return found;
}
export function getBrokenHeadKind(items) {
  if (!Array.isArray(items) || items.length < 2) return null;
  if (items._brokenMatch === 'execute' || items._brokenMatch === 'testfor') return items._brokenMatch;
  const cmdAt = (i) => String(typeof items[i] === 'string' ? items[i] : items[i]?.cmd || '').trim();
  const first = cmdAt(0);
  const indexes = findBrokenChainSetblockIndexes(items);
  if (isExecuteRunRelativeCommand(first) && indexes[0] === 0 && indexes.length >= 2) return 'execute';
  if (isTestforCommand(first) && indexes[0] >= 1 && indexes.length >= 2) return 'testfor';
  return null;
}
export function isBrokenChainPlaceholder(items) {
  if (
    !Array.isArray(items) ||
    items.length < 3 ||
    String(typeof items[0] === 'string' ? items[0] : items[0]?.cmd || '').trim() !== ''
  )
    return false;
  return (
    isSetblockRelativeCommand(items[1]?.cmd ?? items[1]) &&
    isSetblockRelativeCommand(items[2]?.cmd ?? items[2])
  );
}
// ─────────────────────────────────────────────────────────────
// 5. 相对坐标处理
// ─────────────────────────────────────────────────────────────

export function parseRelativeComponent(token) {
  const m = String(token).match(/^~(-?\d+(?:\.\d+)?)?$/);
  return m ? Number(m[1] || 0) : null;
}
export function formatRelativeComponent(value) {
  const n = Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6));
  return n === 0 ? '~' : '~' + String(n);
}
export function rotateRelativeVector(x, y, z, facing) {
  switch (Number(facing)) {
    case 3:
      return [-x, y, -z];
    case 4:
      return [-z, y, x];
    case 5:
      return [z, y, -x];
    case 0:
      return [x, -z, y];
    case 1:
      return [x, z, -y];
    case 2:
    default:
      return [x, y, z];
  }
}
export function rotateRelativeCoordinateTriples(cmd, facing) {
  let source = String(cmd ?? '');
  if (!source || Number(facing) === 2) return source;
  const triple = /((?:~(?:-?\d+(?:\.\d+)?)?)\s+){2}(~(?:-?\d+(?:\.\d+)?)?)/g;
  source = source.replace(triple, (match) => {
    const parts = match.trim().split(/\s+/);
    if (parts.length !== 3 || parts.some((v) => parseRelativeComponent(v) === null)) return match;
    const [x, y, z] = parts.map(parseRelativeComponent);
    return rotateRelativeVector(x, y, z, facing)
      .map(formatRelativeComponent)
      .join(match.includes('  ') ? '  ' : ' ');
  });
  // Compact coordinate triples such as ~~~-1 are used by existing structures.
  source = source.replace(/(^|[\s,])((?:~(?:-?\d+(?:\.\d+)?)?){3})(?=$|[\s,])/g, (whole, prefix, compact) => {
    const parts = compact.match(/~(?:-?\d+(?:\.\d+)?)?/g) || [];
    if (parts.length !== 3 || parts.some((v) => parseRelativeComponent(v) === null)) return whole;
    const [x, y, z] = parts.map(parseRelativeComponent);
    return prefix + rotateRelativeVector(x, y, z, facing).map(formatRelativeComponent).join('');
  });
  return source;
}
// ─────────────────────────────────────────────────────────────
// 6. 归一化：把断链的相对坐标一次性转到 Z 轴方向
// ─────────────────────────────────────────────────────────────

export function normalizeBrokenChainBlocks(blocks, options = {}) {
  if (!Array.isArray(blocks)) return false;
  const kind = options.kind || getBrokenHeadKind(blocks);
  if (!kind && !options.forceCoordinates) return false;
  const direction = Number.isInteger(options.direction)
    ? options.direction
    : Number.isInteger(blocks._brokenDirection)
      ? blocks._brokenDirection
      : 2;
  const specialKeys =
    options.specialKeys instanceof Set ? options.specialKeys : new Set(blocks._brokenSpecialKeys || []);
  const facingMap = options.facingMap || blocks._brokenFacingMap || {};
  const preserveCommands = !!options.preserveCommands;
  for (const b of blocks) {
    if (!b || typeof b.cmd !== 'string') continue;
    // Commands are normalized exactly once, when the chain is first imported or
    // created. Reflow runs on every edit and must not rotate already-normalized
    // coordinates again (doing so corrupts non-Z-axis broken heads).
    if (b.isBrokenNormalized) continue;
    if (preserveCommands && (b.brokenWrongFacing || b.isAuxiliary)) {
      b.isBrokenNormalized = true;
      continue;
    }
    const key = blockKey(b.x, b.y, b.z);
    const facing = Number.isInteger(facingMap[key])
      ? facingMap[key]
      : specialKeys.has(key)
        ? direction
        : Number.isInteger(b.facing)
          ? b.facing
          : direction;
    b.cmd = rotateRelativeCoordinateTriples(b.cmd, facing);
    b.isBrokenNormalized = true;
  }
  if (options.applyCondition !== false) {
    const indexes = findBrokenChainSetblockIndexes(blocks);
    if (indexes.length >= 2) {
      blocks[indexes[0]].cond = kind === 'testfor' ? 1 : 0;
      blocks[indexes[1]].cond = 0;
    }
  }
  return true;
}
