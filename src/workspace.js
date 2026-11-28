import { createLineMetrics } from './ui/line-metrics.js';
import { icon } from './ui/icons.js';
import { TYPE_LABEL } from './core/constants.js';

const $ = (selector, root = document) => root.querySelector(selector);
const inlineMetrics = createLineMetrics();
let inlineLayoutLines = [];
let inlineLayoutHeights = [];
let inlineContentHeight = 0;
let inlineLayoutToken = 0;

function chainEmpty(chain) {
  return (chain?.blocks || []).filter(block => !String(block.cmd ?? '').trim()).length;
}

function renderSidebar() {
  const app = window.app;
  const list = $('#wsChainList');
  if (!app?.chains || !list) return;
  const count = app.chains.length;
  const current = app.chains[app.selectedChain];
  const currentLabel = current ? '当前：' + (current.name || '链 ' + (app.selectedChain + 1)) : '当前：未选择';
  const countNode = $('#wsChainCount');
  if (countNode) countNode.textContent = count + ' 条';
  const items = app.chains.map((chain, index) => ({ chain, index }));
  const modalCount = $('#wsChainModalCount');
  if (modalCount) modalCount.textContent = count + ' 条';
  const modalSelected = $('#wsChainModalSelected');
  if (modalSelected) modalSelected.textContent = currentLabel;
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'ws-empty';
    empty.textContent = '还没有命令链';
    list.appendChild(empty);
    return;
  }
  for (const { chain, index } of items) {
    const row = document.createElement('div');
    row.className = 'ws-chain-row' + (index === app.selectedChain ? ' on' : '');
    row.dataset.index = String(index);
    row.tabIndex = 0;
    row.setAttribute('aria-current', index === app.selectedChain ? 'true' : 'false');
    const indexBadge = document.createElement('span');
    indexBadge.className = 'ws-chain-index';
    indexBadge.textContent = String(index + 1).padStart(2, '0');
    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'ws-chain-drag';
    dragHandle.innerHTML = icon('grip', 'icon icon-sm');
    dragHandle.title = '拖动排序';
    dragHandle.setAttribute('aria-label', '拖动排序');
    dragHandle.draggable = true;
    const copy = document.createElement('span');
    copy.className = 'ws-chain-copy';
    const titleLine = document.createElement('span');
    titleLine.className = 'ws-chain-title-line';
    const blocks = chain.blocks || [];
    const firstBlock = blocks[0] || {};
    const isIndependentEmpty = !!chain.preservePhysicalType && !chain.selfClosed && blocks.length === 1 &&
      (firstBlock.blockType === 'chain' || firstBlock.type === 'chain') && String(firstBlock.cmd ?? '').trim() === '';
    const title = document.createElement('b');
    title.textContent = chain.name || (isIndependentEmpty ? '独立空命令方块' : (chain.selfClosed ? '自闭链' : '链 ' + (index + 1)));
    titleLine.appendChild(title);
    if (index === app.selectedChain) {
      const active = document.createElement('em');
      active.className = 'ws-chain-current';
      active.textContent = '当前';
      titleLine.appendChild(active);
    }
    const meta = document.createElement('small');
    const empty = chainEmpty(chain);
    meta.textContent = isIndependentEmpty
      ? '1 个空命令方块 · 朝向 ' + (Number.isInteger(firstBlock.facing) ? firstBlock.facing : '未知')
      : blocks.length + ' 块' + (empty ? ' · ' + empty + ' 空' : '');
    const preview = document.createElement('em');
    preview.className = 'ws-chain-preview';
    preview.textContent = isIndependentEmpty ? '（空命令 · 物理节点已保留）' : (firstBlock.cmd || '（无命令）');
    copy.append(titleLine, meta, preview);
    const duplicate = document.createElement('button');
    duplicate.type = 'button';
    duplicate.className = 'ws-chain-duplicate';
    duplicate.title = '复制链';
    duplicate.setAttribute('aria-label', '复制链 ' + (index + 1));
    duplicate.innerHTML = icon('copy');
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'ws-chain-rename';
    rename.title = '重命名链';
    rename.setAttribute('aria-label', '重命名链');
    rename.innerHTML = icon('pencil');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ws-chain-del';
    del.title = '删除链 ' + (index + 1);
    del.setAttribute('aria-label', '删除链 ' + (index + 1));
    del.innerHTML = icon('close');
    const actions = document.createElement('div');
    actions.className = 'ws-chain-actions';
    actions.append(duplicate, rename, del);
    row.append(dragHandle, indexBadge, copy, actions);
    list.appendChild(row);
  }
}
function sidebarRowIndex(target) {
  const row = target?.closest?.('.ws-chain-row');
  return row ? Number(row.dataset.index) : -1;
}

async function renameChainFromSidebar(index, anchor) {
  const app = window.app;
  const chain = app?.chains?.[index];
  if (!chain) return;
  const value = await window.showInputPopover?.({
    anchor,
    title: '重命名链',
    value: chain.name || `链 ${index + 1}`,
    label: '链名称',
    confirmText: '保存',
    cancelText: '取消'
  });
  if (value === false) return;
  chain.name = String(value || '').trim().slice(0, 40);
  window.pushHistory?.();
  renderSidebar();
  window.logInfo?.(`链 ${index + 1} 重命名为「${chain.name || `链 ${index + 1}`}」`, '重命名链');
}

function bindSidebarEvents() {
  const list = $('#wsChainList');
  if (!list || list.dataset.eventsBound === '1') return;
  list.dataset.eventsBound = '1';
  list.addEventListener('click', event => {
    const index = sidebarRowIndex(event.target);
    if (index < 0) return;
    if (event.target.closest('.ws-chain-rename')) {
      event.stopPropagation();
      renameChainFromSidebar(index, event.target.closest('.ws-chain-rename'));
      return;
    }
    if (event.target.closest('.ws-chain-duplicate')) {
      event.stopPropagation();
      window.duplicateChainAt?.(index);
      return;
    }
    if (event.target.closest('.ws-chain-del')) {
      event.stopPropagation();
      window.deleteChainAt?.(index);
      return;
    }
    selectChain(index);
    const modal = document.getElementById('wsChainModal');
    if (modal) {
      modal.classList.remove('on');
      modal.setAttribute('aria-hidden', 'true');
    }
  });
  list.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const index = sidebarRowIndex(event.target);
    if (index < 0) return;
    event.preventDefault();
    selectChain(index);
    const modal = document.getElementById('wsChainModal');
    if (modal) {
      modal.classList.remove('on');
      modal.setAttribute('aria-hidden', 'true');
    }
  });
  list.addEventListener('dragstart', event => {
    const handle = event.target.closest('.ws-chain-drag');
    if (!handle) return;
    const row = handle.closest('.ws-chain-row');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', row.dataset.index);
    row.classList.add('dragging');
  });
  list.addEventListener('dragend', event => {
    event.target.closest('.ws-chain-row')?.classList.remove('dragging');
    list.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target'));
  });
  list.addEventListener('dragover', event => {
    const row = event.target.closest('.ws-chain-row');
    if (!row) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    row.classList.add('drop-target');
  });
  list.addEventListener('dragleave', event => {
    event.target.closest('.ws-chain-row')?.classList.remove('drop-target');
  });
  list.addEventListener('drop', event => {
    const row = event.target.closest('.ws-chain-row');
    if (!row) return;
    event.preventDefault();
    row.classList.remove('drop-target');
    const from = Number(event.dataTransfer.getData('text/plain'));
    const to = Number(row.dataset.index);
    if (Number.isInteger(from) && Number.isInteger(to) && from !== to) window.reorderChains?.(from, to);
  });
}

let sidebarRaf = 0;
function scheduleSidebarRender() {
  if (sidebarRaf) return;
  sidebarRaf = requestAnimationFrame(() => {
    sidebarRaf = 0;
    renderSidebar();
  });
}

function selectChain(index) {
  if (!Number.isInteger(index) || index < 0) return;
  // Single source of truth for entering a chain lives in editor.js; the
  // sidebar only asks it to focus the chain and then reveals the first block.
  if (typeof window.focusChain === 'function') window.focusChain(index);
  else if (window.app) {
    window.app.selectedChain = index;
    window.app.selectedBlock = -1;
    window.updateChainBar?.();
  }
  const chain = window.app?.chains?.[index];
  const first = (chain?.blocks || []).findIndex(block => String(block.cmd ?? '').trim() !== '');
  if (first >= 0) setTimeout(() => window.selectBlock?.({ chain: index, index: first }), 90);
  setTimeout(renderSidebar, 0);
}


let previewRaf = 0;
let previewMinimized = false;

function updateSidePreviewToggle() {
  const button = document.getElementById('wsSidePreviewToggle');
  if (!button) return;
  button.innerHTML = icon(previewMinimized ? 'expand' : 'minimize');
  button.title = previewMinimized ? '展开侧视预览' : '最小化侧视预览';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-expanded', String(!previewMinimized));
}

function setSidePreviewVisible(show) {
  const panel = document.getElementById('wsSidePreview');
  const stage = document.querySelector('#editorView .ws-stage');
  if (!panel) return;
  panel.classList.toggle('on', !!show);
  panel.classList.toggle('is-minimized', !!show && previewMinimized);
  panel.setAttribute('aria-hidden', String(!show));
  stage?.classList.toggle('preview-on', !!show && !previewMinimized);
  updateSidePreviewToggle();
  if (!show) previewRaf = 0;
}

function hideSidePreview() {
  previewMinimized = false;
  setSidePreviewVisible(false);
}
function updateSidePreview(detail) {
  const app = window.app;
  const chain = app?.chains?.[detail?.chain];
  const block = chain?.blocks?.[detail?.block];
  if (!app || !detail || !chain || !block) {
    hideSidePreview();
    return;
  }
  const panel = document.getElementById('wsSidePreview');
  if (!panel) return;
  const type = TYPE_LABEL[block.blockType] || block.blockType || '命令方块';
  panel.setAttribute('aria-label', '当前链侧视图，正在编辑 #' + detail.block + ' ' + type);
  setSidePreviewVisible(true);
  scheduleSidePreview();
}
function scheduleSidePreview() {
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    drawSidePreview();
  });
}

function drawSidePreview() {
  const panel = document.getElementById('wsSidePreview');
  const canvas = document.getElementById('wsSidePreviewCanvas');
  const focus = document.getElementById('wsSidePreviewFocus');
  const app = window.app;
  if (!panel || !canvas || !panel.classList.contains('on') || previewMinimized || !app) return;
  const chain = app.chains?.[app.selectedChain];
  const blocks = chain?.blocks || [];
  const selected = app.selectedBlock;
  if (!chain || !blocks.length || selected < 0 || selected >= blocks.length) {
    hideSidePreview();
    return;
  }
  if (focus) focus.style.display = 'none';
  const width = canvas.clientWidth;
  const height = canvas.clientHeight || 82;
  if (!width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#8ea2ff';

  // True side view: horizontal Z, vertical Y, looking along X.
  // Each X depth layer is fanned out slightly so stacked blocks remain readable.
  const xs = Array.from(new Set(blocks.map(block => Number(block.x) || 0))).sort((a, b) => a - b);
  const xRank = new Map(xs.map((x, index) => [x, index]));
  const layerStep = xs.length > 1 ? Math.min(2.2, 16 / (xs.length - 1)) : 0;
  const layerCenter = (xs.length - 1) / 2;
  const maxLayerOffset = layerStep * layerCenter;
  const cells = new Map();
  blocks.forEach((block, index) => {
    const x = Number(block.x) || 0;
    const y = Number(block.y) || 0;
    const z = Number(block.z) || 0;
    const key = x + '|' + z + '|' + y;
    const existing = cells.get(key);
    if (!existing || index === selected || (!existing.selected && index > existing.index)) {
      cells.set(key, {
        block, index, x, y, z,
        rank: xRank.get(x) || 0,
        selected: index === selected
      });
    }
  });
  const list = Array.from(cells.values());
  if (!list.length) return;
  const minZ = Math.min(...list.map(cell => cell.z));
  const maxZ = Math.max(...list.map(cell => cell.z));
  const minY = Math.min(...list.map(cell => cell.y));
  const maxY = Math.max(...list.map(cell => cell.y));
  const spanZ = Math.max(1, maxZ - minZ + 1);
  const spanY = Math.max(1, maxY - minY + 1);
  const padding = 5 + maxLayerOffset;
  const tile = Math.min(52, (width - padding * 2) / spanZ, (height - padding * 2) / spanY);
  const gridW = tile * spanZ;
  const gridH = tile * spanY;
  const originX = (width - gridW) / 2;
  const originY = (height - gridH) / 2;
  const colors = { command: '#f59e0b', chain: '#10b981', repeating: '#8b5cf6' };
  const selectedCell = list.find(cell => cell.selected);
  const selectedRank = selectedCell?.rank ?? 0;
  const ordered = list
    .filter(cell => !cell.selected && cell.rank !== selectedRank)
    .sort((a, b) => (a.rank - b.rank) || (a.z + a.y) - (b.z + b.y))
    .concat(list
      .filter(cell => !cell.selected && cell.rank === selectedRank)
      .sort((a, b) => (a.z + a.y) - (b.z + b.y)));
  if (selectedCell) ordered.push(selectedCell);
  ctx.imageSmoothingEnabled = false;
  for (const cell of ordered) {
    const layerOffset = (cell.rank - layerCenter) * layerStep;
    const sx = width - (originX + (cell.z - minZ) * tile + layerOffset) - tile;
    const sy = originY + (maxY - cell.y) * tile;
    const drawSize = Math.max(1, tile);
    ctx.globalAlpha = cell.rank === selectedRank ? 1 : 0.4;
    if (cell.block.isAirPlaceholder) {
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(127,140,160,.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(1, drawSize - 1), Math.max(1, drawSize - 1));
      ctx.restore();
    } else {
      ctx.fillStyle = colors[cell.block.blockType] || colors.chain;
      ctx.fillRect(sx, sy, drawSize, drawSize);
      ctx.strokeStyle = 'rgba(127,140,160,.42)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(1, drawSize - 1), Math.max(1, drawSize - 1));
    }
    if (cell.selected) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent;
      ctx.lineWidth = drawSize > 5 ? 2 : 1.5;
      ctx.strokeRect(sx + 1, sy + 1, Math.max(1, drawSize - 2), Math.max(1, drawSize - 2));
      if (focus) {
        focus.style.display = 'block';
        focus.style.left = sx + 'px';
        focus.style.top = sy + 'px';
        focus.style.width = drawSize + 'px';
        focus.style.height = drawSize + 'px';
      }
    }
  }
  ctx.globalAlpha = 1;
}
function buildSidePreview(stage) {
  if (!stage || document.getElementById('wsSidePreview')) return;
  const panel = document.createElement('aside');
  panel.id = 'wsSidePreview';
  panel.className = 'ws-side-preview';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('aria-label', '当前命令方块侧视预览');
  panel.innerHTML = '<div class="ws-side-preview-canvas-wrap"><canvas id="wsSidePreviewCanvas" class="ws-side-preview-canvas" aria-hidden="true"></canvas><span id="wsSidePreviewFocus" class="ws-side-preview-focus" aria-hidden="true"></span></div><button id="wsSidePreviewToggle" class="ws-side-preview-toggle" type="button"></button>';
  const toggle = panel.querySelector('#wsSidePreviewToggle');
  toggle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    previewMinimized = !previewMinimized;
    setSidePreviewVisible(true);
    if (!previewMinimized) scheduleSidePreview();
  });
  stage.append(panel);
  window.addEventListener('blockflow:block-edit', event => updateSidePreview(event.detail));
  document.getElementById('infoCmd')?.addEventListener('input', () => {
    const app = window.app;
    if (app?.mode === 'chain' && app.selectedBlock >= 0) {
      updateSidePreview({ chain: app.selectedChain, block: app.selectedBlock });
    }
  });
  window.addEventListener('resize', scheduleSidePreview);
  new MutationObserver(scheduleSidePreview).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const inspector = document.getElementById('inspector');
  if (inspector) {
    new MutationObserver(() => {
      if (inspector.classList.contains('open')) {
        const current = window.app;
        if (current?.selectedBlock >= 0) {
          updateSidePreview({ chain: current.selectedChain, block: current.selectedBlock });
        }
      } else {
        hideSidePreview();
      }
    }).observe(inspector, { attributes: true, attributeFilter: ['class'] });
  }
  const app = window.app;
  if (app?.selectedBlock >= 0) {
    updateSidePreview({ chain: app.selectedChain, block: app.selectedBlock });
  }
}

function buildFrame() {
  const shell = $('#editorView .editor-shell');
  if (!shell || shell.querySelector('.ws-stage')) return;
  const header = $('.command-bar');
  const canvas = $('#canvasWrap');
  const sidebar = $('#wsSidebar');
  const inspector = $('#inspector');
  const searchResults = $('#searchResults');
  const searchDock = $('.search-dock');
  const viewGrid = $('.top-view-grid');
  const exitBtn = $('#exitChainBtn');
  const replaceBtn = $('#replaceBtn');
  const usageBtn = $('#usageHelpBtn');
  if (!header || !canvas || !sidebar || !inspector) return;

  // Top bar: exit file, file identity, counts; theme/log/help/export on the right.
  const back = $('#backBtn');
  if (back) {
    back.classList.remove('bar-brand');
    back.classList.add('ws-exit-btn');
    back.innerHTML = icon('arrow-left');
    back.title = '退出当前文件';
    back.setAttribute('aria-label', '退出当前文件');
  }
  const actions = $('.bar-actions');
  if (usageBtn) {
    usageBtn.classList.add('ws-top-utility');
    usageBtn.innerHTML = icon('help');
    usageBtn.title = '使用说明';
    usageBtn.setAttribute('aria-label', '使用说明');
    const saveBtn = $('#saveBtn');
    if (saveBtn) actions.insertBefore(usageBtn, saveBtn);
    else actions.append(usageBtn);
  }
  // The theme module owns the sun/moon glyph so workspace setup won't reset it.
  const themeBtn = $('#themeBtn');
  const diagnoseBtn = $('#diagnoseBtn');
  if (diagnoseBtn) {
    diagnoseBtn.innerHTML = icon('log');
    diagnoseBtn.title = '运行日志';
    diagnoseBtn.setAttribute('aria-label', '运行日志');
  }
  if (themeBtn && diagnoseBtn) actions.insertBefore(themeBtn, diagnoseBtn);
  const save = $('#saveBtn');
  if (save) {
    save.innerHTML = icon('export');
    save.title = '导出结构';
    save.setAttribute('aria-label', '导出结构');
    const exportMenu = document.createElement('div');
    exportMenu.id = 'wsExportMenu';
    exportMenu.className = 'ws-export-menu';
    exportMenu.innerHTML = `<button type="button" data-export-target="exportNewBtn">新版格式</button><button type="button" data-export-target="exportOldBtn">旧版格式</button><button type="button" data-export-target="exportNetEaseBtn">网易版格式</button><button type="button" data-export-target="exportBothBtn">全部格式</button>`;
    header.append(exportMenu);
    save.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      exportMenu.classList.toggle('on');
    };
    exportMenu.addEventListener('click', event => {
      const button = event.target.closest('[data-export-target]');
      if (!button) return;
      exportMenu.classList.remove('on');
      document.getElementById(button.dataset.exportTarget)?.click();
    });
    document.addEventListener('click', event => {
      if (event.target === save || save.contains(event.target) || exportMenu.contains(event.target)) return;
      exportMenu.classList.remove('on');
    });
  }
  // 3D stage, its view controls, back button and the block popup.
  const stage = document.createElement('div');
  stage.className = 'ws-stage';
  shell.insertBefore(stage, canvas);
  stage.appendChild(canvas);
  const stageTools = document.createElement('div');
  stageTools.className = 'ws-stage-tools';
  stage.prepend(stageTools);
  if (exitBtn) {
    exitBtn.remove();
    exitBtn.classList.remove('top-home-btn');
    exitBtn.classList.add('ws-back-btn');
    exitBtn.innerHTML = icon('home');
    exitBtn.title = '返回主视图';
    exitBtn.setAttribute('aria-label', '返回主视图');
    stageTools.append(exitBtn);
  }
  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');
  if (undoBtn) {
    undoBtn.innerHTML = icon('undo');
    undoBtn.title = '上一步';
    undoBtn.setAttribute('aria-label', '上一步');
    actions.prepend(undoBtn);
  }
  if (redoBtn) {
    redoBtn.innerHTML = icon('redo');
    redoBtn.title = '下一步';
    redoBtn.setAttribute('aria-label', '下一步');
    actions.insertBefore(redoBtn, undoBtn?.nextSibling || null);
  }
  if (viewGrid) {
    viewGrid.remove();
    const viewSymbols = { front: 'view-front', side: 'view-side', top: 'view-top' };
    const viewLabels = { front: '正视图', side: '侧视图', top: '俯视图' };
    viewGrid.querySelectorAll('.view-btn').forEach(button => {
      const preset = button.dataset.preset;
      if (!preset) return;
      button.innerHTML = icon(viewSymbols[preset] || 'view-side');
      button.title = viewLabels[preset] || button.title;
      button.setAttribute('aria-label', viewLabels[preset] || '视图');
    });
    stageTools.append(viewGrid);
  }
  stage.append(inspector);
  inspector.classList.add('ws-block-popup');
  buildSidePreview(stage);
  const inspectorHead = inspector.querySelector('.inspector-head');
  const inspectorActions = document.createElement('div');
  inspectorActions.className = 'ws-inspector-actions';
  const markBtn = $('#infoMark');
  const insertBtn = $('#infoInsAfter');
  const deleteBtn = $('#infoDel');
  if (markBtn) {
    markBtn.innerHTML = icon('block-mark');
    markBtn.title = '标记';
    markBtn.setAttribute('aria-label', '标记');
    inspectorActions.append(markBtn);
  }
  if (insertBtn) {
    insertBtn.innerHTML = icon('block-insert');
    insertBtn.title = '后插命令方块';
    insertBtn.setAttribute('aria-label', '后插命令方块');
    inspectorActions.append(insertBtn);
  }
  if (deleteBtn) {
    deleteBtn.innerHTML = icon('block-delete');
    deleteBtn.title = '删除这个命令方块';
    deleteBtn.setAttribute('aria-label', '删除这个命令方块');
    inspectorActions.append(deleteBtn);
  }
  const aiBlockBtn = document.createElement('button');
  aiBlockBtn.id = 'infoAi';
  aiBlockBtn.type = 'button';
  aiBlockBtn.className = 'ws-symbol-btn';
  aiBlockBtn.innerHTML = icon('block-ai');
  aiBlockBtn.title = '问 AI 这个命令方块';
  aiBlockBtn.setAttribute('aria-label', '问 AI 这个命令方块');
  aiBlockBtn.addEventListener('click', () => {
    const app = window.app;
    if (!app) return;
    window.BlockFlowAI?.openBlock?.(app.selectedChain, app.selectedBlock);
  });
  inspectorActions.append(aiBlockBtn);
  if (inspectorHead) {
    const close = $('#infoClose');
    inspectorHead.insertBefore(inspectorActions, close || null);
  }

  // Lower control frame: search/replace/AI + collapsible chain manager.
  const deck = document.createElement('div');
  deck.className = 'ws-deck';
  const lower = document.createElement('div');
  lower.className = 'ws-lower-tools';
  deck.append(lower);
  const seekBtn = document.createElement('button');
  seekBtn.id = 'wsSeekOpen';
  seekBtn.type = 'button';
  seekBtn.className = 'ws-lower-btn ws-icon-only';
  seekBtn.innerHTML = icon('search');
  seekBtn.title = '搜索';
  seekBtn.setAttribute('aria-label', '搜索');
  lower.append(seekBtn);
  const seekOverlay = document.createElement('div');
  seekOverlay.id = 'wsSeekOverlay';
  seekOverlay.className = 'ws-seek-overlay';
  seekOverlay.setAttribute('aria-hidden', 'true');
  const seekTop = document.createElement('div');
  seekTop.className = 'ws-seek-top';
  const seekClose = document.createElement('button');
  seekClose.id = 'wsSeekClose';
  seekClose.type = 'button';
  seekClose.className = 'ws-symbol-btn';
  seekClose.innerHTML = icon('close');
  seekClose.title = '关闭搜索';
  seekClose.setAttribute('aria-label', '关闭搜索');
  const seekWrap = searchDock?.querySelector('.search-wrap');
  if (seekWrap) seekWrap.append(seekClose);
  seekTop.append(searchDock);
  seekOverlay.append(seekTop, searchResults);
  document.body.append(seekOverlay);
  if (replaceBtn) {
    replaceBtn.remove();
    replaceBtn.classList.add('ws-lower-btn', 'ws-icon-only');
    replaceBtn.innerHTML = icon('replace');
    replaceBtn.title = '批量替换';
    lower.append(replaceBtn);
  }
  const manageBtn = document.createElement('button');
  manageBtn.id = 'wsManageChains';
  manageBtn.type = 'button';
  manageBtn.className = 'ws-lower-btn ws-icon-only';
  manageBtn.innerHTML = icon('menu');
  manageBtn.title = '管理链排序';
  manageBtn.setAttribute('aria-label', '管理链排序');
  lower.append(manageBtn);

  const aiAssist = document.createElement('button');
  aiAssist.id = 'aiAssistBtn';
  aiAssist.type = 'button';
  aiAssist.className = 'ws-lower-btn ws-ai-assist ws-icon-only';
  aiAssist.innerHTML = icon('sparkle');
  aiAssist.title = 'AI 辅助';
  aiAssist.setAttribute('aria-label', 'AI 辅助');
  lower.append(aiAssist);

  // Management opens a modal; current-chain text is its own card below.
  const modal = document.createElement('div');
  modal.id = 'wsChainModal';
  modal.className = 'ws-chain-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="ws-chain-modal-card" role="dialog" aria-modal="true" aria-labelledby="wsChainModalTitle">
    <header class="ws-chain-modal-head">
      <div class="ws-chain-modal-title"><div class="ws-chain-title-line"><b id="wsChainModalTitle">管理链</b><span id="wsChainModalCount" class="ws-chain-count">0 条</span></div></div>
      <div class="ws-chain-modal-actions">
        <button id="wsAddChainTop" class="ws-chain-add-btn" type="button" title="新增链" aria-label="新增链">${icon('plus')}</button>
        <button id="wsChainModalClose" class="ws-chain-close-btn" type="button" title="关闭" aria-label="关闭">${icon('close')}</button>
      </div>
    </header>
    <div class="ws-chain-modal-body" id="wsChainBody"></div>
    <footer class="ws-chain-modal-foot"><span id="wsChainModalSelected">当前：未选择</span></footer>
  </div>`;
  document.body.append(modal);
  const body = modal.querySelector('#wsChainBody');
  const addTop = modal.querySelector('#wsAddChainTop');
  body.append(sidebar);
  sidebar.classList.add('ws-chain-panel');

  const currentChain = document.createElement('section');
  currentChain.id = 'wsCurrentChain';
  currentChain.className = 'ws-current-chain';
  currentChain.hidden = true;
  const currentHead = document.createElement('div');
  currentHead.className = 'ws-current-head';
  currentHead.innerHTML = `<b id="wsCurrentChainName">链 1</b><span id="wsCurrentStatus" class="ws-current-status" hidden></span><button id="wsInlineApply" class="ws-inline-apply" type="button" title="确认修改" aria-label="确认修改">${icon('check')}</button>`;
  const work = document.createElement('div');
  work.className = 'ws-inline-editor text-editor-work';
  const numbers = document.createElement('div');
  numbers.id = 'wsInlineLines';
  numbers.className = 'text-line-numbers';
  const codeMain = document.createElement('div');
  codeMain.id = 'wsInlineCodeMain';
  codeMain.className = 'text-code-main';
  const highlight = document.createElement('pre');
  highlight.id = 'wsInlineHighlight';
  highlight.className = 'text-editor-highlight';
  highlight.setAttribute('aria-hidden', 'true');
  const inlineText = document.createElement('textarea');
  inlineText.id = 'wsInlineText';
  inlineText.className = 'text-editor-input';
  inlineText.spellcheck = false;
  inlineText.wrap = 'soft';
  inlineText.autocomplete = 'off';
  inlineText.autocorrect = 'off';
  inlineText.autocapitalize = 'off';
  inlineText.setAttribute('aria-label', '当前链命令，每行一条');
  codeMain.append(highlight, inlineText);
  work.append(numbers, codeMain);
  currentChain.append(currentHead, work);

  shell.append(header, stage, deck, currentChain);

  // Reuse the upload footer in the editor, minus the support button.
  const uploadFooter = $('#uploadFooter');
  if (uploadFooter && !$('#editorFooter')) {
    const footer = uploadFooter.cloneNode(true);
    footer.id = 'editorFooter';
    footer.classList.remove('upload-footer');
    footer.classList.add('editor-footer');
    footer.querySelector('.support-pill')?.remove();
    shell.append(footer);
  }

  bindFrame({ manageBtn, aiAssist, addTop, modal, seekBtn, seekOverlay, seekClose, inlineText, numbers, codeMain });
}

let inlineDirty = false;
let inlineChain = -2;
let inlineConditions = [];

function renderInlineVisuals() {
  const input = $('#wsInlineText');
  const numbers = $('#wsInlineLines');
  const highlight = $('#wsInlineHighlight');
  const main = $('#wsInlineCodeMain');
  if (!input || !numbers || !highlight || !main) return;
  const value = String(input.value ?? '').replace(/\r/g, '');
  const lines = value ? value.split('\n') : [''];
  const highlightFn = window.highlightTextEditorLine;
  const renderLine = line => highlightFn ? highlightFn(line) : line.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lineCountChanged = lines.length !== inlineLayoutLines.length;
  if (lineCountChanged || highlight.children.length !== lines.length) {
    highlight.innerHTML = lines.map(line => `<span class="text-highlight-line">${renderLine(line)}</span>`).join('');
  } else {
    for (let index = 0; index < lines.length; index++) {
      if (lines[index] !== inlineLayoutLines[index]) {
        highlight.children[index].innerHTML = renderLine(lines[index]);
      }
    }
  }
  if (numbers.children.length !== lines.length) {
    numbers.innerHTML = lines.map((_, index) => `<span class="text-line-number${inlineConditions[index] ? ' is-conditional' : ''}" data-line="${index}">${index + 1}</span>`).join('');
  } else {
    for (let index = 0; index < lines.length; index++) {
      numbers.children[index].classList.toggle('is-conditional', !!inlineConditions[index]);
    }
  }
  inlineLayoutLines = lines.slice();
  main.classList.toggle('is-empty', !value);
  const token = ++inlineLayoutToken;
  requestAnimationFrame(() => {
    if (token !== inlineLayoutToken) return;
    const lineNodes = highlight.children;
    const heights = inlineMetrics(lineNodes, lines, highlight);
    let heightsChanged = heights.length !== inlineLayoutHeights.length;
    if (!heightsChanged) {
      for (let index = 0; index < heights.length; index++) {
        if (heights[index] !== inlineLayoutHeights[index]) { heightsChanged = true; break; }
      }
    }
    if (heightsChanged) {
      const numNodes = numbers.children;
      for (let index = 0; index < numNodes.length; index++) {
        const height = heights[index];
        if (height) {
          numNodes[index].style.height = `${height}px`;
          numNodes[index].style.minHeight = `${height}px`;
        } else {
          numNodes[index].style.height = '';
          numNodes[index].style.minHeight = '';
        }
      }
      inlineLayoutHeights = heights.slice();
      const contentHeight = Math.max(main.clientHeight, highlight.scrollHeight + 2);
      if (contentHeight !== inlineContentHeight) {
        inlineContentHeight = contentHeight;
        input.style.height = `${contentHeight}px`;
        input.style.minHeight = `${contentHeight}px`;
      }
    }
    numbers.scrollTop = main.scrollTop;
  });
}

/** 把一条链的命令方块拼成编辑器文本：每行一条命令，顺序与物理方块一致。 */
function chainToText(chain) {
  return (chain?.blocks || []).map(block => String(block.cmd ?? '')).join('\n');
}

function renderInlineText(force = false) {
  const app = window.app;
  const panel = $('#wsCurrentChain');
  const input = $('#wsInlineText');
  if (!app || !panel || !input) return;
  const chain = app.chains?.[app.selectedChain];
  if (!chain || app.mode !== 'chain') {
    panel.hidden = true;
    inlineDirty = false;
    inlineChain = -2;
    return;
  }
  panel.hidden = false;
  $('#wsCurrentChainName').textContent = chain.name || `链 ${app.selectedChain + 1}`;
  const blocks = chain.blocks || [];
  const value = chainToText(chain);
  if (force || inlineChain !== app.selectedChain) {
    inlineConditions = blocks.map(block => !!block.cond);
    if (document.activeElement !== input) {
      input.value = value;
      inlineDirty = false;
      $('#wsCurrentStatus').textContent = '自动同步';
    }
    inlineChain = app.selectedChain;
    renderInlineVisuals();
  } else if (!inlineDirty && document.activeElement !== input && input.value !== value) {
    input.value = value;
    inlineConditions = blocks.map(block => !!block.cond);
    renderInlineVisuals();
  }
}

window.renderInlineText = renderInlineText;
window.getInlineEditState = () => {
  const input = $('#wsInlineText');
  return {
    chain: inlineChain,
    text: input ? input.value : '',
    conditions: (inlineConditions || []).slice(),
    dirty: inlineDirty
  };
};
window.renderWorkspaceSidebar = scheduleSidebarRender;
window.syncWorkspaceMode = () => {
  const shell = document.querySelector('#editorView .editor-shell');
  shell?.classList.toggle('ws-overview', window.app?.mode !== 'chain');
};

function animateInlineApply(state) {
  const button = $('#wsInlineApply');
  if (!button) return;
  button.classList.remove('is-confirmed', 'is-error');
  // Restart the confirmation pulse each time the chain text is synced.
  void button.offsetWidth;
  button.classList.add(state);
  window.setTimeout(() => button.classList.remove(state), 900);
}

function applyInlineText() {
  const app = window.app;
  const input = $('#wsInlineText');
  if (!app || !input || !inlineDirty) return;
  const ci = app.selectedChain;
  const chain = app.chains?.[ci];
  if (!chain) return;
  const raw = input.value.replace(/\r/g, '');
  const lines = raw.split('\n');
  // Only trailing empty commands are auto-removed. Empty rows in the middle
  // remain physical command blocks.
  while (lines.length && !String(lines[lines.length - 1] ?? '').trim()) lines.pop();
  if (!lines.length) {
    window.toast?.('文本内容中没有可表示的命令方块', 'err');
    return;
  }
  const next = app.chains.map(item => ({
    ...item,
    blocks: (item.blocks || []).map(block => ({ ...block }))
  }));
  const target = next[ci];
  const chainType = target.type === 'impulse' ? 'impulse' : (target.type === 'snake' ? 'snake' : 'repeat');
  const firstBlockType = chainType === 'impulse' ? 'command' : 'repeating';
  // 逐行复用原方块，只替换命令文本和条件。
  // 朝向、执行方式、标记、注释、辅助方块身份、断链归一化状态都属于物理方块本身，
  // 改文本不应该把它们重置——README §1.7 要求保留辅助方块的
  // blockType/cond/auto/isAuxiliary，也禁止二次旋转断链标记的相对坐标。
  const previousBlocks = target.blocks || [];
  const blocks = lines.map((line, index) => {
    const cmd = String(line ?? '').trim();
    const cond = inlineConditions[index] ? 1 : 0;
    const previous = previousBlocks[index];
    if (previous) return { ...previous, cmd, cond };
    // 文本比原来长，新增的行按链头类型给一套默认值。
    return {
      cmd,
      cond,
      auto: 1,
      facing: 2,
      blockType: index === 0 ? firstBlockType : 'chain',
      marked: false,
      note: ''
    };
  });
  target.type = chainType;
  target.selfClosed = false;
  target.selfClosedCycleKeys = [];
  target.preservePhysicalType = false;
  target.blocks = blocks;
  try {
    window.reflowChainsForSize?.(next);
    window.ensureStructureSize?.(next, '文本编辑后结构');
    app.chains = next;
    app.selectedChain = ci;
    app.selectedBlock = -1;
    document.getElementById('infoPanel')?.classList.remove('on');
    document.getElementById('inspector')?.classList.remove('open');
    window.pushHistory?.();
    window.renderAllBlocks?.();
    window.updateStats?.();
    window.updateChainBar?.();
    window.logInfo?.(`直接编辑链 ${ci + 1}：${lines.length} 行命令`, '文本模式');
    window.toast?.(`已确认修改链 ${ci + 1} 的文本内容`, 'ok');
    inlineDirty = false;
    renderInlineText(true);
    $('#wsCurrentStatus').textContent = '已同步';
    animateInlineApply('is-confirmed');
  } catch (error) {
    $('#wsCurrentStatus').textContent = '同步失败';
    animateInlineApply('is-error');
    window.toast?.(error.message || String(error), 'err');
    window.logError?.(error?.stack || error?.message || String(error), '文本模式');
  }
}

function bindFrame({ manageBtn, aiAssist, addTop, modal, seekBtn, seekOverlay, seekClose, inlineText, numbers, codeMain }) {

  inlineText.addEventListener('input', () => {
    const currentChain = window.app?.chains?.[window.app?.selectedChain];
    if (inlineText.value !== chainToText(currentChain)) {
      inlineDirty = true;
      $('#wsCurrentStatus').textContent = '待同步';
    }
    renderInlineVisuals();
  });
  // README 要求「失焦同步」：光标离开文本框时把尚未确认的改动落盘。
  // 少了这一步，切换链时 renderInlineText 会直接用方块数据覆盖 input.value，
  // 未确认的编辑就在没有任何提示的情况下丢失了。
  inlineText.addEventListener('blur', () => {
    if (inlineDirty) applyInlineText();
  });
  inlineText.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      inlineDirty = true;
      applyInlineText();
    }
  });
  numbers.addEventListener('pointerdown', event => {
    if (event.target.closest('.text-line-number')) event.preventDefault();
  });
  numbers.addEventListener('click', event => {
    const number = event.target.closest('.text-line-number');
    if (!number) return;
    const line = Number(number.dataset.line);
    inlineConditions[line] = !inlineConditions[line];
    inlineDirty = true;
    $('#wsCurrentStatus').textContent = '待同步';
    renderInlineVisuals();
    applyInlineText();
  });
  codeMain.addEventListener('scroll', () => {
    numbers.scrollTop = codeMain.scrollTop;
  });
  $('#wsInlineApply')?.addEventListener('click', () => {
    // 点按钮一定会先触发 textarea 的 blur，那里已经同步过；
    // 这里不再强制标记 dirty，避免一次编辑写两条撤销记录。
    applyInlineText();
  });
  bindSidebarEvents();
  renderInlineText();

  const setChainModal = show => {
    modal.classList.toggle('on', !!show);
    modal.setAttribute('aria-hidden', String(!show));
    if (show) {
      renderSidebar();
      setTimeout(() => $('#wsChainModalClose')?.focus(), 30);
    }
  };
  manageBtn.addEventListener('click', () => setChainModal(!modal.classList.contains('on')));
  $('#wsChainModalClose')?.addEventListener('click', () => setChainModal(false));
  modal.addEventListener('click', event => {
    if (event.target === modal) setChainModal(false);
  });

  const seekInput = $('#blockSearch');
  const openSeek = () => {
    seekOverlay.classList.add('on');
    seekOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => seekInput?.focus(), 30);
  };
  const closeSeek = () => {
    seekOverlay.classList.remove('on');
    seekOverlay.setAttribute('aria-hidden', 'true');
  };
  seekBtn.addEventListener('click', openSeek);
  seekClose.addEventListener('click', () => {
    if (seekInput) {
      seekInput.value = '';
      seekInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    closeSeek();
  });
  seekOverlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSeek();
  });

  aiAssist.addEventListener('click', () => {
    const scope = window.app?.mode === 'chain' ? 'chain' : 'all';
    window.BlockFlowAI?.open?.(scope);
  });

  const openAddChain = () => window.openChainAddModal?.();
  addTop?.addEventListener('click', openAddChain);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('on')) {
      event.preventDefault();
      setChainModal(false);
      return;
    }
    if (event.key === 'Escape' && seekOverlay.classList.contains('on')) {
      event.preventDefault();
      closeSeek();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSeek();
    }
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
      event.preventDefault();
      openSeek();
    }
  });

  renderSidebar();
  window.renderWorkspaceSidebar?.();
}



window.addEventListener('resize', () => {
  if (!$('#wsCurrentChain')?.hidden) {
    inlineLayoutHeights = [];
    inlineContentHeight = 0;
    renderInlineVisuals();
  }
});
if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    inlineMetrics.invalidate();
    inlineLayoutHeights = [];
    inlineContentHeight = 0;
    renderInlineVisuals();
  });
}

function bindUploadEyes() {
  const view = $('#uploadView');
  const eyes = $('#uploadEyes');
  if (!view || !eyes) return;

  // Each pupil is treated as a point on a sphere. Rotating the sphere
  // changes both its projected position and its apparent width near the rim.
  const pupils = [...eyes.querySelectorAll('.upload-eye i')].map((element, index) => ({
    element,
    x0: index === 0 ? -0.22 : 0.22,
    y0: 0
  }));
  let raf = 0;
  let active = false;
  let pointerEvent = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const move = event => {
    pointerEvent = event;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!active || !pointerEvent) return;
      const pill = eyes.querySelector('.upload-eyes-pill');
      if (!pill) return;
      const rect = pill.getBoundingClientRect();
      // Map the pointer across the whole viewport, not just the small eye
      // widget. Using the widget's width here makes the response saturate
      // as soon as the pointer leaves the eye, so distant cursor movement
      // appears to have no effect. The atan mapping keeps far-away motion
      // responsive while easing naturally near the extremes.
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const focalX = Math.max(1, window.innerWidth * 0.72);
      const focalY = Math.max(1, window.innerHeight * 0.72);
      const nx = Math.atan((pointerEvent.clientX - centerX) / focalX) / (Math.PI / 4);
      const ny = Math.atan((pointerEvent.clientY - centerY) / focalY) / (Math.PI / 4);
      const yaw = clamp(nx, -1, 1) * 0.9;
      const pitch = -clamp(ny, -1, 1) * 0.68;
      const radius = Math.min(rect.width, rect.height) * 0.52;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);

      pupils.forEach(({ element, x0, y0 }) => {
        const z0 = Math.sqrt(Math.max(0, 1 - x0 * x0 - y0 * y0));
        const x1 = x0 * cosYaw + z0 * sinYaw;
        const z1 = -x0 * sinYaw + z0 * cosYaw;
        const y2 = y0 * cosPitch - z1 * sinPitch;
        const z2 = y0 * sinPitch + z1 * cosPitch;
        const foreshortening = 0.35 + 0.65 * clamp(z2, 0, 1);
        element.style.transform = `translate(${(x1 - x0) * radius}px, ${y2 * radius}px) scaleX(${foreshortening})`;
      });
    });
  };

  // The mascot opens the README directly; no rotating easter-egg text is shown.
  eyes.addEventListener('click', () => window.openUsageHelp?.());

  const start = () => {
    if (active || !view.classList.contains('on')) return;
    active = true;
    window.addEventListener('pointermove', move, { passive: true });
  };
  const stop = () => {
    active = false;
    window.removeEventListener('pointermove', move);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pointerEvent = null;
    pupils.forEach(({ element }) => { element.style.transform = ''; });
  };

  new MutationObserver(() => {
    if (view.classList.contains('on')) start();
    else stop();
  }).observe(view, { attributes: true, attributeFilter: ['class'] });
  start();
}

function bindDesktopOnlyGate() {
  const gate = $('#pcOnlyGate');
  if (!gate) return;
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet|Windows Phone/i.test(ua);
  const ipadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const touchOnly = window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches;
  if (!mobileUA && !ipadOS && !touchOnly) return;
  // Keep the page loaded but inert behind a full-screen notice.
  document.body.classList.add('bf-pc-only');
  gate.hidden = false;
  $('#editorView')?.setAttribute('aria-hidden', 'true');
  $('#uploadView')?.setAttribute('aria-hidden', 'true');
}

function bind() {
  if (!$('#editorView')) return;
  buildFrame();
  bindUploadEyes();
  bindDesktopOnlyGate();
  const shell = $('#editorView .editor-shell');
  if (!shell) return;
  // closing the 3D popup when clicking outside is handled by the app's deselect;
  // the inspector itself stays hidden until showInfo adds .open.
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
