import {
  COMMAND_TYPES, FACING_VEC, Block, blockKey,
} from "./format.js";

/* ---------------- 命令文本判定 ---------------- */

const SETBLOCK_RE = /^\s*\/?setblock\b/i;
const EXECUTE_RE = /^\s*\/?execute\b/i;
const RELATIVE_RE = /(?:^|[\s,])~(?:-?\d+(?:\.\d+)?)?(?=$|[\s,])/;
const RELATIVE_TRIPLE_RE = /(?:^|[\s,])(?:~(?:-?\d+(?:\.\d+)?)?){3}(?=$|[\s,])/;
const AT_BEFORE_RUN_RE = /(?:^|\s)at\s+@/i;
const CHAIN_BLOCK_RE = /\bchain_command_block\b/i;
const REL_TOKEN_RE = /^~(-?\d+(?:\.\d+)?)?$/;
const SPACED_TRIPLE_RE = /((?:~(?:-?\d+(?:\.\d+)?)?)\s+){2}(~(?:-?\d+(?:\.\d+)?)?)/;
const COMPACT_TRIPLE_RE = /(^|[\s,])((?:~(?:-?\d+(?:\.\d+)?)?){3})(?=$|[\s,])/;
const DIRECT_OP_RE = /^\/?(setblock|fill|clone|structure)\b/i;
const EXECUTE_RUN_OP_RE = /^\/?execute\b[\s\S]*?\brun\s+\/?(setblock|fill|clone|structure)\b/i;

const escapeRe = text => String(text).replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

export function startsCommand(cmd, name) {
  return new RegExp("^\\s*/?" + escapeRe(name) + "\\b", "i").test(String(cmd ?? ""));
}

export const isTestforCommand = cmd => startsCommand(cmd, "testfor");

export function hasRelativeCoordinateSyntax(cmd) {
  const text = String(cmd ?? "");
  return RELATIVE_RE.test(text) || RELATIVE_TRIPLE_RE.test(text);
}

export function relativeCommandOperation(cmd) {
  const text = String(cmd ?? "").trim();
  const runMatch = EXECUTE_RUN_OP_RE.exec(text);
  if (runMatch) return runMatch[1].toLowerCase();
  const direct = DIRECT_OP_RE.exec(text);
  return direct ? direct[1].toLowerCase() : null;
}

export function isSupportedRelativeCommand(cmd) {
  return Boolean(relativeCommandOperation(cmd)) && hasRelativeCoordinateSyntax(cmd);
}

export const isSetblockRelativeCommand = cmd =>
  relativeCommandOperation(cmd) === "setblock" && hasRelativeCoordinateSyntax(cmd);

export function hasExecuteAtBeforeRun(cmd) {
  const text = String(cmd ?? "").trim();
  if (!EXECUTE_RE.test(text)) return false;
  const runMatch = /\brun\b/i.exec(text);
  const head = runMatch ? text.slice(0, runMatch.index) : text;
  return AT_BEFORE_RUN_RE.test(head);
}

export function isExecuteRunRelativeCommand(cmd) {
  const text = String(cmd ?? "").trim();
  return EXECUTE_RE.test(text) && !hasExecuteAtBeforeRun(text) && isSupportedRelativeCommand(text);
}

export function isSetblockMarker(cmd, position) {
  const text = String(cmd ?? "").trim();
  if (!startsCommand(text, "setblock") || !CHAIN_BLOCK_RE.test(text)) return false;
  const beforeBlock = text.replace(SETBLOCK_RE, "").split("chain_command_block")[0];
  return beforeBlock.replace(/\s+/g, "") === (position === "first" ? "~~~-1" : "~~~");
}

export const isSetblockFirstMarker = cmd => isSetblockMarker(cmd, "first");
export const isSetblockSecondMarker = cmd => isSetblockMarker(cmd, "second");

export function isBrokenHeadMarkerBlock(block) {
  if (!block || !COMMAND_TYPES.includes(block.type)) return false;
  const cmd = String(block.cmd ?? "").trim();
  return cmd !== "" && isSetblockRelativeCommand(block.cmd ?? "");
}

export function findBrokenSetblockIndexes(items) {
  const found = [];
  items.forEach((item, i) => {
    const cmd = typeof item === "string" ? item : item.cmd ?? "";
    if (isSetblockRelativeCommand(String(cmd).trim())) found.push(i);
  });
  return found.slice(0, 2);
}

/* ---------------- 断链头识别 ---------------- */

export class BrokenHead {
  constructor(kind, direction, rootDirection, previous, gap, marker, placeholder, auxiliary, blocks) {
    this.kind = kind;
    this.direction = direction;
    this.root_direction = rootDirection;
    this.previous = previous;
    this.gap = gap;
    this.marker = marker;
    this.placeholder = placeholder;
    this.auxiliary = auxiliary;
    this.blocks = blocks;
  }
  get group() { return this.kind.split("-")[0]; }
  get has_gap() { return this.kind.endsWith("-gap"); }
}

export function identifyBrokenHead(root, getExact, isMarker) {
  if (!root || typeof getExact !== "function" || typeof isMarker !== "function") return null;
  const cmd = String(root.cmd ?? "").trim();
  const isCommandRecord = block => Boolean(block) && COMMAND_TYPES.includes(block.type);

  const make = (kind, direction, previous, gap, marker, rootDirection) => {
    const hasGap = kind.endsWith("-gap");
    const gapPosition = hasGap && previous ? previous.offset(direction, 1) : null;
    const gapIsCommand = hasGap && isCommandRecord(gap);
    const auxiliary = gapIsCommand ? gap.copy({ is_auxiliary: true }) : null;
    let placeholder = null;
    if (gapPosition && !gapIsCommand) {
      placeholder = new Block(gapPosition[0], gapPosition[1], gapPosition[2], "chain", direction, "", 0, 1, false, true);
    }
    const blocks = [];
    if (kind.startsWith("testfor")) blocks.push(previous);
    if (auxiliary) blocks.push(auxiliary);
    if (placeholder) blocks.push(placeholder);
    blocks.push(marker);
    return new BrokenHead(kind, direction, rootDirection, previous, gap, marker, placeholder, auxiliary, blocks.filter(Boolean));
  };

  const candidateDirections = [];
  for (const value of [Number(root.facing), ...FACING_VEC.keys()]) {
    if (FACING_VEC.has(value) && !candidateDirections.includes(value)) candidateDirections.push(value);
  }

  if (isTestforCommand(cmd)) {
    for (const rootDirection of candidateDirections) {
      const first = getExact(root, rootDirection, 1);
      if (!isMarker(first)) continue;
      const directions = [];
      for (const value of [rootDirection, Number(first.facing)]) {
        if (FACING_VEC.has(value) && !directions.includes(value)) directions.push(value);
      }
      for (const direction of directions) {
        const secondDirect = getExact(first, direction, 1);
        const secondGap = getExact(first, direction, 2);
        if (isMarker(secondGap)) return make("testfor-gap", direction, first, secondDirect, secondGap, rootDirection);
        if (isMarker(secondDirect)) return make("testfor-direct", direction, first, null, secondDirect, rootDirection);
      }
    }
    return null;
  }

  if (isExecuteRunRelativeCommand(cmd)) {
    for (const direction of candidateDirections) {
      const first = getExact(root, direction, 1);
      const second = getExact(root, direction, 2);
      if (isMarker(second)) return make("execute-gap", direction, root, first, second, direction);
      if (isMarker(first)) return make("execute-direct", direction, root, null, first, direction);
    }
  }
  return null;
}

/* ---------------- 相对坐标旋转 ---------------- */

export function parseRelativeComponent(token) {
  const match = REL_TOKEN_RE.exec(String(token));
  return match ? Number(match[1] ?? 0) : null;
}

function round(value, digits = 0) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function fmtNumber(value) {
  const number = round(value, 6);
  return number === Math.trunc(number) ? String(Math.trunc(number)) : String(number);
}

export function formatRelativeComponent(value) {
  const number = Math.abs(value) < 1e-9 ? 0 : round(value, 6);
  return number === 0 ? "~" : "~" + fmtNumber(number);
}

export function rotateRelativeVector(x, y, z, facing) {
  switch (Number(facing)) {
    case 3: return [-x, y, -z];
    case 4: return [-z, y, x];
    case 5: return [z, y, -x];
    case 0: return [x, -z, y];
    case 1: return [x, z, -y];
    default: return [x, y, z];
  }
}

export function rotateRelativeCoordinateTriples(cmd, facing) {
  let source = String(cmd ?? "");
  if (!source || Number(facing) === 2) return source;

  source = source.replace(SPACED_TRIPLE_RE, whole => {
    const parts = whole.trim().split(/\s+/);
    if (parts.length !== 3 || parts.some(p => parseRelativeComponent(p) === null)) return whole;
    const [x, y, z] = parts.map(parseRelativeComponent);
    const rotated = rotateRelativeVector(x, y, z, facing);
    return rotated.map(formatRelativeComponent).join(whole.includes("  ") ? "  " : " ");
  });

  return source.replace(COMPACT_TRIPLE_RE, (whole, prefix, body) => {
    const parts = body.match(/~(?:-?\d+(?:\.\d+)?)?/g);
    if (!parts || parts.length !== 3 || parts.some(p => parseRelativeComponent(p) === null)) return whole;
    const [x, y, z] = parts.map(parseRelativeComponent);
    return prefix + rotateRelativeVector(x, y, z, facing).map(formatRelativeComponent).join("");
  });
}

export function normalizeBrokenChainBlocks(blocks, {
  kind = null, direction = 2, facingMap = new Map(), applyCondition = false, preserveCommands = false,
} = {}) {
  if (!blocks.length) return false;
  for (const block of blocks) {
    if (typeof block.cmd !== "string") continue;
    if (block.is_broken_normalized) continue;
    if (preserveCommands && (block.broken_wrong_facing || block.is_auxiliary)) {
      block.is_broken_normalized = true;
      continue;
    }
    const facing = facingMap.has(block.key) ? facingMap.get(block.key) : direction;
    block.cmd = rotateRelativeCoordinateTriples(block.cmd, facing);
    block.is_broken_normalized = true;
  }
  if (applyCondition) {
    const indexes = findBrokenSetblockIndexes(blocks);
    if (indexes.length >= 2) {
      blocks[indexes[0]].cond = kind === "testfor" ? 1 : 0;
      blocks[indexes[1]].cond = 0;
    }
  }
  return true;
}

/* ---------------- 自闭环检测 ---------------- */

export function detectSelfClosedCycles(blockMap, maxCycleSize = 4, brokenKeys = new Set()) {
  const cycles = [];
  const signatures = new Set();
  const oversized = [];
  // 每个节点的出边唯一（由朝向决定），走一遍即可标记整条路径；
  // 用 done 跳过已扫描的起点，把原来的 O(n²) 降为 O(n)。
  const done = new Set();
  const limit = Math.min(blockMap.size + 1, 10000);

  for (const start of blockMap.values()) {
    if (!start || start.type !== "chain" || done.has(start.key)) continue;
    const path = [];
    const index = new Map();
    let current = start;
    let guard = 0;
    while (current && current.type === "chain" && guard < limit) {
      guard++;
      const key = current.key;
      if (index.has(key)) {
        const keys = path.slice(index.get(key));
        const markerCycle = keys.some(cycleKey => brokenKeys.has(cycleKey) ||
          isSetblockFirstMarker(blockMap.get(cycleKey)?.cmd ?? "") ||
          isSetblockSecondMarker(blockMap.get(cycleKey)?.cmd ?? ""));
        if (!markerCycle) {
          const signature = [...keys].map(String).sort().join("|");
          if (keys.length >= 2 && keys.length <= maxCycleSize) {
            if (!signatures.has(signature)) {
              signatures.add(signature);
              cycles.push(keys);
            }
          } else if (keys.length > maxCycleSize && !signatures.has("oversized:" + signature)) {
            signatures.add("oversized:" + signature);
            oversized.push(keys);
          }
        }
        break;
      }
      if (done.has(key)) break;
      index.set(key, path.length);
      path.push(key);
      const next = current.offset(current.facing, 1);
      current = next ? blockMap.get(blockKey(...next)) : null;
      if (current && current.type !== "chain") break;
    }
    for (const key of path) done.add(key);
  }
  const cycleKeys = new Set();
  for (const cycle of cycles) for (const k of cycle) cycleKeys.add(k);
  return [cycles, cycleKeys, oversized];
}

/* ---------------- 链对象 ---------------- */

export class Chain {
  constructor(type, blocks, {
    selfClosed = false, preservePhysicalType = false, selfClosedCycleKeys = [],
    brokenKind = null, brokenDirection = 2, brokenFacingMap = new Map(),
    brokenSpecialKeys = new Set(), brokenWrongFacingKeys = [], brokenGroups = [], matched = false,
  } = {}) {
    this.type = type;
    this.blocks = blocks;
    this.self_closed = selfClosed;
    this.preserve_physical_type = preservePhysicalType;
    this.self_closed_cycle_keys = selfClosedCycleKeys;
    this.broken_kind = brokenKind;
    this.broken_direction = brokenDirection;
    this.broken_facing_map = brokenFacingMap;
    this.broken_special_keys = brokenSpecialKeys;
    this.broken_wrong_facing_keys = brokenWrongFacingKeys;
    this.broken_groups = brokenGroups;
    this.matched = matched;
  }

  get head_kind() {
    if (this.broken_kind) return this.broken_kind.startsWith("testfor") ? "testfor" : "execute";
    return brokenKindFromBlocks(this.blocks);
  }

  get command_count() { return this.blocks.filter(b => !b.is_air_placeholder).length; }
}

export function brokenKindFromBlocks(blocks) {
  if (!blocks || blocks.length < 2) return null;
  const indexes = findBrokenSetblockIndexes(blocks);
  const first = String(blocks[0].cmd ?? "").trim();
  if (isExecuteRunRelativeCommand(first) && (!indexes.length || (indexes[0] === 0 && indexes.length >= 2))) {
    return "execute";
  }
  if (isTestforCommand(first) && (!indexes.length || (indexes[0] >= 1 && indexes.length >= 2))) {
    return "testfor";
  }
  return null;
}

export function isBrokenChainPlaceholder(blocks) {
  if (!blocks || blocks.length < 3) return false;
  if (String(blocks[0].cmd ?? "").trim() !== "") return false;
  return isSetblockRelativeCommand(blocks[1].cmd ?? "") && isSetblockRelativeCommand(blocks[2].cmd ?? "");
}

export function detectChainType(blocks) {
  if (!blocks || !blocks.length) return "impulse";
  if (brokenKindFromBlocks(blocks) || isBrokenChainPlaceholder(blocks)) return "snake";
  return blocks[0].type === "repeating" ? "repeat" : "impulse";
}

export const chainSortKey = block => [-block.x, block.y, block.z];

/* ---------------- 追踪 ---------------- */

class TraceContext {
  constructor(blockMap, owner, discarded, rootKeys, brokenHeadOf) {
    this.blockMap = blockMap;
    this.owner = owner;
    this.discarded = discarded;
    this.root_keys = rootKeys;
    this.brokenHeadOf = brokenHeadOf;
  }
}

function traceChain(root, ctx) {
  const { blockMap, owner, discarded, root_keys: rootKeys, brokenHeadOf } = ctx;
  const ordered = [];
  const orderedIndex = new Map();
  const local = new Set();
  const emptyPathByTarget = new Map();
  const chain = new Chain("impulse", ordered);
  const chainContinueDirection = new Map();

  const rememberSkippedEmpty = (target, path) => {
    if (!target || !path.length) return;
    emptyPathByTarget.set(target.key, [...path]);
  };

  const getExact = (block, facing, step = 1) => {
    const pos = block.offset(facing, step);
    return pos ? blockMap.get(blockKey(...pos)) : null;
  };

  const getLogical = (block, facing, step = 1) => {
    let candidate = getExact(block, facing, step);
    const seen = new Set();
    const skippedEmpty = [];
    while (candidate) {
      const key = candidate.key;
      const nestedBrokenRoot = rootKeys.has(key) && brokenHeadOf(candidate);
      if (discarded.has(key) || owner.has(key) || (rootKeys.has(key) && !nestedBrokenRoot) || seen.has(key)) {
        if (skippedEmpty.length) {
          const terminal = skippedEmpty[skippedEmpty.length - 1];
          const terminalKey = terminal.key;
          if (!discarded.has(terminalKey) && !owner.has(terminalKey) && !rootKeys.has(terminalKey)) {
            if (skippedEmpty.length > 1) rememberSkippedEmpty(terminal, skippedEmpty.slice(0, -1));
            return terminal;
          }
        }
        return null;
      }
      if (!(candidate.type === "chain" && String(candidate.cmd ?? "").trim() === "")) {
        if (skippedEmpty.length) rememberSkippedEmpty(candidate, skippedEmpty);
        return candidate;
      }
      seen.add(key);
      skippedEmpty.push(candidate);
      candidate = getExact(candidate, candidate.facing, 1);
    }
    if (skippedEmpty.length) {
      const terminal = skippedEmpty[skippedEmpty.length - 1];
      if (skippedEmpty.length > 1) rememberSkippedEmpty(terminal, skippedEmpty.slice(0, -1));
      return terminal;
    }
    return null;
  };

  const isEmptyChain = block => block.type === "chain" && String(block.cmd ?? "").trim() === "";

  const claim = (block, includeEmpty = false) => {
    if (!block || block.type === "air" || (isEmptyChain(block) && !includeEmpty)) return false;
    const key = block.key;
    if (local.has(key) || owner.has(key) || discarded.has(key)) return false;
    owner.set(key, root);
    local.add(key);
    const copy = block.copy({ cmd: String(block.cmd ?? "") });
    ordered.push(copy);
    orderedIndex.set(key, copy);
    return true;
  };

  const claimLogical = block => {
    if (!block) return false;
    for (const empty of emptyPathByTarget.get(block.key) ?? []) {
      const emptyKey = empty.key;
      if (local.has(emptyKey) || owner.has(emptyKey) || discarded.has(emptyKey)) continue;
      claim(empty, true);
    }
    return claim(block, isEmptyChain(block));
  };

  const addBrokenPattern = (pattern, patternRoot) => {
    const repeatingIndex = pattern.blocks.findIndex(b => b && b.type === "repeating");
    const hasRepeating = ordered.some(b => b.type === "repeating");
    if (repeatingIndex >= 0 && hasRepeating) {
      for (const b of pattern.blocks.slice(0, repeatingIndex)) {
        claim(b, true);
        chain.broken_facing_map.set(b.key, pattern.direction);
      }
      const repeatingBlock = pattern.blocks[repeatingIndex];
      if (repeatingBlock) chainContinueDirection.set(repeatingBlock.key, pattern.direction);
      if (patternRoot) chainContinueDirection.set(patternRoot.key, pattern.direction);
      return false;
    }
    chain.broken_facing_map.set(patternRoot.key, pattern.root_direction ?? pattern.direction);
    for (const b of pattern.blocks) {
      claim(b, true);
      chain.broken_facing_map.set(b.key, pattern.direction);
    }
    const wrongKey = pattern.marker ? pattern.marker.key : null;
    if (wrongKey !== null) {
      chain.broken_wrong_facing_keys.push(wrongKey);
      const wrongCopy = orderedIndex.get(wrongKey);
      if (wrongCopy) wrongCopy.broken_wrong_facing = true;
    }
    chain.broken_groups.push(pattern.kind);
    if (chain.broken_kind === null) {
      chain.broken_kind = pattern.kind.startsWith("testfor") ? "testfor" : "execute";
    }
    return true;
  };

  const brokenHead = brokenHeadOf(root);
  const fallbackHead = !brokenHead && (isTestforCommand(root.cmd ?? "") || isExecuteRunRelativeCommand(root.cmd ?? ""));

  if (brokenHead) {
    if (!claim(root)) return new Chain("impulse", []);
    chain.broken_direction = brokenHead.direction;
    let split = !addBrokenPattern(brokenHead, root);
    if (!split) {
      let current = ordered.length ? ordered[ordered.length - 1] : root;
      let currentDirection = brokenHead.direction;
      let guard = 0;
      while (current && guard < 10000) {
        guard++;
        const next = getLogical(current, currentDirection, 1);
        if (!next) break;
        const nested = brokenHeadOf(next);
        if (nested) {
          const nestedRepeating = next.type === "repeating" ||
            nested.blocks.some(b => b && b.type === "repeating");
          if (nestedRepeating && ordered.some(b => b.type === "repeating")) { split = true; break; }
          if (!claim(next)) break;
          addBrokenPattern(nested, next);
          current = ordered.length ? ordered[ordered.length - 1] : next;
          currentDirection = nested.direction;
          continue;
        }
        if (next.type !== "chain" || !claimLogical(next)) break;
        current = ordered.length ? ordered[ordered.length - 1] : next;
        currentDirection = next.facing;
      }
    }
    chain.type = "snake";
    chain.matched = !split;
    chain.broken_special_keys = new Set(chain.broken_facing_map.keys());
    chain.blocks = ordered;
    return chain;
  }

  if (fallbackHead) {
    if (!claim(root)) return new Chain("impulse", []);
    let current = ordered[0];
    let guard = 0;
    while (current && guard < 10000) {
      guard++;
      const direction = chainContinueDirection.get(current.key) ?? current.facing;
      const next = getLogical(current, direction, 1);
      if (!next || next.type !== "chain") break;
      if (!claimLogical(next)) break;
      current = next;
    }
    chain.blocks = ordered;
    return chain;
  }

  if (!claim(root)) return new Chain("impulse", []);
  let current = ordered[0];
  const mainSeen = new Set();
  while (current) {
    if (mainSeen.has(current.key)) break;
    mainSeen.add(current.key);
    const direction = chainContinueDirection.get(current.key) ?? current.facing;
    const next = getLogical(current, direction, 1);
    if (!next || next.type !== "chain") break;
    if (!claimLogical(next)) break;
    current = orderedIndex.get(next.key) ?? next;
  }
  chain.blocks = ordered;
  return chain;
}

/* ---------------- 提取入口 ---------------- */

export function extractChains(structure) {
  const blocks = structure.commandBlocks();
  if (!blocks.length) return [];

  const blockMap = new Map(blocks.map(b => [b.key, b]));
  const getExact = (block, facing, step = 1) => {
    const pos = block.offset(facing, step);
    return pos ? blockMap.get(blockKey(...pos)) : null;
  };

  // 断链头识别只依赖方格与朝向，同一方块最多算一次。
  const headCache = new WeakMap();
  const brokenHeadOf = block => {
    let pattern = headCache.get(block);
    if (pattern === undefined) {
      pattern = identifyBrokenHead(block, getExact, isBrokenHeadMarkerBlock);
      headCache.set(block, pattern);
    }
    return pattern;
  };

  const brokenPatternKeys = new Set();
  for (const root of blocks) {
    const pattern = brokenHeadOf(root);
    if (pattern) for (const b of pattern.blocks) brokenPatternKeys.add(b.key);
  }

  const [cycles, selfClosedKeys] = detectSelfClosedCycles(blockMap, 4, brokenPatternKeys);
  const discarded = new Set();
  const roots = [...blocks];
  const owner = new Map();
  const rootKeys = new Set(roots.filter(b => b.type === "command" || b.type === "repeating").map(b => b.key));
  const ctx = new TraceContext(blockMap, owner, discarded, rootKeys, brokenHeadOf);

  // 沿链前进是否可以到达自闭环；路径结果可复用，避免对每个方块重复走一遍。
  const cycleCache = new Map();
  const reachesCycle = root => {
    if (cycleCache.has(root.key)) return cycleCache.get(root.key);
    const path = [];
    const seen = new Set();
    let current = root;
    let result = false;
    for (let i = 0; i < Math.min(blockMap.size, 10000); i++) {
      const pos = current.offset(current.facing, 1);
      const next = pos ? blockMap.get(blockKey(...pos)) : null;
      if (!next || next.type !== "chain") break;
      if (selfClosedKeys.has(next.key)) { result = true; break; }
      if (cycleCache.has(next.key)) { result = cycleCache.get(next.key); break; }
      if (seen.has(next.key)) break;
      seen.add(next.key);
      path.push(next.key);
      current = next;
    }
    cycleCache.set(root.key, result);
    for (const key of path) cycleCache.set(key, result);
    return result;
  };

  const meta = new Map();
  for (const root of roots) {
    const pattern = brokenHeadOf(root);
    meta.set(root, {
      broken: pattern ? 0 : 1,
      reaches_cycle: root.type !== "chain" && reachesCycle(root) ? 0 : 1,
      root_type: root.type === "command" || root.type === "repeating" ? 0 : 1,
    });
  }

  const nestedKeys = new Set();
  for (const parent of roots) {
    const pattern = brokenHeadOf(parent);
    if (!pattern) continue;
    let current = pattern.blocks.length ? pattern.blocks[pattern.blocks.length - 1] : parent;
    let direction = pattern.direction;
    const seen = new Set();
    for (let i = 0; i < Math.min(blockMap.size, 10000); i++) {
      const pos = current.offset(direction, 1);
      const next = pos ? blockMap.get(blockKey(...pos)) : null;
      if (!next) break;
      if (seen.has(next.key) || next === parent) break;
      seen.add(next.key);
      const nested = brokenHeadOf(next);
      if (nested) {
        nestedKeys.add(next.key);
        current = nested.blocks.length ? nested.blocks[nested.blocks.length - 1] : next;
        direction = nested.direction;
        continue;
      }
      if (next.type !== "chain") break;
      current = next;
      direction = next.facing;
    }
  }

  const order = new Map();
  for (const root of roots) {
    const entry = meta.get(root);
    order.set(root, [
      entry.broken,
      nestedKeys.has(root.key) ? 1 : 0,
      entry.reaches_cycle,
      entry.root_type,
      ...chainSortKey(root),
    ]);
  }
  roots.sort((a, b) => compareKeys(order.get(a), order.get(b)));

  const chains = [];
  for (const root of roots) {
    if (root.type === "chain" && !brokenHeadOf(root)) continue;
    if (owner.has(root.key) || discarded.has(root.key)) continue;
    const chain = traceChain(root, ctx);
    if (!chain.blocks.length) continue;
    chain.type = detectChainType(chain.blocks);
    if (chain.matched || brokenKindFromBlocks(chain.blocks)) chain.type = "snake";
    if (chain.type === "snake") {
      normalizeBrokenChainBlocks(chain.blocks, {
        kind: chain.broken_kind, direction: chain.broken_direction,
        facingMap: chain.broken_facing_map, applyCondition: false,
      });
    }
    const orderedKeys = new Set(chain.blocks.map(b => b.key));
    const closed = cycles.filter(c => c.every(k => orderedKeys.has(k)));
    if (closed.length) {
      chain.self_closed = true;
      chain.self_closed_cycle_keys = closed.flat();
      const cycleKeys = new Set(chain.self_closed_cycle_keys);
      for (const b of chain.blocks) b.self_closed_cycle = cycleKeys.has(b.key);
    }
    chains.push(chain);
  }

  const represented = new Set();
  for (const chain of chains) for (const b of chain.blocks) represented.add(b.key);

  for (const cycle of cycles) {
    if (cycle.some(k => represented.has(k))) continue;
    const cycleBlocks = [];
    for (const k of cycle) {
      const block = blockMap.get(k);
      if (!block) break;
      cycleBlocks.push(block.copy({ cmd: String(block.cmd ?? ""), self_closed_cycle: true }));
    }
    if (cycleBlocks.length !== cycle.length) continue;
    chains.push(new Chain("repeat", cycleBlocks, {
      selfClosed: true, preservePhysicalType: true, selfClosedCycleKeys: [...cycle],
    }));
    for (const k of cycle) represented.add(k);
  }

  for (const block of blockMap.values()) {
    if (represented.has(block.key) || discarded.has(block.key)) continue;
    chains.push(new Chain("repeat", [block.copy({ cmd: String(block.cmd ?? "") })], { preservePhysicalType: true }));
    represented.add(block.key);
  }

  chains.sort((a, b) => compareKeys(chainSortKey(a.blocks[0]), chainSortKey(b.blocks[0])));
  return chains;
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function formatChain(chain) {
  return {
    type: chain.type,
    head_kind: chain.head_kind,
    self_closed: chain.self_closed,
    blocks: chain.blocks.length,
    commands: chain.command_count,
    broken_groups: chain.broken_groups,
    steps: chain.blocks.map(b => ({
      x: b.x, y: b.y, z: b.z, type: b.type, facing: b.facing, cond: b.cond, auto: b.auto,
      cmd: b.cmd, air_placeholder: b.is_air_placeholder, auxiliary: b.is_auxiliary,
      marker: isSetblockRelativeCommand(b.cmd ?? ""), wrong_facing: b.broken_wrong_facing,
    })),
  };
}

/* ---------------- 布局 ---------------- */

export const STD_Z = 32;
export const MAX_STRUCTURE_SIZE = 64;
export const X_COLUMN_STEP = 2;

export class LayoutError extends Error {}

export class Layout {
  constructor(blocks, size, spanX, chainCount, part = 1) {
    this.blocks = blocks;
    this.size = size;
    this.span_x = spanX;
    this.chain_count = chainCount;
    this.part = part;
  }
  commandBlocks() { return this.blocks.filter(b => !b.is_air_placeholder); }
}

function otherCapacity(chain) {
  if (chain.type !== "snake") return 31;
  if (chain.head_kind === "testfor") return 29;
  if (chain.head_kind === "execute") return 30;
  return 30;
}

function firstBlockType(chain) {
  if (chain.type === "impulse") return "command";
  if (chain.type === "repeat") return "repeating";
  const head = chain.blocks.length ? chain.blocks[0].type : "chain";
  return head === "command" || head === "repeating" ? head : "repeating";
}

export function relayoutChain(chain, xColumn) {
  const ordered = chain.blocks;
  if (!ordered.length) return [];
  const firstCapacity = STD_Z;
  const capacity = otherCapacity(chain);
  const headType = firstBlockType(chain);
  const snake = chain.type === "snake";
  const firstRowEndZ = STD_Z - firstCapacity;
  const snakeRowStartZ = firstRowEndZ;
  const snakeRowEndZ = snakeRowStartZ + capacity - 1;

  const positions = ordered.map((_, i) => {
    if (i < firstCapacity) return [0, STD_Z - 1 - i];
    const idx = i - firstCapacity;
    const layer = Math.floor(idx / capacity);
    const pos = idx % capacity;
    const y = 1 + layer;
    let z;
    if (snake) z = layer % 2 === 0 ? snakeRowStartZ + pos : snakeRowEndZ - pos;
    else z = layer % 2 === 0 ? pos : capacity - 1 - pos;
    return [y, z];
  });

  const blocks = [];
  ordered.forEach((source, i) => {
    const [y, z] = positions[i];
    let facing;
    if (i + 1 < positions.length) {
      const [ny, nz] = positions[i + 1];
      const dz = nz - z, dy = ny - y;
      if (dz === 0 && dy > 0) facing = 1;
      else if (dz < 0) facing = 2;
      else if (dz > 0) facing = 3;
      else facing = dy < 0 ? 0 : 2;
    } else if (i < firstCapacity) {
      facing = 2;
    } else {
      const layer = Math.floor((i - firstCapacity) / capacity);
      facing = layer % 2 === 0 ? 3 : 2;
    }
    blocks.push(new Block(xColumn, y, z,
      source.is_auxiliary ? source.type : (i === 0 ? headType : "chain"),
      source.broken_wrong_facing ? 1 : facing,
      String(source.cmd ?? ""), source.cond ? 1 : 0, source.auto === 0 ? 0 : 1,
      source.is_auxiliary, source.is_air_placeholder, source.broken_wrong_facing,
      source.is_broken_normalized, source.self_closed_cycle));
  });

  if (snake) {
    const wrongKeys = new Set(chain.broken_wrong_facing_keys);
    if (wrongKeys.size || ordered.some(b => b.broken_wrong_facing)) {
      ordered.forEach((source, i) => {
        if (wrongKeys.has(source.key) || source.broken_wrong_facing) blocks[i].facing = 1;
      });
    } else {
      const markerIndexes = findBrokenSetblockIndexes(ordered);
      if (markerIndexes.length >= 2) blocks[markerIndexes[1]].facing = 1;
    }
  }
  return blocks;
}

export function resolveOverlaps(chains) {
  const occupied = new Set();
  for (const chain of chains) {
    if (!chain.blocks.length) continue;
    const local = chain.blocks.map(b => b.key);
    if (new Set(local).size !== local.length) {
      throw new LayoutError("链 " + chain.blocks[0].key + " 内有重复坐标");
    }
    let dx = 0;
    while (chain.blocks.some(b => occupied.has(blockKey(b.x + dx, b.y, b.z)))) dx--;
    if (dx) for (const b of chain.blocks) b.x += dx;
    for (const b of chain.blocks) occupied.add(b.key);
  }
}

export function reflowChains(chains) {
  chains.forEach((chain, i) => {
    if (chain.self_closed || (chain.preserve_physical_type && chain.blocks.length === 1)) {
      const anchorX = chain.blocks[0].x;
      const dx = -X_COLUMN_STEP * i - anchorX;
      for (const b of chain.blocks) b.x += dx;
      return;
    }
    chain.blocks = relayoutChain(chain, -X_COLUMN_STEP * i);
  });
  resolveOverlaps(chains);
  return chains;
}

export function buildLayouts(chains, maxSize = MAX_STRUCTURE_SIZE) {
  const nonEmpty = chains.filter(c => c.blocks.some(b => !b.is_air_placeholder));
  if (!nonEmpty.length) return [new Layout([], [1, 1, STD_Z], 0, 0)];

  const layouts = [];
  let current = [];
  let minX = null, maxX = null;

  const finish = () => {
    if (!current.length) return;
    const blocks = current.flatMap(chain => chain.blocks.map(b => b.copy()));
    const partMinX = Math.min(...blocks.map(b => b.x));
    const partMaxX = Math.max(...blocks.map(b => b.x));
    const partMaxY = Math.max(...blocks.map(b => b.y));
    const partMaxZ = Math.max(...blocks.map(b => b.z));
    const spanX = partMaxX - partMinX + 1;
    const sizeY = partMaxY + 1;
    const sizeZ = Math.max(STD_Z, partMaxZ + 1);
    if (spanX > maxSize) {
      throw new LayoutError("整组链的 X 跨度 " + spanX + " 超过 " + maxSize + " 上限；链未被切断");
    }
    if (sizeY > maxSize || sizeZ > maxSize) {
      throw new LayoutError("结构尺寸 " + spanX + "x" + sizeY + "x" + sizeZ + " 超过 " + maxSize);
    }
    for (const b of blocks) b.x -= partMinX;
    layouts.push(new Layout(blocks, [spanX, sizeY, sizeZ], spanX, current.length, layouts.length + 1));
    current = [];
    minX = null;
    maxX = null;
  };

  nonEmpty.forEach((chain, index) => {
    const xs = chain.blocks.map(b => b.x);
    const blockMinX = Math.min(...xs);
    const blockMaxX = Math.max(...xs);
    const span = blockMaxX - blockMinX + 1;
    if (span > maxSize) {
      throw new LayoutError("链 " + (index + 1) + " 布局后 X 跨度 " + span + "，不切断无法放进 " + maxSize + " 的结构");
    }
    const nextMin = minX === null ? blockMinX : Math.min(minX, blockMinX);
    const nextMax = maxX === null ? blockMaxX : Math.max(maxX, blockMaxX);
    if (current.length && nextMax - nextMin + 1 > maxSize) finish();
    if (!current.length) { minX = blockMinX; maxX = blockMaxX; }
    else { minX = Math.min(minX, blockMinX); maxX = Math.max(maxX, blockMaxX); }
    current.push(chain);
  });
  finish();
  return layouts;
}

/* ---------------- 分组分析 ---------------- */

const TAG_RE = /tag=!?([A-Za-z0-9_]+)/;
const SCORES_RE = /scores=\{([^}]*)\}/;
const SELECTOR_KIND_RE = /@([aepsrn])/;
const TAG_G = new RegExp(TAG_RE.source, "g");
const SCORES_G = new RegExp(SCORES_RE.source, "g");
export const DEFAULT_SPLIT_AT = 96;

export class ChainProfile {
  constructor(index, kind, head, blocks, commands, empty, trigger, tags = new Set(), objectives = new Set(), selector = "") {
    this.index = index;
    this.kind = kind;
    this.head = head;
    this.blocks = blocks;
    this.commands = commands;
    this.empty = empty;
    this.trigger = trigger;
    this.tags = tags;
    this.objectives = objectives;
    this.selector = selector;
  }
  as_dict() {
    return {
      index: this.index, type: this.kind, blocks: this.blocks, commands: this.commands,
      empty: this.empty, trigger: this.trigger, tags: [...this.tags].sort(),
      objectives: [...this.objectives].sort(), selector: this.selector, head: this.head,
    };
  }
}

export function triggerOf(command) {
  let text = String(command ?? "").trim();
  if (text.startsWith("/")) text = text.slice(1);
  const lower = text.toLowerCase();
  if (lower.startsWith("testfor ")) return text.slice(8).trim();
  if (lower.startsWith("execute ")) {
    const cut = lower.indexOf(" run ");
    return cut > 0 ? text.slice(0, cut).trim() : text;
  }
  return text;
}

export function objectivesOf(trigger) {
  const names = new Set();
  for (const match of trigger.matchAll(SCORES_G)) {
    for (const part of match[1].split(",")) {
      if (!part.includes("=")) continue;
      const name = part.split("=")[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

export function profileChain(index, chain) {
  const blocks = chain.blocks.filter(block => !block.is_air_placeholder);
  const commands = blocks.map(block => String(block.cmd ?? "").trim()).filter(Boolean);
  const head = commands.length ? commands[0] : "";
  const trigger = triggerOf(head);
  const match = SELECTOR_KIND_RE.exec(trigger);
  return new ChainProfile(index, chain.type, head, blocks.length, commands.length,
    blocks.length - commands.length, trigger,
    new Set([...trigger.matchAll(TAG_G)].map(m => m[1])),
    objectivesOf(trigger), match ? "@" + match[1] : "");
}

export function profiles(structure) {
  return extractChains(structure).map((chain, i) => profileChain(i + 1, chain));
}

export function families(rows) {
  const out = new Map();
  for (const row of rows) {
    const key = row.trigger.split(/\s+/).join(" ");
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

export function mergeCandidates(rows) {
  const out = [];
  for (const [key, group] of families(rows)) {
    if (group.length < 2 || !key) continue;
    out.push({
      trigger: key,
      chains: group.map(item => item.index),
      merged_blocks: group.reduce((a, b) => a + b.blocks, 0) - 2 * (group.length - 1),
      merged_commands: group.reduce((a, b) => a + b.commands, 0),
      steady_blocks: 1,
      peak_now: Math.max(...group.map(item => item.commands)),
    });
  }
  out.sort((a, b) => b.merged_commands - a.merged_commands);
  return out;
}

function parseRange(text) {
  const value = String(text).trim();
  if (!value || value.startsWith("!")) return null;
  if (value.includes("..")) {
    const [low, high] = value.split("..", 2);
    const lo = low.trim() === "" || low.trim() === "+" ? null : Number(low);
    const hi = high.trim() === "" || high.trim() === "+" ? null : Number(high);
    if ((lo !== null && Number.isNaN(lo)) || (hi !== null && Number.isNaN(hi))) return null;
    return [lo, hi];
  }
  const single = Number(value);
  if (Number.isNaN(single)) return null;
  return [single, single];
}

function rangesOverlap(left, right) {
  const [low1, high1] = left, [low2, high2] = right;
  if (high1 !== null && low2 !== null && high1 < low2) return false;
  if (high2 !== null && low1 !== null && high2 < low1) return false;
  return true;
}

function rangeMap(trigger) {
  const out = new Map();
  for (const match of trigger.matchAll(SCORES_G)) {
    for (const part of match[1].split(",")) {
      if (!part.includes("=")) continue;
      const [name, value] = part.split("=").slice(0, 2);
      const parsed = parseRange(value);
      if (parsed) out.set(name.trim(), parsed);
    }
  }
  return out;
}

export function objectiveFamilies(rows) {
  const buckets = new Map();
  for (const row of rows) {
    if (!row.objectives.size) continue;
    const key = row.selector + "\u0000" + [...row.objectives].sort().join(",");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const out = [];
  for (const [, group] of buckets) {
    if (group.length < 2) continue;
    const selector = group[0].selector;
    const objectives = [...group[0].objectives].sort();
    let overlap = false;
    for (const name of objectives) {
      const ranges = group.map(item => rangeMap(item.trigger).get(name)).filter(Boolean);
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
          if (rangesOverlap(ranges[i], ranges[j])) overlap = true;
        }
      }
    }
    out.push({
      selector, objectives, chains: group.map(item => item.index),
      peak_now: Math.max(...group.map(item => item.commands)),
      peak_merged: group.reduce((a, b) => a + b.commands, 0) - (group.length - 1),
      steady_now: group.length,
      overlap,
    });
  }
  out.sort((a, b) => b.chains.length - a.chains.length);
  return out;
}

export function splitCandidates(rows, splitAt = DEFAULT_SPLIT_AT) {
  return rows.filter(row => row.commands > splitAt).map(row => ({
    chain: row.index,
    commands: row.commands,
    pieces: Math.floor((row.commands + splitAt - 1) / splitAt),
    trigger: row.trigger,
  }));
}

export function steadyState(rows) {
  const repeating = rows.filter(row => row.kind !== "impulse").length;
  const peak = rows.length ? Math.max(...rows.map(row => row.commands)) : 0;
  const total = rows.reduce((a, row) => a + row.commands, 0);
  return {
    chains: rows.length,
    repeating_blocks: repeating,
    total_commands: total,
    peak_commands: peak,
    mean_commands: rows.length ? Math.round((total / rows.length) * 10) / 10 : 0,
  };
}

export function questions(rows, merges, objectiveGroups, splits) {
  const base = [
    "每条链的触发频率：每 tick / 每秒 / 玩家动作 / 每分钟 / 每日？（决定合并后峰值值不值）",
    "合并后是否要求「同一 gt 内全部完成」？有顺序依赖（前一条改状态、后一条读状态）就不能拆。",
    "单次触发可接受的命令数上限是多少？（默认 96，可按机器性能调）",
    "拆出来的链允许在同一 gt 由另一个循环方块并行跑吗？常态会多一个循环方块。",
    "拆分点是否压在逻辑阶段边界上（检测 → 结算 → 提示）？不能切在一条状态机中间。",
    "触发后允许延迟 1 gt 吗？不允许就必须一条链内跑完。",
  ];
  for (const item of merges.slice(0, 3)) {
    const chainsText = item.chains.map(String).join("、");
    base.push("链 " + chainsText + " 触发条件相同：合并后常驻 1 个循环方块、单次约 " +
      item.merged_commands + " 条（现在常驻 " + item.chains.length + " 个、峰值 " + item.peak_now + "），合并还是保留？");
  }
  for (const item of objectiveGroups.slice(0, 4)) {
    const chainsText = item.chains.map(String).join("、");
    const flag = item.overlap ? "区间有重叠，合并要重写条件" : "区间互斥，可直接换成一个总条件";
    base.push("链 " + chainsText + " 都读 " + item.selector + " 的 " + item.objectives.join(",") + "：" +
      flag + "；合并后峰值约 " + item.peak_merged + "，常驻 1 个循环方块，要不要并？");
  }
  for (const item of splits.slice(0, 3)) {
    base.push("链 " + item.chain + " 有 " + item.commands + " 条命令，超过 " + DEFAULT_SPLIT_AT +
      "：按 " + item.pieces + " 段拆，还是压成一个断链头、接受一次触发的峰值？");
  }
  return base;
}

export function markdown(rows, splitAt = DEFAULT_SPLIT_AT) {
  const stats = steadyState(rows);
  const merges = mergeCandidates(rows);
  const objectiveGroups = objectiveFamilies(rows);
  const splits = splitCandidates(rows, splitAt);
  const lines = [
    "# 断链细分建议", "",
    "- 链 " + stats.chains + " 条，常驻循环方块 " + stats.repeating_blocks + " 个（常态每 tick 各跑 1 条）",
    "- 单次峰值 " + stats.peak_commands + " 条命令，平均 " + stats.mean_commands + " 条",
    "- 判定阈值：单次 " + splitAt + " 条命令", "",
    "## 每条链", "", "| # | 类型 | 方块 | 命令 | 空块 | 触发 |", "|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push("| " + row.index + " | " + row.kind + " | " + row.blocks + " | " + row.commands +
      " | " + row.empty + " | " + row.trigger.replace("|", "\\|").slice(0, 64) + " |");
  }
  lines.push("", "## 同目标的链（可能可以并成一个断链头）", "");
  if (objectiveGroups.length) {
    lines.push("| 链 | 选择器 | 目标 | 现状 | 合并后 | 区间 |", "|---|---|---|---|---|---|");
    for (const item of objectiveGroups) {
      const chainsText = item.chains.map(String).join("、");
      lines.push("| " + chainsText + " | " + item.selector + " | " + item.objectives.join(",") +
        " | " + item.steady_now + " 个循环方块 / 峰值 " + item.peak_now +
        " | 1 个 / 峰值 " + item.peak_merged + " | " + (item.overlap ? "重叠，需重写" : "互斥") + " |");
    }
  } else {
    lines.push("无：没有多条链在读同一组目标。");
  }
  lines.push("", "## 完全同触发的链", "");
  if (merges.length) {
    for (const item of merges) {
      lines.push("- 链 " + item.chains.map(String).join("、") + "：合并后 " + item.merged_commands +
        " 条命令，常驻 1 个循环方块（现在 " + item.chains.length + " 个）");
    }
  } else {
    lines.push("无。");
  }
  lines.push("", "## 超出阈值的链（拆 or 压）", "");
  if (splits.length) {
    lines.push("| 链 | 命令数 | 建议段数 | 说明 |", "|---|---|---|---|");
    for (const item of splits) {
      const per = Math.ceil(item.commands / item.pieces);
      lines.push("| " + item.chain + " | " + item.commands + " | " + item.pieces +
        " | 拆开后每段约 " + per + " 条，必须按逻辑阶段切 |");
    }
  } else {
    lines.push("无：没有链超过 " + splitAt + " 条命令。");
  }
  const shared = sharedTagCandidates(rows);
  if (shared.length) {
    lines.push("", "## 共享 tag 的不同触发（只是线索）", "");
    for (const item of shared.slice(0, 10)) {
      lines.push("- 链 " + item.chains[0] + " 与 " + item.chains[1] + " 共享 tag：" + item.tags.join(", "));
    }
  }
  lines.push("", "## 需要作者决定的问题", "");
  questions(rows, merges, objectiveGroups, splits).forEach((text, i) => lines.push((i + 1) + ". " + text));
  lines.push("");
  return lines.join("\n");
}

export function sharedTagCandidates(rows) {
  const out = [];
  rows.forEach((left, i) => {
    for (const right of rows.slice(i + 1)) {
      const common = [...left.tags].filter(t => right.tags.has(t)).sort();
      if (common.length && left.trigger.split(/\s+/).join(" ") !== right.trigger.split(/\s+/).join(" ")) {
        out.push({ chains: [left.index, right.index], tags: common, peak: left.commands + right.commands });
      }
    }
  });
  return out;
}
