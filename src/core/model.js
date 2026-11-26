// Canonical in-memory shape for chains and blocks.
// Every edit pipeline clones through these helpers so fields cannot drift apart.
export function cloneBlock(block) {
  return { ...block };
}

export function cloneChain(chain) {
  return {
    uid: chain?.uid || '',
    name: chain?.name || '',
    type: chain?.type,
    selfClosed: !!chain?.selfClosed,
    preservePhysicalType: !!chain?.preservePhysicalType,
    selfClosedCycleKeys: Array.isArray(chain?.selfClosedCycleKeys) ? chain.selfClosedCycleKeys.slice() : [],
    blocks: (chain?.blocks || []).map(cloneBlock)
  };
}

export function cloneChains(chains) {
  return (Array.isArray(chains) ? chains : []).map(cloneChain);
}

export function snapshotBlock(block) {
  return {
    x: block?.x, y: block?.y, z: block?.z,
    cmd: block?.cmd,
    cond: block?.cond ? 1 : 0,
    auto: block?.auto !== 0 && block?.auto !== undefined ? 1 : 0,
    facing: block?.facing,
    blockType: block?.blockType,
    isAuxiliary: !!block?.isAuxiliary,
    isBrokenNormalized: !!block?.isBrokenNormalized,
    isAirPlaceholder: !!block?.isAirPlaceholder,
    brokenWrongFacing: !!block?.brokenWrongFacing,
    selfClosedCycle: !!block?.selfClosedCycle,
    marked: !!block?.marked,
    note: block?.note || ''
  };
}

export function snapshotChains(chains) {
  return (Array.isArray(chains) ? chains : []).map(chain => ({
    uid: chain.uid || '',
    name: chain.name || '',
    type: chain.type,
    selfClosed: !!chain.selfClosed,
    preservePhysicalType: !!chain.preservePhysicalType,
    selfClosedCycleKeys: Array.isArray(chain.selfClosedCycleKeys) ? chain.selfClosedCycleKeys.slice() : [],
    blocks: (chain.blocks || []).map(snapshotBlock)
  }));
}

export function chainBounds(chain, unit = false) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const block of chain?.blocks || []) {
    const x = Number(block.x), y = Number(block.y), z = Number(block.z);
    const extra = unit ? 1 : 0;
    if (x < minX) minX = x;
    if (x + extra > maxX) maxX = x + extra;
    if (y < minY) minY = y;
    if (y + extra > maxY) maxY = y + extra;
    if (z < minZ) minZ = z;
    if (z + extra > maxZ) maxZ = z + extra;
  }
  if (minX === Infinity) return null;
  return { minX, maxX, minY, maxY, minZ, maxZ, X: maxX - minX, Y: maxY - minY, Z: maxZ - minZ };
}

export function countPhysicalBlocks(chains) {
  let total = 0;
  for (const chain of chains || []) total += (chain.blocks || []).filter(block => !block.isAirPlaceholder).length;
  return total;
}

