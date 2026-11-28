// Measures the rendered height of each logical line and caches it by text.
// The cache key includes width and font metrics, so resize/font-load invalidates it.
export function createLineMetrics() {
  let cache = new Map();
  let signature = '';
  const measure = (lineNodes, lines, container) => {
    if (!container || !container.clientWidth) return lines.map(() => 0);
    const style = getComputedStyle(container);
    const nextSignature = [
      container.clientWidth,
      style.fontFamily,
      style.fontSize,
      style.lineHeight,
      style.whiteSpace,
      style.overflowWrap,
      style.wordBreak,
      style.tabSize,
      document.fonts?.status || ''
    ].join('|');
    if (nextSignature !== signature) {
      cache.clear();
      signature = nextSignature;
    }
    const heights = new Array(lines.length);
    const dirty = [];
    for (let index = 0; index < lines.length; index++) {
      const text = lines[index];
      if (cache.has(text)) heights[index] = cache.get(text);
      else dirty.push(index);
    }
    // Read all dirty heights before writing any style, avoiding one layout per line.
    const measured = dirty.map((index) => Math.max(1, lineNodes[index]?.getBoundingClientRect().height || 0));
    for (let index = 0; index < dirty.length; index++) {
      const lineIndex = dirty[index];
      const height = measured[index];
      heights[lineIndex] = height;
      if (lines[lineIndex].length <= 2000) cache.set(lines[lineIndex], height);
    }
    if (cache.size > 4000) cache.clear();
    return heights;
  };
  measure.invalidate = () => {
    cache.clear();
    signature = '';
  };
  return measure;
}
