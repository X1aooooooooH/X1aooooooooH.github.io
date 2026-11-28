import { app } from '../state.js?v=r51-ai-modules-20261129';
import { getBrokenHeadKind, isBrokenChainPlaceholder } from '../core/broken-chain.js?v=r51-ai-modules-20261129';
import { getTextEditChain } from '../ui/text-editor.js?v=r51-ai-modules-20261129';
import { CONTEXT_CHUNK } from './prompts.js?v=r51-ai-modules-20261129';
import { loadSkillRuntime, searchSkillIds } from './skill.js?v=r51-ai-modules-20261129';

function typeLabel(type) {
  return type === 'snake' ? '断链' : type === 'repeat' ? '循环链' : '脉冲链';
}

export function blockTypeLabel(type) {
  return type === 'repeating' ? '循环' : type === 'command' ? '脉冲' : '链式';
}

function pushLine(lines, text) {
  lines.push(text);
}

export function formatChain(ci, lines) {
  const chain = app.chains[ci];
  if (!chain) return;
  const blocks = Array.isArray(chain.blocks) ? chain.blocks : [];
  pushLine(lines, `\n## 链 ${ci + 1}：${typeLabel(chain.type)}（${blocks.length} 个命令方块）`);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i] || {};
    if (b.isAirPlaceholder) {
      pushLine(lines, `[${i}] （空气辅助占位）`);
      continue;
    }
    const flags = [];
    if (b.cond) flags.push('有条件');
    if (b.auto === 0) flags.push('红石触发');
    if (b.isAuxiliary) flags.push('辅助方块');
    const line = `[${i}] ${blockTypeLabel(b.blockType)}${flags.length ? ' / ' + flags.join(' / ') : ''} | ${String(b.cmd || '（空命令）')}`;
    pushLine(lines, line);
  }
}

export function buildContext(scope) {
  if (typeof app === 'undefined' || !app || !Array.isArray(app.chains) || !app.chains.length) {
    return null;
  }
  const lines = [];
  const totalCommandCount = app.chains.reduce((n, c) => n + (c.blocks ? c.blocks.length : 0), 0);
  let commandCount = totalCommandCount;
  pushLine(lines, `# BlockFlow 结构上下文`);
  pushLine(lines, `文件：${app.fileName || '未命名结构'}`);
  pushLine(lines, `链数量：${app.chains.length}；命令方块总数：${totalCommandCount}`);

  let ci = -1;
  if (scope === 'all') {
    pushLine(lines, `范围：全部链`);
    for (let i = 0; i < app.chains.length; i++) formatChain(i, lines);
  } else {
    if (scope === 'text') {
      const inlineChain = getTextEditChain();
      if (Number.isInteger(inlineChain) && inlineChain >= 0) ci = inlineChain;
    }
    if (ci < 0 && typeof app.selectedChain === 'number' && app.selectedChain >= 0) ci = app.selectedChain;
    if (ci < 0) ci = 0;
    if (ci >= app.chains.length) ci = 0;
    commandCount = app.chains[ci] && Array.isArray(app.chains[ci].blocks) ? app.chains[ci].blocks.length : 0;
    pushLine(lines, `范围：链 ${ci + 1}；该链命令方块数：${commandCount}`);
    if (scope === 'text') {
      const inline = typeof window !== 'undefined' ? window.getInlineEditState?.() : null;
      // Only inject the editor buffer when it contains unapplied edits; an idle panel
      // still holds the selected chain index and would otherwise duplicate stale text.
      const isOpen = inline && Number.isInteger(inline.chain) && inline.chain === ci && inline.dirty;
      if (isOpen) {
        pushLine(lines, `\n## 内联编辑器当前内容（每行一条命令，可能包含未应用的修改）`);
        const values = String(inline.text || '')
          .replace(/\r/g, '')
          .split('\n');
        const conditions = Array.isArray(inline.conditions) ? inline.conditions : [];
        for (let i = 0; i < values.length; i++) {
          const cond = conditions[i] ? ' [有条件]' : '';
          pushLine(lines, `第 ${i + 1} 行${cond} | ${values[i] || '（空命令）'}`);
        }
        pushLine(lines, `\n## 该链的当前结构信息`);
        formatChain(ci, lines);
      } else {
        formatChain(ci, lines);
      }
    } else {
      formatChain(ci, lines);
    }
  }
  return {
    text: lines.join('\n'),
    chainIndex: ci,
    chainCount: app.chains.length,
    commandCount,
    scope
  };
}

export function splitContextText(text, limit = CONTEXT_CHUNK) {
  const source = String(text || '');
  if (!source) return [''];
  if (source.length <= limit) return [source];
  const chunks = [];
  let current = '';
  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };
  for (const line of source.split('\n')) {
    if (line.length > limit) {
      pushCurrent();
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      continue;
    }
    if (current && current.length + line.length + 1 > limit) pushCurrent();
    current += (current ? '\n' : '') + line;
  }
  pushCurrent();
  return chunks.length ? chunks : [''];
}

function searchBrowserCommands(args) {
  const query = String(args.query ?? '').trim();
  if (!query) return '错误：search_commands 缺少 query。';
  const scope = ['all', 'chain', 'text'].includes(args.scope) ? args.scope : 'all';
  const chainFilter = Number(args.chain) || 0;
  const items = collectSkillCommands(chainFilter ? 'all' : scope);
  const limit = Math.max(1, Math.min(200, Number(args.limit) || 80));
  let test;
  try {
    if (args.regex) {
      test = new RegExp(query, args.caseSensitive ? 'g' : 'gi');
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      test = new RegExp(escaped, args.caseSensitive ? 'g' : 'gi');
    }
  } catch (err) {
    return '错误：正则表达式无效：' + err.message;
  }
  const rows = [];
  let total = 0;
  for (const item of items) {
    if (chainFilter && Number(item.chain) !== chainFilter) continue;
    test.lastIndex = 0;
    const count = [...String(item.cmd).matchAll(test)].length;
    if (!count) continue;
    total += count;
    if (rows.length < limit)
      rows.push(
        `- ${item.label}：${String(item.cmd).replace(/\s+/g, ' ')}${count > 1 ? `（${count} 次）` : ''}`
      );
  }
  if (!rows.length) return `未找到匹配 “${query}”。`;
  const more =
    total > rows.length
      ? `\n（共 ${total} 次匹配，只显示前 ${rows.length} 条；可加 limit 或缩小 scope）`
      : '';
  return `匹配 ${total} 次：\n${rows.join('\n')}${more}`;
}

async function sectionFromPrecheck(name, scope, cache = null) {
  let full = cache?.get(scope);
  if (!full) {
    full = await runSkillPrecheck(scope);
    cache?.set(scope, full);
  }
  const header = '## ' + name;
  const start = full.indexOf(header);
  if (start < 0) return full;
  const next = full.indexOf('\n## ', start + header.length);
  return full.slice(start, next < 0 ? undefined : next).trim();
}

export async function executeReadTool(name, args, scope, precheckCache = null) {
  if (['check_syntax', 'check_chain', 'inspect', 'verify'].includes(name)) {
    const map = {
      check_syntax: 'check --only syntax',
      check_chain: 'check --only chain',
      inspect: 'inspect',
      verify: 'verify'
    };
    return sectionFromPrecheck(
      map[name],
      ['all', 'chain', 'text'].includes(args.scope) ? args.scope : scope,
      precheckCache
    );
  }
  if (name === 'search_commands') return searchBrowserCommands(args);
  if (name === 'lookup_id') return await searchSkillIds(args.query || '');
  if (
    [
      'replace',
      'replace_commands',
      'update_command',
      'insert_commands',
      'delete_blocks',
      'create_chain',
      'replace_chain',
      'move_chain'
    ].includes(name)
  ) {
    return '错误：修改不能在工具块中直接执行。请使用回复末尾的 blockflow-actions 隐藏块生成按钮。';
  }
  return `错误：未知工具 ${name}。可用只读工具：search_commands、inspect、check_syntax、check_chain、verify、lookup_id。`;
}

export function collectSkillCommands(scope) {
  const out = [];
  if (typeof app === 'undefined' || !app || !Array.isArray(app.chains)) return out;
  const pushChain = (ci) => {
    const chain = app.chains[ci];
    if (!chain) return;
    (chain.blocks || []).forEach((b, bi) => {
      const cmd = String((b && b.cmd) || '').trim();
      if (cmd) out.push({ cmd, chain: ci + 1, block: bi, label: `链${ci + 1}/块${bi}` });
    });
  };
  if (scope === 'all') {
    for (let i = 0; i < app.chains.length; i++) pushChain(i);
  } else {
    let ci = -1;
    if (scope === 'text') {
      const inlineChain = getTextEditChain();
      if (Number.isInteger(inlineChain) && inlineChain >= 0) ci = inlineChain;
    }
    if (ci < 0 && typeof app.selectedChain === 'number' && app.selectedChain >= 0) ci = app.selectedChain;
    if (ci < 0 && app.chains.length === 1) ci = 0;
    if (scope === 'text') {
      const inline = typeof window !== 'undefined' ? window.getInlineEditState?.() : null;
      if (inline && Number.isInteger(inline.chain) && inline.chain === ci) {
        String(inline.text || '')
          .replace(/\r/g, '')
          .split('\n')
          .forEach((line, i) => {
            const cmd = String(line || '').trim();
            if (cmd) out.push({ cmd, chain: ci + 1, block: null, label: `文本第${i + 1}行` });
          });
        return out;
      }
    }
    if (ci >= 0) pushChain(ci);
  }
  return out;
}

function scopedChainIndexes(scope) {
  if (typeof app === 'undefined' || !app || !Array.isArray(app.chains) || !app.chains.length) return [];
  if (scope === 'all') return app.chains.map((_, i) => i);
  let ci = -1;
  if (scope === 'text') {
    const inlineChain = getTextEditChain();
    if (Number.isInteger(inlineChain) && inlineChain >= 0) ci = inlineChain;
  }
  if (ci < 0 && typeof app.selectedChain === 'number' && app.selectedChain >= 0) ci = app.selectedChain;
  if (ci < 0 && app.chains.length === 1) ci = 0;
  return ci >= 0 && ci < app.chains.length ? [ci] : [];
}

function skillStructureFor(indexes) {
  const structure = { blocks: new Map() };
  for (const ci of indexes) {
    const chain = app.chains[ci];
    ((chain && chain.blocks) || []).forEach((b, bi) => {
      structure.blocks.set(ci + ':' + bi, {
        type: b.blockType || 'chain',
        cmd: String(b.cmd || ''),
        cond: Number(b.cond) || 0
      });
    });
  }
  return structure;
}

export function formatToolItems(rows, fallback = '未发现问题。') {
  if (!rows.length) return [fallback];
  return rows.map((row) => {
    const where = row.where ? ` ${row.where}` : '';
    const code = row.code ? ` (${row.code})` : '';
    const cmd = row.cmd ? ` | ${String(row.cmd).replace(/\s+/g, ' ').slice(0, 240)}` : '';
    return `- [${row.severity || 'info'}]${where}${code} ${row.message || ''}${cmd}`;
  });
}

export function toolStatusSummary(precheck) {
  const text = String(precheck || '');
  if (!text.startsWith('# 已执行技能操作')) {
    return '工具状态：check / inspect / verify 未执行（技能运行时未加载；不要编造工具结果）。';
  }
  const verify = text.match(/## verify\n([^\n]+)/);
  const syntax = text.match(/## check --only syntax\n([^\n]+)/);
  const chain = text.match(/## check --only chain\n([^\n]+)/);
  return `工具状态（最高优先级）：已执行 check --only syntax、check --only chain、inspect、verify。${syntax ? '语法：' + syntax[1] + '；' : ''}${chain ? '链：' + chain[1] + '；' : ''}${verify ? verify[1] : ''} 不要声称“没有 shell/未执行”。`;
}

function fallbackSyntaxIssues(items) {
  const issues = [];
  for (const item of items) {
    const cmd = String(item.cmd || '').trim();
    if (!cmd) continue;
    if (!cmd.startsWith('/')) {
      issues.push({
        severity: 'info',
        code: 'no-slash',
        message: '命令没有前导 /（允许，但建议统一）',
        where: item.label,
        cmd
      });
    }
    if (/^\/?execute\b/i.test(cmd) && !/\brun\b/i.test(cmd)) {
      issues.push({
        severity: 'error',
        code: 'execute-without-run',
        message: 'execute 缺少 run',
        where: item.label,
        cmd
      });
    }
    if (/^\/?scoreboard\s+players\s+reset\b/i.test(cmd)) {
      issues.push({
        severity: 'warn',
        code: 'scoreboard-reset',
        message: '不推荐 scoreboard players reset，改用 objectives remove + add',
        where: item.label,
        cmd
      });
    }
    if (/^\/?setblock\b/i.test(cmd) && /(?:\s|,)(?:~|\^)/.test(cmd)) {
      issues.push({
        severity: 'info',
        code: 'relative-setblock',
        message: 'setblock 使用相对坐标；确认它是断链标记还是普通命令',
        where: item.label,
        cmd
      });
    }
    const braces = (cmd.match(/\{/g) || []).length;
    const closeBraces = (cmd.match(/\}/g) || []).length;
    if (braces !== closeBraces) {
      issues.push({
        severity: 'warn',
        code: 'json-braces',
        message: '花括号数量不平衡',
        where: item.label,
        cmd
      });
    }
  }
  return issues;
}

export async function runSkillPrecheck(scope) {
  const runtime = await loadSkillRuntime();
  const runtimeAvailable = !!(runtime && (runtime.syntax || runtime.rules));
  const items = collectSkillCommands(scope);
  const indexes = scopedChainIndexes(scope);
  const lines = [
    runtimeAvailable
      ? '# 已执行技能操作（浏览器内运行，不是 shell）'
      : '# 已执行技能操作（skill runtime 未加载，使用内置浏览器规则）'
  ];

  const syntaxIssues = [];
  if (runtime && runtime.syntax && typeof runtime.syntax.checkCommand === 'function') {
    for (const item of items) {
      try {
        for (const issue of runtime.syntax.checkCommand(item.cmd)) {
          syntaxIssues.push({
            severity: issue.severity || 'info',
            code: issue.code || '',
            message: issue.message || '',
            where: item.label,
            cmd: item.cmd
          });
        }
      } catch (err) {
        syntaxIssues.push({
          severity: 'warn',
          code: 'runtime',
          message: String((err && err.message) || err),
          where: item.label,
          cmd: item.cmd
        });
      }
    }
  } else {
    syntaxIssues.push(...fallbackSyntaxIssues(items));
  }
  lines.push('## check --only syntax');
  lines.push(`命令数：${items.length}；问题数：${syntaxIssues.length}`);
  lines.push(...formatToolItems(syntaxIssues));

  const styleIssues = [];
  if (runtime && runtime.rules && typeof runtime.rules.checkStyleCommands === 'function') {
    try {
      const findings = runtime.rules.checkStyleCommands(items.map((x) => x.cmd));
      for (const finding of findings) {
        const item = items[Number(finding.index) - 1] || null;
        styleIssues.push({
          severity: finding.severity || 'info',
          code: finding.code || '',
          message: finding.message || '',
          where: item ? item.label : '未知位置',
          cmd: finding.cmd || (item && item.cmd) || ''
        });
      }
    } catch (err) {
      styleIssues.push({
        severity: 'warn',
        code: 'runtime',
        message: String((err && err.message) || err),
        where: 'rules.js',
        cmd: ''
      });
    }
  }

  const chainIssues = [];
  for (const ci of indexes) {
    const chain = app.chains[ci] || { blocks: [] };
    const blocks = chain.blocks || [];
    const nonEmpty = blocks.filter((b) => String(b.cmd || '').trim());
    if (!nonEmpty.length) {
      chainIssues.push({
        severity: 'error',
        code: 'empty-chain',
        message: '链中没有非空命令',
        where: `链${ci + 1}`
      });
      continue;
    }
    const repeating = blocks.filter((b) => b.blockType === 'repeating').length;
    if (repeating > 1) {
      chainIssues.push({
        severity: 'error',
        code: 'multiple-repeating',
        message: `包含 ${repeating} 个循环方块，只允许 1 个`,
        where: `链${ci + 1}`
      });
    }
    const first = nonEmpty[0];
    if (chain.type === 'impulse' && first.blockType !== 'command') {
      chainIssues.push({
        severity: 'warn',
        code: 'impulse-head',
        message: `脉冲链头的方块类型是 ${first.blockType || '未知'}，应为 command`,
        where: `链${ci + 1} / 块${blocks.indexOf(first)}`,
        cmd: first.cmd
      });
    }
    if (chain.type === 'repeat' && first.blockType !== 'repeating') {
      chainIssues.push({
        severity: 'warn',
        code: 'repeat-head',
        message: `循环链头的方块类型是 ${first.blockType || '未知'}，应为 repeating`,
        where: `链${ci + 1} / 块${blocks.indexOf(first)}`,
        cmd: first.cmd
      });
    }
    if (chain.type === 'snake') {
      const headKind = typeof getBrokenHeadKind === 'function' ? getBrokenHeadKind(blocks) : '';
      const placeholder =
        typeof isBrokenChainPlaceholder === 'function' ? isBrokenChainPlaceholder(blocks) : false;
      if (!headKind && !placeholder) {
        chainIssues.push({
          severity: 'warn',
          code: 'snake-head',
          message: '断链链没有识别到断链头（setblock / execute 定位头）',
          where: `链${ci + 1}`
        });
      }
      const setblocks = blocks.filter((b) => /^\s*\/?setblock\b/i.test(String(b.cmd || '')));
      if (!setblocks.length && !placeholder) {
        chainIssues.push({
          severity: 'warn',
          code: 'snake-no-setblock',
          message: '断链链中没有 /setblock 标记',
          where: `链${ci + 1}`
        });
      }
    } else if (!['impulse', 'repeat', 'snake'].includes(chain.type)) {
      chainIssues.push({
        severity: 'warn',
        code: 'unknown-chain-type',
        message: `未知链类型 ${chain.type || '(空)'}`,
        where: `链${ci + 1}`
      });
    }
    for (const b of blocks) {
      if (b.blockType && !['command', 'chain', 'repeating'].includes(b.blockType)) {
        chainIssues.push({
          severity: 'warn',
          code: 'block-type',
          message: `非法方块类型 ${b.blockType}`,
          where: `链${ci + 1} / 块${blocks.indexOf(b)}`,
          cmd: b.cmd
        });
      }
    }
  }
  lines.push('## check --only chain');
  lines.push(
    indexes.length
      ? `链数：${indexes.length}；问题数：${chainIssues.length}`
      : '当前范围没有可检查的 .mcstructure 链（文本模式请只用语法/风格检查）。'
  );
  if (indexes.length) lines.push(...formatToolItems(chainIssues));

  const structure = indexes.length ? skillStructureFor(indexes) : null;
  const blockTypes = {};
  let duplicateCount = 0;
  const commandSeen = new Map();
  for (const item of items) {
    const key = item.cmd.replace(/\s+/g, ' ').trim();
    const count = (commandSeen.get(key) || 0) + 1;
    commandSeen.set(key, count);
    if (count === 2) duplicateCount++;
  }
  for (const ci of indexes) {
    for (const block of app.chains[ci].blocks || []) {
      const type = block.blockType || 'chain';
      blockTypes[type] = (blockTypes[type] || 0) + 1;
    }
  }
  lines.push('## inspect');
  lines.push(
    `范围：${scope === 'all' ? '全部结构' : scope === 'text' ? '文本模式当前链' : '当前选中链'}；链 ${indexes.length} 条；非空命令 ${items.length} 条。`
  );
  for (const ci of indexes) {
    const chain = app.chains[ci];
    const blocks = chain.blocks || [];
    const head = blocks.find((b) => String(b.cmd || '').trim());
    const headText = head ? String(head.cmd).replace(/\s+/g, ' ').slice(0, 180) : '(空)';
    const repeats = blocks.filter((b) => b.blockType === 'repeating').length;
    lines.push(
      `- 链${ci + 1}：type=${chain.type || '?'}，块=${blocks.length}，循环块=${repeats}，头=${headText}`
    );
  }
  if (indexes.length) {
    let declared = [];
    let used = [];
    try {
      if (runtime && runtime.rules && runtime.rules.declaredObjectives)
        declared = [...runtime.rules.declaredObjectives(structure)];
      if (runtime && runtime.rules && runtime.rules.usedObjectives) {
        const set = new Set();
        for (const item of items) for (const name of runtime.rules.usedObjectives(item.cmd)) set.add(name);
        used = [...set];
      }
    } catch {}
    lines.push(
      `命令块类型：${
        Object.entries(blockTypes)
          .map(([k, v]) => `${k}=${v}`)
          .join('，') || '无'
      }。`
    );
    if (declared.length) lines.push(`声明 objectives：${declared.join('，')}`);
    if (used.length) lines.push(`使用 objectives：${used.join('，')}`);
    if (duplicateCount) lines.push(`重复命令：${duplicateCount} 组`);
  }

  const errorCount = [...syntaxIssues, ...chainIssues, ...styleIssues].filter(
    (x) => x.severity === 'error'
  ).length;
  const warnCount = [...syntaxIssues, ...chainIssues, ...styleIssues].filter(
    (x) => x.severity === 'warn'
  ).length;
  lines.push('## verify');
  lines.push(
    errorCount
      ? `FAIL：${errorCount} 个 error，${warnCount} 个 warn。`
      : `PASS：0 个 error，${warnCount} 个 warn。`
  );
  lines.push('以上工具结果由页面内的 skill JS 实际执行；可以直接据此回答，不要声称“没有 shell，未执行”。');
  return lines.join('\n');
}
