import { STD_Z } from './constants.js?v=r49-cleanup-20261129';
import { blockKey, getOffsetPosition } from './blocks.js?v=r49-cleanup-20261129';
import {
  detectSelfClosedCycles,
  findBrokenChainSetblockIndexes,
  getBrokenHeadKind,
  identifyBrokenHeadGeometry,
  isBrokenChainPlaceholder,
  isBrokenHeadMarkerBlock,
  isExecuteRunRelativeCommand,
  isTestforCommand,
  normalizeBrokenChainBlocks
} from './broken-chain.js?v=r49-cleanup-20261129';

export function traceChain(root, context, owner) {
  const { blockMap, rootKeys } = context;
  const ordered = [];
  const orderedIndex = new Map();
  const local = new Set();
  const emptyPathByTarget = new Map();
  const rememberSkippedEmpty = (target, path) => {
    if (!target || !Array.isArray(path) || path.length === 0) return;
    // Important: claimLogical() looks up by the exact physical node returned by
    // getLogical(). Never key this map by the downstream blocked/owned candidate.
    emptyPathByTarget.set(blockKey(target.x, target.y, target.z), path.slice());
  };
  const isEmptyChain = (b) => b?.type === 'chain' && String(b.cmd || '').trim() === '';
  const getExact = (b, facing, step = 1) => {
    const p = getOffsetPosition(b, facing, step);
    if (!p) return null;
    return blockMap.get(blockKey(p.x, p.y, p.z)) || null;
  };
  const getLogical = (b, facing, step = 1) => {
    let candidate = getExact(b, facing, step);
    const seen = new Set();
    const skippedEmpty = [];
    while (candidate) {
      const k = blockKey(candidate.x, candidate.y, candidate.z);
      const nestedBrokenRoot =
        rootKeys?.has(k) && !!identifyBrokenHeadGeometry(candidate, getExact, isBrokenHeadMarkerBlock);
      if (
        owner.has(k) ||
        (rootKeys?.has(k) && !nestedBrokenRoot) ||
        seen.has(k)
      ) {
        // Preserve a terminal empty physical block even when it cannot lead to
        // another non-empty command. The owner/blocked guards still win.
        if (skippedEmpty.length) {
          const terminal = skippedEmpty[skippedEmpty.length - 1];
          const terminalKey = blockKey(terminal.x, terminal.y, terminal.z);
          if (!owner.has(terminalKey) && !rootKeys?.has(terminalKey)) {
            if (skippedEmpty.length > 1) rememberSkippedEmpty(terminal, skippedEmpty.slice(0, -1));
            return terminal;
          }
        }
        return null;
      }
      if (!isEmptyChain(candidate)) {
        if (skippedEmpty.length) rememberSkippedEmpty(candidate, skippedEmpty);
        return candidate;
      }
      seen.add(k);
      skippedEmpty.push(candidate);
      candidate = getExact(candidate, candidate.facing, 1);
    }
    // Important: trailing empty command blocks are still physical nodes. Return
    // the final one and let claimLogical include both it and any skipped empties.
    if (skippedEmpty.length) {
      const terminal = skippedEmpty[skippedEmpty.length - 1];
      if (skippedEmpty.length > 1) rememberSkippedEmpty(terminal, skippedEmpty.slice(0, -1));
      return terminal;
    }
    return null;
  };
  const claim = (b, includeEmpty = false) => {
    if (!b || b.type === 'air' || (isEmptyChain(b) && !includeEmpty)) return false;
    const k = blockKey(b.x, b.y, b.z);
    if (local.has(k) || owner.has(k)) return false;
    owner.set(k, root);
    local.add(k);
    const copy = { ...b, cmd: String(b.cmd || '') };
    ordered.push(copy);
    orderedIndex.set(k, copy);
    return true;
  };
  // getLogical can look past blank physical chain blocks to continue tracing.
  // Keep those blocks in the ordered chain instead of silently dropping them.
  const claimLogical = (b) => {
    if (!b) return false;
    const k = blockKey(b.x, b.y, b.z);
    for (const empty of emptyPathByTarget.get(k) || []) {
      const ek = blockKey(empty.x, empty.y, empty.z);
      if (local.has(ek) || owner.has(ek)) continue;
      claim(empty, true);
    }
    return claim(b, isEmptyChain(b));
  };
  const matchBrokenHeadExact = () => {
    const pattern = identifyBrokenHeadGeometry(root, getExact, isBrokenHeadMarkerBlock);
    if (!pattern) return null;
    // Gaps are never deleted or traversed as wrong branches. A command block
    // occupying the gap is claimed into this chain by pattern.blocks; non-command
    // blocks and air are simply skipped geometrically.
    return pattern;
  };
  const brokenHead = matchBrokenHeadExact();
  const fallbackHead =
    !brokenHead && (isTestforCommand(root.cmd || '') || isExecuteRunRelativeCommand(root.cmd || ''));
  if (brokenHead) {
    if (!claim(root)) return [];
    const facingMap = {};
    const wrongFacingKeys = [];
    const hasRepeatingBlock = () => ordered.some((b) => b?.blockType === 'repeating');
    const addBrokenPattern = (pattern, patternRoot) => {
      const repeatingIndex = pattern.blocks.findIndex((b) => b?.blockType === 'repeating');
      // A command chain may contain only one repeating command block. When a
      // second one is found inside a broken-head pattern, stop before it and
      // leave it (and every following block) to be traced as the next chain.
      if (repeatingIndex >= 0 && hasRepeatingBlock()) {
        for (const b of pattern.blocks.slice(0, repeatingIndex)) {
          claim(b, true);
          facingMap[blockKey(b.x, b.y, b.z)] = pattern.direction;
        }
        // The new chain starts at the second repeating block. It must keep
        // following the original broken-head direction (the following marker is
        // intentionally misoriented), otherwise the rest of the chain would be
        // split into isolated orphan blocks.
        const repeatingBlock = pattern.blocks[repeatingIndex];
        if (repeatingBlock) repeatingBlock.splitContinueDirection = pattern.direction;
        if (pattern.wrongFacingBlock) pattern.wrongFacingBlock.splitContinueDirection = pattern.direction;
        if (context) context.repeatingSplits = (context.repeatingSplits || 0) + 1;
        return false;
      }
      const rootKey = blockKey(patternRoot.x, patternRoot.y, patternRoot.z);
      facingMap[rootKey] = Number.isInteger(pattern.rootDirection)
        ? pattern.rootDirection
        : pattern.direction;
      for (const b of pattern.blocks) {
        // Broken-head pattern members are physical chain segments, including
        // an empty chain command block used as the auxiliary gap block.
        claim(b, true);
        facingMap[blockKey(b.x, b.y, b.z)] = pattern.direction;
      }
      // Physical command blocks in the gap are already claimed through
      // pattern.blocks. Never discard them merely because their facing is wrong.
      const wrongKey = blockKey(
        pattern.wrongFacingBlock.x,
        pattern.wrongFacingBlock.y,
        pattern.wrongFacingBlock.z
      );
      wrongFacingKeys.push(wrongKey);
      const wrongCopy = orderedIndex.get(wrongKey);
      if (wrongCopy) wrongCopy.brokenWrongFacing = true;
      ordered._brokenGroups = (ordered._brokenGroups || []).concat(pattern.kind);
      if (!ordered._brokenMatch)
        ordered._brokenMatch = pattern.kind.startsWith('testfor') ? 'testfor' : 'execute';
      return true;
    };
    if (!addBrokenPattern(brokenHead, root)) {
      return ordered;
    }
    let current = ordered[ordered.length - 1] || root;
    let currentDirection = brokenHead.direction;
    let guard = 0;
    while (current && guard++ < 10000) {
      const next = getLogical(current, currentDirection, 1);
      if (!next) break;
      const nk = blockKey(next.x, next.y, next.z);
      if (owner.has(nk)) break;
      const nestedPattern = identifyBrokenHeadGeometry(next, getExact, isBrokenHeadMarkerBlock);
      if (nestedPattern) {
        const nestedRepeating =
          (next.blockType || next.type) === 'repeating' ||
          nestedPattern.blocks.some((b) => b?.blockType === 'repeating');
        if (nestedRepeating && hasRepeatingBlock()) {
          if (context) context.repeatingSplits = (context.repeatingSplits || 0) + 1;
              break;
        }
        if (!claim(next)) break;
        addBrokenPattern(nestedPattern, next);
        current = ordered[ordered.length - 1] || next;
        currentDirection = nestedPattern.direction;
        continue;
      }
      if (next.type !== 'chain' || !claimLogical(next)) break;
      current = ordered[ordered.length - 1] || next;
      currentDirection = next.facing;
    }
    ordered._brokenMatched = true;
    ordered._brokenDirection = brokenHead.direction;
    ordered._brokenFacingMap = facingMap;
    ordered._brokenWrongFacingKeys = wrongFacingKeys;
    ordered._brokenSpecialKeys = Object.keys(facingMap);
    return ordered;
  }

  if (fallbackHead) {
    if (!claim(root)) return [];
    let current = ordered[0];
    let guard = 0;
    while (current && guard++ < 10000) {
      const direction = Number.isInteger(current.splitContinueDirection)
        ? current.splitContinueDirection
        : current.facing;
      const next = getLogical(current, direction, 1);
      if (!next || next.type !== 'chain') break;
      const nk = blockKey(next.x, next.y, next.z);
      if (owner.has(nk) || !claimLogical(next)) break;
      current = next;
    }
    ordered._brokenCandidate = true;
    return ordered;
  }

  if (!claim(root)) return [];
  let current = ordered[0];
  const mainSeen = new Set();
  while (current) {
    const currentKey = blockKey(current.x, current.y, current.z);
    if (mainSeen.has(currentKey)) break;
    mainSeen.add(currentKey);
    const direction = Number.isInteger(current.splitContinueDirection)
      ? current.splitContinueDirection
      : current.facing;
    const next = getLogical(current, direction, 1);
    if (!next || next.type !== 'chain') break;
    const nk = blockKey(next.x, next.y, next.z);
    if (owner.has(nk) || !claimLogical(next)) break;
    current = orderedIndex.get(nk) || next;
  }
  return ordered;
}
export function chainSort(a, b) {
  return b.x - a.x || a.y - b.y || a.z - b.z;
}
export function detectChainType(ordered) {
  if (!ordered || ordered.length === 0) return 'impulse';
  if (getBrokenHeadKind(ordered) || isBrokenChainPlaceholder(ordered)) return 'snake';
  if (ordered[0].blockType === 'repeating') return 'repeat';
  return 'impulse';
}
export function relayoutBlocks(ordered, chainType, xCol) {
  if (!ordered || ordered.length === 0) return [];
  const headKind = chainType === 'snake' ? getBrokenHeadKind(ordered) || ordered._brokenMatch || null : null;
  const placeholder = chainType === 'snake' && !headKind && isBrokenChainPlaceholder(ordered);
  // Keep the first physical row at the full 32-block depth. The broken-head
  // signature controls rows two and onward: /execute uses 30 blocks per row,
  // /testfor uses 29. This distinction must survive imports and live edits.
  const firstCapacity = STD_Z;
  const otherCapacity =
    chainType === 'snake'
      ? (ordered._brokenGroups || []).includes('testfor-gap') ||
        (ordered._brokenGroups || []).includes('testfor-direct') ||
        headKind === 'testfor'
        ? 29
        : 30
      : 31;
  const firstBlockType =
    chainType === 'impulse'
      ? 'command'
      : chainType === 'repeat'
        ? 'repeating'
        : ordered[0].blockType === 'command' || ordered[0].blockType === 'repeating'
          ? ordered[0].blockType
          : 'repeating';
  const positions = new Array(ordered.length);
  const firstRowEndZ = STD_Z - firstCapacity;
  const snakeRowStartZ = firstRowEndZ;
  const snakeRowEndZ = snakeRowStartZ + otherCapacity - 1;
  for (let i = 0; i < ordered.length; i++) {
    let y, z;
    if (i < firstCapacity) {
      y = 0;
      z = STD_Z - 1 - i;
    } else {
      const idx = i - firstCapacity;
      const layerIdx = Math.floor(idx / otherCapacity);
      const posInLayer = idx % otherCapacity;
      y = 1 + layerIdx;
      if (chainType === 'snake')
        z = layerIdx % 2 === 0 ? snakeRowStartZ + posInLayer : snakeRowEndZ - posInLayer;
      else z = layerIdx % 2 === 0 ? posInLayer : otherCapacity - 1 - posInLayer;
    }
    positions[i] = { y, z };
  }
  const blocks = [];
  for (let i = 0; i < ordered.length; i++) {
    const pos = positions[i];
    const np = positions[i + 1];
    let facing;
    if (np) {
      const dx = np.z - pos.z,
        dy = np.y - pos.y;
      if (dx === 0 && dy > 0) facing = 1;
      else if (dx < 0) facing = 2;
      else if (dx > 0) facing = 3;
      else facing = dy < 0 ? 0 : 2;
    } else if (i < firstCapacity) {
      facing = 2;
    } else {
      const idx = i - firstCapacity;
      const layerIdx = Math.floor(idx / otherCapacity);
      facing = layerIdx % 2 === 0 ? 3 : 2;
    }
    const src = ordered[i];
    const auxiliary = !!src.isAuxiliary;
    const sourceBlockType = ['command', 'repeating', 'chain'].includes(src.blockType)
      ? src.blockType
      : 'chain';
    blocks.push({
      x: xCol,
      y: pos.y,
      z: pos.z,
      facing: src.brokenWrongFacing ? 1 : facing,
      blockType: auxiliary ? sourceBlockType : i === 0 ? firstBlockType : 'chain',
      cmd: String(src.cmd || ''),
      cond: src.cond ? 1 : 0,
      auto: src.auto !== 0 ? 1 : 0,
      brokenWrongFacing: !!src.brokenWrongFacing,
      isAuxiliary: auxiliary,
      isBrokenNormalized: !!src.isBrokenNormalized,
      isAirPlaceholder: !!src.isAirPlaceholder,
      marked: !!src.marked,
      note: src.note || ''
    });
  }
  // Exactly one marker is intentionally misoriented. Keep this in the actual
  // block state as well as in the canonical marker command, otherwise a later
  // export/import round-trip silently turns the broken head into a normal chain.
  if (chainType === 'snake' && (headKind || placeholder)) {
    const wrongKeys = new Set(ordered._brokenWrongFacingKeys || []);
    const hasExplicitMarkerFlags = ordered.some((b) => !!b?.brokenWrongFacing);
    if (wrongKeys.size || hasExplicitMarkerFlags) {
      for (let i = 0; i < ordered.length; i++) {
        const key = blockKey(ordered[i].x, ordered[i].y, ordered[i].z);
        if ((wrongKeys.has(key) || ordered[i].brokenWrongFacing) && blocks[i]) blocks[i].facing = 1;
      }
    } else {
      const markerIndexes = findBrokenChainSetblockIndexes(ordered);
      const wrongFacingIndex = markerIndexes[1];
      if (Number.isInteger(wrongFacingIndex) && blocks[wrongFacingIndex]) blocks[wrongFacingIndex].facing = 1;
    }
  }
  return blocks;
}
export function processCommands(commands, context = {}, hooks = {}) {
  if (!commands || commands.length === 0) return [];
  context.repeatingSplits = 0;
  const warn = typeof hooks.warn === 'function' ? hooks.warn : (message) => console.warn(message);
  const blockMap =
    context.blockMap instanceof Map
      ? context.blockMap
      : new Map(commands.map((b) => [blockKey(b.x, b.y, b.z), { ...b, type: b.blockType }]));
  const getExactFromMap = (b, facing, step = 1) => {
    const p = getOffsetPosition(b, facing, step);
    return p ? blockMap.get(blockKey(p.x, p.y, p.z)) || null : null;
  };
  // Pre-scan broken-head members so a downward chain whose marker points back
  // at its gap is not mistaken for a deliberate 2-block self-closed loop.
  const brokenPatternKeys = new Set();
  for (const root of commands) {
    const pattern = identifyBrokenHeadGeometry(root, getExactFromMap, isBrokenHeadMarkerBlock);
    if (!pattern) continue;
    for (const b of pattern.blocks) brokenPatternKeys.add(blockKey(b.x, b.y, b.z));
  }
  const selfClosedDetection = detectSelfClosedCycles(blockMap, 4, brokenPatternKeys);
  const selfClosedCycleKeys = selfClosedDetection.keys;
  const graphContext = { ...context, blockMap, selfClosedCycleKeys };
  const roots = [...commands];
  const owner = new Map();
  const rootKeys = new Set(
    roots
      .filter((b) => b.blockType === 'command' || b.blockType === 'repeating')
      .map((b) => blockKey(b.x, b.y, b.z))
  );
  graphContext.rootKeys = rootKeys;
  // Detect canonical broken heads before tracing any roots. Their second
  // marker intentionally has a different facing. Only the command block that
  // marker actually points at is excluded; we do not blindly discard its
  // whole forward branch. The immediately previous command is an explicit
  // exception and must remain readable.
  const inspectBrokenHead = (root) =>
    identifyBrokenHeadGeometry(root, getExactFromMap, isBrokenHeadMarkerBlock);
  // Broken-chain heads must claim their marker blocks before an adjacent
  // standalone command can claim the same block as its own chain tail.
  const rootReachesSelfClosedCycle = (root) => {
    let current = root;
    const seen = new Set();
    for (let i = 0; i < blockMap.size && i < 10000; i++) {
      const p = getOffsetPosition(current, current.facing, 1);
      if (!p) return false;
      const next = blockMap.get(blockKey(p.x, p.y, p.z));
      if (!next || next.type !== 'chain') return false;
      const k = blockKey(next.x, next.y, next.z);
      if (selfClosedCycleKeys.has(k)) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      current = next;
    }
    return false;
  };
  // Sorting may invoke its comparator O(n log n) times. Cycle reachability can
  // walk an entire chain, so compute each root's metadata only once up front.
  const rootMeta = new Map();
  for (const root of roots) {
    const brokenPattern = inspectBrokenHead(root);
    const traceableRoot = root.blockType !== 'chain';
    rootMeta.set(root, {
      brokenPattern,
      broken: brokenPattern ? 0 : 1,
      reachesCycle: traceableRoot && rootReachesSelfClosedCycle(root) ? 0 : 1,
      rootType: root.blockType === 'command' || root.blockType === 'repeating' ? 0 : 1
    });
  }
  // If one broken head is physically downstream of another, process the
  // upstream head first so the complete multi-head chain claims both groups.
  const rootMetaByKey = new Map(roots.map((root) => [blockKey(root.x, root.y, root.z), rootMeta.get(root)]));
  const nestedBrokenRootKeys = new Set();
  for (const parent of roots) {
    const pattern = rootMeta.get(parent)?.brokenPattern;
    if (!pattern) continue;
    let current = pattern.blocks[pattern.blocks.length - 1] || parent;
    let direction = pattern.direction;
    const seen = new Set();
    for (let guard = 0; guard < blockMap.size && guard < 10000; guard++) {
      const next = getExactFromMap(current, direction, 1);
      if (!next) break;
      const nk = blockKey(next.x, next.y, next.z);
      if (seen.has(nk) || next === parent) break;
      seen.add(nk);
      const nested = rootMetaByKey.get(nk)?.brokenPattern;
      if (nested) {
        nestedBrokenRootKeys.add(nk);
        current = nested.blocks[nested.blocks.length - 1] || next;
        direction = nested.direction;
        continue;
      }
      if (next.type !== 'chain') break;
      current = next;
      direction = next.facing;
    }
  }
  roots.sort((a, b) => {
    const ma = rootMeta.get(a),
      mb = rootMeta.get(b);
    const nestedA = nestedBrokenRootKeys.has(blockKey(a.x, a.y, a.z)) ? 1 : 0;
    const nestedB = nestedBrokenRootKeys.has(blockKey(b.x, b.y, b.z)) ? 1 : 0;
    return (
      ma.broken - mb.broken ||
      nestedA - nestedB ||
      ma.reachesCycle - mb.reachesCycle ||
      ma.rootType - mb.rootType ||
      chainSort(a, b)
    );
  });
  // Broken-head recognition never deletes or blocks the command block that a
  // misoriented marker happens to point at. Physical nodes are resolved later
  // by normal chain ownership and the orphan-preservation pass.
  const chains = [];
  for (const root of roots) {
    if (root.blockType === 'chain' && !rootMeta.get(root)?.brokenPattern) continue;
    const k = blockKey(root.x, root.y, root.z);
    if (owner.has(k)) continue;
    const ordered = traceChain(root, graphContext, owner);
    if (!ordered.length) continue;
    let type = detectChainType(ordered);
    const brokenHeadKind = getBrokenHeadKind(ordered);
    const matchedBroken = !!ordered._brokenMatched;
    if (ordered._brokenCandidate && !matchedBroken)
      type = root.blockType === 'repeating' ? 'repeat' : 'impulse';
    else if (matchedBroken || brokenHeadKind) type = 'snake';
    if (type === 'snake')
      normalizeBrokenChainBlocks(ordered, {
        kind: ordered._brokenMatch,
        direction: ordered._brokenDirection,
        specialKeys: new Set(ordered._brokenSpecialKeys || []),
        facingMap: ordered._brokenFacingMap,
        applyCondition: false
      });
    const orderedKeys = new Set(ordered.map((b) => blockKey(b.x, b.y, b.z)));
    const closedCycles = selfClosedDetection.cycles.filter((cycle) =>
      cycle.every((key) => orderedKeys.has(key))
    );
    const selfClosed = closedCycles.length > 0;
    const selfClosedKeys = new Set(closedCycles.flat());
    if (selfClosed) {
      for (const b of ordered) b.selfClosedCycle = selfClosedKeys.has(blockKey(b.x, b.y, b.z));
    }
    if (selfClosedDetection.oversized.some((cycle) => cycle.some((key) => orderedKeys.has(key)))) {
      warn('检测到超过 4 个方块的闭环；该结构不属于受支持的自闭链，布局可能无法保持原样', '读取命令链');
    }
    chains.push({ type, blocks: ordered, rootKey: k, selfClosed, selfClosedCycleKeys: [...selfClosedKeys] });
  }
  const filtered = chains;
  const represented = new Set(filtered.flatMap((c) => (c.blocks || []).map((b) => blockKey(b.x, b.y, b.z))));
  // A self-closed chain can have no repeating/impulse root at all. Preserve such
  // supported 2–4 block cycles as physical loops instead of dropping them.
  for (const cycle of selfClosedDetection.cycles) {
    if (cycle.some((k) => represented.has(k))) continue;
    const cycleBlocks = cycle
      .map((k) => blockMap.get(k))
      .filter(Boolean)
      .map((b) => ({
        ...b,
        cmd: String(b.cmd ?? ''),
        blockType: b.blockType || b.type,
        selfClosedCycle: true
      }));
    if (cycleBlocks.length !== cycle.length) continue;
    filtered.push({
      type: 'repeat',
      selfClosed: true,
      selfClosedCycleKeys: cycle.slice(),
      preservePhysicalType: true,
      blocks: cycleBlocks
    });
    for (const k of cycle) represented.add(k);
  }
  // Never lose an unclaimed physical command block. This includes empty chain
  // blocks and non-empty orphan chain blocks whose orientation did not connect
  // to a recognized root. Preserve their original block type and facing.
  for (const b of blockMap.values()) {
    if (!b || !['command', 'repeating', 'chain'].includes(b.type || b.blockType)) continue;
    const k = blockKey(b.x, b.y, b.z);
    if (represented.has(k)) continue;
    const blockType = b.blockType || b.type;
    filtered.push({
      type: 'repeat',
      preservePhysicalType: true,
      blocks: [
        { ...b, cmd: String(b.cmd ?? ''), blockType, facing: Number.isInteger(b.facing) ? b.facing : 2 }
      ]
    });
    represented.add(k);
  }
  filtered.sort((a, b) => chainSort(a.blocks[0], b.blocks[0]));
  for (const c of filtered) delete c.rootKey;
  context.repeatingSplits = graphContext.repeatingSplits || 0;
  return filtered;
}
