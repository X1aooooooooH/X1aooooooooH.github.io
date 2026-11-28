import { app } from '../state.js?v=r51-ai-modules-20261129';
import { cloneChains } from '../core/model.js?v=r51-ai-modules-20261129';
import { reflowChainsForSize, ensureStructureSize } from '../core/layout.js?v=r51-ai-modules-20261129';
import { refreshChainsUI, pushHistory } from '../editor.js?v=r51-ai-modules-20261129';

function newChainUid() {
  return 'chain-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function parseActionBlock(text) {
  let content = String(text || '');
  const re = /```blockflow-actions\s*([\s\S]*?)```/gi;
  let last = null;
  let match;
  while ((match = re.exec(content)) !== null) last = match[1];
  content = content.replace(re, '').trim();
  if (!last) return { content, actions: [] };
  try {
    const data = JSON.parse(last.trim());
    const actions = Array.isArray(data && data.actions)
      ? data.actions
          .filter((a) => a && typeof a.label === 'string' && Array.isArray(a.ops))
          .slice(0, 8)
          .map((a) => {
            const description = String(a.description || '').trim();
            let label = String(a.label || '').trim();
            if (
              /^(修改|修复|更新|处理|调整)\s*(task|任务|链|操作|bug|问题)?\s*\d*$/i.test(label) &&
              description
            ) {
              label = description.length > 60 ? description.slice(0, 60) + '…' : description;
            }
            return { ...a, label, description };
          })
      : [];
    return { content, actions };
  } catch (err) {
    return { content, actions: [] };
  }
}

export function cloneChainsForAction() {
  return cloneChains(app.chains);
}

export function actionChain(next, number) {
  const index = Number(number) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= next.length) {
    throw new Error(`第 ${number} 条链不存在：当前只有 ${next.length} 条链。删除链后请重新读取结构再操作。`);
  }
  return { chain: next[index], index };
}

export function actionBlockType(type) {
  return ['command', 'chain', 'repeating'].includes(type) ? type : null;
}

export function makeActionBlocks(commands, type, blockTypes) {
  const list = Array.isArray(commands) ? commands.map((c) => String(c ?? '')) : [];
  if (!list.length) throw new Error('新建/替换链必须提供至少一条命令');
  return list.map((cmd, i) => {
    let blockType = Array.isArray(blockTypes) && blockTypes[i] ? actionBlockType(blockTypes[i]) : null;
    if (!blockType) {
      blockType = type === 'impulse' ? (i === 0 ? 'command' : 'chain') : i === 0 ? 'repeating' : 'chain';
    }
    return { cmd, cond: 0, auto: 1, facing: 2, blockType, marked: false, note: '' };
  });
}

export function executeActionOps(ops) {
  if (!Array.isArray(ops) || !ops.length) throw new Error('操作列表为空');
  const next = cloneChainsForAction();
  let summary = [];
  let selectedChain = Number.isInteger(app.selectedChain) ? app.selectedChain : -1;
  for (const rawOp of ops) {
    let op = rawOp;
    if (!op || typeof op !== 'object') throw new Error('无效操作');
    const chainOps = ['update_command', 'insert_commands', 'delete_blocks', 'replace_chain'];
    if (chainOps.includes(op.op)) {
      let n = op.chain;
      if (n === undefined || n === null || n === '') n = op.chainNumber ?? op.chainNo ?? op.targetChain;
      if (n === undefined || n === null || n === '') {
        if (selectedChain >= 0 && selectedChain < next.length) n = selectedChain + 1;
        else if (next.length === 1) n = 1;
      }
      op = { ...op, chain: n };
      if (op.block === undefined || op.block === null) op.block = op.blockIndex ?? op.index;
    }
    if (op.op === 'delete_blocks' && !Array.isArray(op.blocks) && op.from !== undefined) {
      const from = Number(op.from);
      const to = Number(op.to ?? op.from);
      if (Number.isInteger(from) && Number.isInteger(to) && to >= from) {
        op = { ...op, blocks: Array.from({ length: to - from + 1 }, (_, i) => from + i) };
      }
    }
    if (chainOps.includes(op.op) && (op.chain === undefined || op.chain === null || op.chain === '')) {
      throw new Error(`操作 ${op.op} 缺少链号，且当前无法确定目标链`);
    }
    if (op.op === 'replace') {
      const find = String(op.find ?? '');
      if (!find) throw new Error('replace 缺少 find');
      const scope = op.scope === 'chain' ? 'chain' : 'all';
      const chainNo = Number(op.chain) || 0;
      let re;
      try {
        if (op.regex) re = new RegExp(find, op.caseSensitive ? 'g' : 'gi');
        else re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), op.caseSensitive ? 'g' : 'gi');
      } catch (err) {
        throw new Error('replace 正则无效：' + err.message);
      }
      let count = 0;
      for (let ci = 0; ci < next.length; ci++) {
        if (scope === 'chain' && chainNo && ci !== chainNo - 1) continue;
        for (const block of next[ci].blocks || []) {
          const original = String(block.cmd || '');
          re.lastIndex = 0;
          if (!re.test(original)) continue;
          re.lastIndex = 0;
          block.cmd = original.replace(re, (...args) => {
            count++;
            return op.regex ? String(op.replace ?? '') : String(op.replace ?? '');
          });
        }
      }
      if (!count) throw new Error(`没有找到匹配 “${find}”`);
      summary.push(`替换 ${count} 处`);
    } else if (op.op === 'update_command') {
      const { chain } = actionChain(next, op.chain);
      const bi = Number(op.block);
      if (!Number.isInteger(bi) || bi < 0 || bi >= chain.blocks.length)
        throw new Error(`方块号越界：${op.block}`);
      const target = chain.blocks[bi];
      target.cmd = String(op.command ?? '');
      if (op.blockType !== undefined) {
        const type = actionBlockType(op.blockType);
        if (!type) throw new Error('非法 blockType');
        target.blockType = type;
      }
      if (op.cond !== undefined) target.cond = op.cond ? 1 : 0;
      if (op.auto !== undefined) target.auto = op.auto ? 1 : 0;
      summary.push(`更新链${op.chain}/块${bi}`);
    } else if (op.op === 'insert_commands') {
      const { chain } = actionChain(next, op.chain);
      const commands = Array.isArray(op.commands) ? op.commands : [];
      if (!commands.length) throw new Error('insert_commands 缺少 commands');
      const at = Number.isInteger(Number(op.at))
        ? Math.max(0, Math.min(chain.blocks.length, Number(op.at)))
        : chain.blocks.length;
      const blocks = makeActionBlocks(commands, chain.type || 'repeat', op.blockTypes);
      chain.blocks.splice(at, 0, ...blocks);
      summary.push(`链${op.chain}插入 ${blocks.length} 块`);
    } else if (op.op === 'delete_blocks') {
      const { chain } = actionChain(next, op.chain);
      const indexes = [...new Set((Array.isArray(op.blocks) ? op.blocks : []).map(Number))]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < chain.blocks.length)
        .sort((a, b) => b - a);
      if (!indexes.length)
        throw new Error(
          `delete_blocks 没有有效方块：目标链 ${op.chain} 当前有 ${chain.blocks.length} 个方块，请按最新结构重新生成操作`
        );
      for (const i of indexes) chain.blocks.splice(i, 1);
      summary.push(`链${op.chain}删除 ${indexes.length} 块`);
    } else if (op.op === 'create_chain') {
      const type = ['snake', 'repeat', 'impulse'].includes(op.type) ? op.type : 'repeat';
      const commands = Array.isArray(op.commands) ? op.commands : [];
      const blocks = makeActionBlocks(commands, type, op.blockTypes);
      let at = Number.isInteger(Number(op.at)) ? Number(op.at) : 0;
      if (!at) {
        at = app.mode === 'overview' || selectedChain < 0 ? next.length + 1 : selectedChain + 2;
      }
      at = Math.max(1, Math.min(next.length + 1, at));
      const newChain = { uid: newChainUid(), type, blocks };
      next.splice(at - 1, 0, newChain);
      selectedChain = at - 1;
      summary.push(`新建${type}链（第 ${at} 条，${blocks.length} 块）`);
    } else if (op.op === 'replace_chain') {
      const { chain, index } = actionChain(next, op.chain);
      const type = ['snake', 'repeat', 'impulse'].includes(op.type) ? op.type : chain.type || 'repeat';
      const commands = Array.isArray(op.commands) ? op.commands : [];
      chain.blocks = makeActionBlocks(commands, type, op.blockTypes);
      chain.type = type;
      selectedChain = index;
      summary.push(`替换链${op.chain}（${chain.blocks.length} 块）`);
    } else if (op.op === 'move_chain') {
      const from = Number(op.from) - 1;
      const to = Number(op.to) - 1;
      if (!Number.isInteger(from) || from < 0 || from >= next.length) throw new Error('move_chain from 越界');
      if (!Number.isInteger(to) || to < 0 || to >= next.length) throw new Error('move_chain to 越界');
      const [chain] = next.splice(from, 1);
      next.splice(to, 0, chain);
      selectedChain = to;
      summary.push(`移动链 ${op.from} → ${op.to}`);
    } else {
      throw new Error(`未知操作：${op.op}`);
    }
  }
  if (!next.length) throw new Error('操作后没有命令链');
  reflowChainsForSize(next);
  ensureStructureSize(next, 'AI 操作后结构');
  app.chains = next;
  app.mode = 'overview';
  app.selectedChain = Math.max(
    0,
    Math.min(selectedChain < 0 ? next.length - 1 : selectedChain, next.length - 1)
  );
  app.selectedBlock = -1;
  app.singleChain = next.length === 1;
  pushHistory();
  refreshChainsUI();
  return { count: summary.length, summary: summary.join('；'), selected: app.selectedChain };
}

export function captureActionState() {
  return {
    chains: cloneChainsForAction(),
    selectedChain: Number.isInteger(app.selectedChain) ? app.selectedChain : -1,
    selectedBlock: Number.isInteger(app.selectedBlock) ? app.selectedBlock : -1,
    mode: app.mode,
    singleChain: !!app.singleChain
  };
}
