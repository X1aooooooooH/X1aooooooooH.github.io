
self.onmessage = event => {
  const message = event.data || {};
  if (message.type !== 'replace') return;
  try {
    const pattern = String(message.pattern ?? '');
    if (!pattern) throw new Error('查找内容不能为空');
    if (pattern.length > 512) throw new Error('正则表达式最多允许 512 个字符');
    if (message.useRegex && /\([^)]*[+*][^)]*\)[+*{]|(?:\.\*){2,}|(?:\.\+){2,}/.test(pattern)) {
      throw new Error('检测到可能造成高复杂度回溯的正则结构，请改写表达式');
    }
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const source = message.useRegex ? pattern : escaped;
    const flags = 'g' + (message.caseSensitive ? '' : 'i');
    const expression = new RegExp(source, flags);
    const replacement = String(message.replacement ?? '');
    const changes = [];
    let matched = 0;
    for (const item of (Array.isArray(message.items) ? message.items : [])) {
      const value = String(item.value ?? '');
      expression.lastIndex = 0;
      const matches = value.match(expression);
      if (!matches || !matches.length) continue;
      matched += matches.length;
      expression.lastIndex = 0;
      const updated = value.replace(expression, replacement);
      if (updated !== value) changes.push({ index: item.index, value: updated, hits: matches.length });
    }
    self.postMessage({ type: 'result', changes, matched });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};

