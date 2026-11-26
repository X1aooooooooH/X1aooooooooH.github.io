import { createLineMetrics } from './ui/line-metrics.js';

const $ = (selector, root = document) => root.querySelector(selector);
const inlineMetrics = createLineMetrics();
let inlineLayoutLines = [];
let inlineLayoutHeights = [];
let inlineContentHeight = 0;
let inlineLayoutToken = 0;

const state = { filter: 'all', key: '' };

function chainTotal(chain) {
  return (chain?.blocks || []).length;
}

function chainEmpty(chain) {
  return (chain?.blocks || []).filter(block => !String(block.cmd ?? '').trim()).length;
}

function renderSidebar() {
  const app = window.app;
  const list = $('#wsChainList');
  if (!app?.chains || !list) return;
  $('#wsChainCount').textContent = `${app.chains.length} 条`;
  const items = app.chains.map((chain, index) => ({ chain, index }))
    .filter(({ chain }) => state.filter !== 'empty' || chainEmpty(chain));
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'ws-empty';
    empty.textContent = state.filter === 'empty' ? '没有空尾链' : '还没有命令链';
    list.appendChild(empty);
    return;
  }
  for (const { chain, index } of items) {
    const row = document.createElement('div');
    row.className = 'ws-chain-row' + (index === app.selectedChain ? ' on' : '');
    row.dataset.index = String(index);
    row.tabIndex = 0;
    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'ws-chain-drag';
    dragHandle.textContent = '⠿';
    dragHandle.title = '拖动排序';
    dragHandle.setAttribute('aria-label', '拖动排序');
    dragHandle.draggable = true;
    const copy = document.createElement('span');
    copy.className = 'ws-chain-copy';
    const title = document.createElement('b');
    title.textContent = chain.name || `链 ${index + 1}`;
    const meta = document.createElement('small');
    const empty = chainEmpty(chain);
    meta.textContent = `${chainTotal(chain)} 块${empty ? ` · ${empty} 空` : ''}`;
    const preview = document.createElement('em');
    preview.className = 'ws-chain-preview';
    preview.textContent = chain.blocks?.[0]?.cmd || '（无命令）';
    copy.append(title, meta, preview);
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'ws-chain-rename';
    rename.title = '重命名链';
    rename.setAttribute('aria-label', '重命名链');
    rename.textContent = '✎';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ws-chain-del';
    del.title = `删除链 ${index + 1}`;
    del.setAttribute('aria-label', `删除链 ${index + 1}`);
    del.textContent = '×';
    const actions = document.createElement('div');
    actions.className = 'ws-chain-actions';
    actions.append(rename, del);
    row.append(dragHandle, copy, actions);
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
  window.renderChainManager?.();
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
    if (event.target.closest('.ws-chain-del')) {
      event.stopPropagation();
      window.deleteChainAt?.(index);
      return;
    }
    selectChain(index);
  });
  list.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const index = sidebarRowIndex(event.target);
    if (index < 0) return;
    event.preventDefault();
    selectChain(index);
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
  if (window.renderChainManager) window.renderChainManager();
  const item = $(`#chainManagerList .chain-item[data-chain-index="${index}"]`);
  if (item) item.click();
  else if (window.app) {
    window.app.selectedChain = index;
    window.app.selectedBlock = -1;
    window.updateChainBar?.();
  }
  const shell = $('#editorView .editor-shell');
  shell?.classList.remove('ws-left-open');
  const chain = window.app?.chains?.[index];
  const first = (chain?.blocks || []).findIndex(block => String(block.cmd ?? '').trim() !== '');
  if (first >= 0) {
    setTimeout(() => {
      window.selectBlock?.({ chain: index, index: first });
      if (window.innerWidth <= 900) shell?.classList.add('ws-inspector-open');
    }, 90);
  }
  setTimeout(renderSidebar, 0);
}

function buildFrame() {
  const shell = $('#editorView .editor-shell');
  if (!shell || shell.querySelector('.ws-stage')) return;
  const header = $('.command-bar');
  const canvas = $('#canvasWrap');
  const sidebar = $('#wsSidebar');
  const inspector = $('#inspector');
  const chainBar = $('#chainBar');
  const searchResults = $('#searchResults');
  const searchDock = $('.search-dock');
  const viewGrid = $('.top-view-grid');
  const exitBtn = $('#exitChainBtn');
  const replaceBtn = $('#replaceBtn');
  const usageBtn = $('#usageHelpBtn');
  if (!header || !canvas || !sidebar || !inspector || !chainBar) return;

  // Top bar: exit file, file identity, counts; theme/log/help/export on the right.
  const uploadReadme = $('#uploadReadmeBtn');
  if (uploadReadme) {
    uploadReadme.textContent = '?';
    uploadReadme.title = '阅读 README 使用说明';
    uploadReadme.setAttribute('aria-label', '阅读 README 使用说明');
  }
  const back = $('#backBtn');
  if (back) {
    back.classList.remove('bar-brand');
    back.classList.add('ws-exit-btn');
    back.textContent = '←';
    back.title = '退出当前文件';
    back.setAttribute('aria-label', '退出当前文件');
  }
  const actions = $('.bar-actions');
  if (usageBtn) {
    usageBtn.classList.add('ws-top-utility');
    usageBtn.textContent = '?';
    usageBtn.title = '使用说明';
    usageBtn.setAttribute('aria-label', '使用说明');
    const save = $('#saveBtn');
    if (save) actions.insertBefore(usageBtn, save);
    else actions.append(usageBtn);
  }
  const themeBtn = $('#themeBtn');
  if (themeBtn) {
    themeBtn.textContent = '◐';
    themeBtn.title = '切换主题';
    themeBtn.setAttribute('aria-label', '切换主题');
  }
  const diagnoseBtn = $('#diagnoseBtn');
  if (diagnoseBtn) {
    diagnoseBtn.textContent = '▤';
    diagnoseBtn.title = '运行日志';
    diagnoseBtn.setAttribute('aria-label', '运行日志');
  }
  if (themeBtn && diagnoseBtn) actions.insertBefore(themeBtn, diagnoseBtn);
  const save = $('#saveBtn');
  if (save) {
    save.textContent = '⇧';
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
  ['aiWholeBtn', 'aiChainBtn', 'wsMobileSearch', 'wsInspectorToggle', 'wsMoreBtn', 'wsMobileLeft', 'wsMobileInspector'].forEach(id => {
    document.getElementById(id)?.classList.add('ws-hidden');
  });
  $('.ws-more')?.classList.add('ws-hidden');
  ['diagnoseBtn', 'themeBtn', 'replaceBtn', 'saveBtn'].forEach(id => document.getElementById(id)?.classList.remove('ws-legacy-control'));
  $('.bar-control-row')?.classList.add('ws-hidden');

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
    exitBtn.textContent = '←';
    exitBtn.title = '返回主视图';
    exitBtn.setAttribute('aria-label', '返回主视图');
    stageTools.append(exitBtn);
  }
  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');
  if (undoBtn) {
    undoBtn.classList.remove('ws-hidden');
    undoBtn.textContent = '↶';
    undoBtn.title = '上一步';
    undoBtn.setAttribute('aria-label', '上一步');
    actions.prepend(undoBtn);
  }
  if (redoBtn) {
    redoBtn.classList.remove('ws-hidden');
    redoBtn.textContent = '↷';
    redoBtn.title = '下一步';
    redoBtn.setAttribute('aria-label', '下一步');
    actions.insertBefore(redoBtn, undoBtn?.nextSibling || null);
  }
  if (viewGrid) {
    viewGrid.remove();
    const viewSymbols = { front: '▣', side: '◧', top: '⬒' };
    const viewLabels = { front: '正视图', side: '侧视图', top: '俯视图' };
    viewGrid.querySelectorAll('.view-btn').forEach(button => {
      const preset = button.dataset.preset;
      if (!preset) return;
      button.textContent = viewSymbols[preset] || button.textContent;
      button.title = viewLabels[preset] || button.title;
      button.setAttribute('aria-label', viewLabels[preset] || '视图');
    });
    stageTools.append(viewGrid);
  }
  stage.append(inspector);
  inspector.classList.add('ws-block-popup');
  const inspectorHead = inspector.querySelector('.inspector-head');
  const inspectorActions = document.createElement('div');
  inspectorActions.className = 'ws-inspector-actions';
  const markBtn = $('#infoMark');
  const insertBtn = $('#infoInsAfter');
  const deleteBtn = $('#infoDel');
  if (markBtn) {
    markBtn.textContent = '⚑';
    markBtn.title = '标记';
    markBtn.setAttribute('aria-label', '标记');
    inspectorActions.append(markBtn);
  }
  if (insertBtn) {
    insertBtn.textContent = '＋';
    insertBtn.title = '后插命令方块';
    insertBtn.setAttribute('aria-label', '后插命令方块');
    inspectorActions.append(insertBtn);
  }
  if (deleteBtn) {
    deleteBtn.textContent = '⌫';
    deleteBtn.title = '删除这个命令方块';
    deleteBtn.setAttribute('aria-label', '删除这个命令方块');
    inspectorActions.append(deleteBtn);
  }
  const aiBlockBtn = document.createElement('button');
  aiBlockBtn.id = 'infoAi';
  aiBlockBtn.type = 'button';
  aiBlockBtn.className = 'ws-symbol-btn';
  aiBlockBtn.textContent = '✦';
  aiBlockBtn.title = '问 AI 这个命令方块';
  aiBlockBtn.setAttribute('aria-label', '问 AI 这个命令方块');
  aiBlockBtn.addEventListener('click', () => {
    const app = window.app;
    if (!app) return;
    window.BlockFlowAI?.openBlock?.(app.selectedChain, app.selectedBlock);
  });
  inspectorActions.append(aiBlockBtn);
  if (inspectorHead) {
    const title = inspectorHead.querySelector('b');
    if (title) {
      title.id = 'inspectorTitle';
      title.textContent = '—';
    }
    const close = $('#infoClose');
    inspectorHead.insertBefore(inspectorActions, close || null);
  }
  $('#infoMarkBadge')?.remove();
  $('.object-summary')?.classList.add('ws-hidden');
  $('.edit-grid')?.classList.add('ws-hidden');
  const camera = $('#cameraPad');
  if (camera) {
    camera.classList.add('ws-camera');
    stage.append(camera);
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
  seekBtn.textContent = '⌕';
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
  seekClose.textContent = '×';
  seekClose.title = '关闭搜索';
  seekClose.setAttribute('aria-label', '关闭搜索');
  const seekWrap = searchDock?.querySelector('.search-wrap');
  if (seekWrap) seekWrap.append(seekClose);
  seekTop.append(searchDock);
  seekOverlay.append(seekTop, searchResults);
  document.body.append(seekOverlay);
  if (replaceBtn) {
    replaceBtn.remove();
    replaceBtn.classList.add('ws-lower-btn');
    replaceBtn.textContent = '⇄';
    replaceBtn.title = '批量替换';
    lower.append(replaceBtn);
  }
  const manageBtn = document.createElement('button');
  manageBtn.id = 'wsManageChains';
  manageBtn.type = 'button';
  manageBtn.className = 'ws-lower-btn ws-icon-only';
  manageBtn.textContent = '☰';
  manageBtn.title = '管理链排序';
  manageBtn.setAttribute('aria-label', '管理链排序');
  lower.append(manageBtn);

  const aiAssist = document.createElement('button');
  aiAssist.id = 'aiAssistBtn';
  aiAssist.type = 'button';
  aiAssist.className = 'ws-lower-btn ws-ai-assist ws-icon-only';
  aiAssist.textContent = '✦';
  aiAssist.title = 'AI 辅助';
  aiAssist.setAttribute('aria-label', 'AI 辅助');
  lower.append(aiAssist);

  // Management opens a modal; current-chain text is its own card below.
  const modal = document.createElement('div');
  modal.id = 'wsChainModal';
  modal.className = 'ws-chain-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="ws-chain-modal-card" role="dialog" aria-modal="true" aria-labelledby="wsChainModalTitle">
    <header class="ws-chain-modal-head"><div class="ws-chain-modal-title"><b id="wsChainModalTitle">管理链</b><span>拖动卡片排序</span></div><div class="ws-chain-modal-actions"><button id="wsAddChainTop" class="ws-chain-add-btn" type="button" title="新增链" aria-label="新增链">＋</button><button id="wsChainModalClose" class="ws-chain-close-btn" type="button" title="关闭" aria-label="关闭">×</button></div></header>
    <div class="ws-chain-modal-body" id="wsChainBody"></div>
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
  currentHead.innerHTML = '<b id="wsCurrentChainName">链 1</b><span id="wsCurrentStatus" class="ws-current-status" hidden></span><button id="wsInlineApply" class="ws-inline-apply" type="button">确认修改</button>';
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

  chainBar.classList.add('ws-hidden');
  shell.append(header, stage, deck, currentChain);
  const help = document.getElementById('viewportHelp');
  if (help) help.remove();

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
  const value = blocks.map(block => String(block.cmd ?? '')).join('\n');
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
window.renderWorkspaceSidebar = scheduleSidebarRender;
window.syncWorkspaceMode = () => {
  const shell = document.querySelector('#editorView .editor-shell');
  shell?.classList.toggle('ws-overview', window.app?.mode !== 'chain');
};

function applyInlineText() {
  const app = window.app;
  const input = $('#wsInlineText');
  if (!app || !input || !inlineDirty) return;
  const ci = app.selectedChain;
  const chain = app.chains?.[ci];
  if (!chain) return;
  const raw = input.value.replace(/\r/g, '');
  const lines = raw.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) lines.push('');
  const next = app.chains.map(item => ({
    ...item,
    blocks: (item.blocks || []).map(block => ({ ...block }))
  }));
  const target = next[ci];
  const old = target.blocks || [];
  const count = Math.max(old.length, lines.length);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const cond = inlineConditions[i] ? 1 : 0;
    if (i < old.length) {
      blocks.push({ ...old[i], cmd: lines[i] ?? '', cond });
    } else {
      const first = i === 0;
      const type = first ? (target.type === 'repeat' ? 'repeating' : 'command') : 'chain';
      blocks.push({ cmd: lines[i] ?? '', cond, auto: 1, facing: 2, blockType: type, marked: false, note: '' });
    }
  }
  if (!blocks.length) blocks.push({ cmd: '', cond: 0, auto: 1, facing: 2, blockType: 'command', marked: false, note: '' });
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
    window.renderChainManager?.();
    window.logInfo?.(`直接编辑链 ${ci + 1}：${lines.length} 行命令`, '文本模式');
    window.toast?.(`已确认修改链 ${ci + 1} 的文本内容`, 'ok');
    inlineDirty = false;
    renderInlineText(true);
    $('#wsCurrentStatus').textContent = '已同步';
  } catch (error) {
    $('#wsCurrentStatus').textContent = '同步失败';
    window.toast?.(error.message || String(error), 'err');
    window.logError?.(error?.stack || error?.message || String(error), '文本模式');
  }
}

function bindFrame({ manageBtn, aiAssist, addTop, modal, seekBtn, seekOverlay, seekClose, inlineText, numbers, codeMain }) {
  const menu = $('#wsMoreMenu');
  if (menu) menu.hidden = true;

  // hide legacy chain dock controls and its empty areas
  $('#chainManage')?.classList.add('ws-hidden');
  $('#chainDeleteBtn')?.classList.add('ws-hidden');
  $('.chain-action-label')?.classList.add('ws-hidden');
  $('.usage-help-area')?.classList.add('ws-hidden');
  $('.ws-side-foot')?.classList.add('ws-hidden');
  $('#wsMobileLeft')?.classList.add('ws-hidden');
  $('#wsMobileInspector')?.classList.add('ws-hidden');
  $('#wsInspectorToggle')?.classList.add('ws-hidden');
  $('#chainAddBtn')?.setAttribute('data-ws-add', '1');

  inlineText.addEventListener('input', () => {
    if (inlineText.value !== (window.app?.chains?.[window.app.selectedChain]?.blocks || []).map(block => String(block.cmd ?? '')).join('\n')) {
      inlineDirty = true;
      $('#wsCurrentStatus').textContent = '待同步';
    }
    renderInlineVisuals();
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
    inlineDirty = true;
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
    if (window.BlockFlowAI?.open) window.BlockFlowAI.open(scope);
    else document.getElementById('aiWholeBtn')?.click();
  });

  const openAddChain = () => {
    $('#chainAddBtn')?.click();
  };
  $('#wsAddChain')?.addEventListener('click', openAddChain);
  addTop?.addEventListener('click', openAddChain);
  $('.ws-side-head')?.classList.add('ws-hidden');
  $('.ws-side-filter')?.classList.add('ws-hidden');
  $('.ws-side-foot')?.classList.add('ws-hidden');

  // The legacy manager renders canonical rows; mirror its updates.
  const manager = $('#chainManagerList');
  if (manager) new MutationObserver(scheduleSidebarRender).observe(manager, { childList: true });

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
  setTimeout(() => {
    if (window.renderChainManager) window.renderChainManager();
    renderSidebar();
  }, 100);
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
  const quote = $('#uploadEyesQuote');
  if (!view || !eyes || !quote) return;
  const pupils = [...eyes.querySelectorAll('.upload-eye i')];
  const quotes = ['关注X1aooooooooH谢谢喵', 'MCBE可视化网页指令编辑器', 'BlockFlow太好用了喵'];
  let index = 0;
  let raf = 0;
  let rotateTimer = 0;
  let textTimer = 0;
  let active = false;
  let pointerEvent = null;
  const move = event => {
    pointerEvent = event;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!active || !pointerEvent) return;
      const pill = eyes.querySelector('.upload-eyes-pill');
      if (!pill) return;
      const rect = pill.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-1, Math.min(1, (pointerEvent.clientX - cx) / Math.max(80, rect.width)));
      const dy = Math.max(-1, Math.min(1, (pointerEvent.clientY - cy) / Math.max(80, rect.height)));
      pupils.forEach(pupil => { pupil.style.transform = `translate(${dx * 5}px, ${dy * 4}px)`; });
      quote.style.transform = `translateY(${dy * 2}px)`;
    });
  };
  const rotate = () => {
    if (!active) return;
    quote.classList.add('changing');
    textTimer = setTimeout(() => {
      index = (index + 1) % quotes.length;
      quote.textContent = quotes[index];
      quote.classList.remove('changing');
    }, 220);
  };
  const start = () => {
    if (active || !view.classList.contains('on')) return;
    active = true;
    quote.textContent = quotes[index];
    window.addEventListener('pointermove', move, { passive: true });
    rotateTimer = setInterval(rotate, 4200);
  };
  const stop = () => {
    active = false;
    window.removeEventListener('pointermove', move);
    clearInterval(rotateTimer);
    clearTimeout(textTimer);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  new MutationObserver(() => {
    if (view.classList.contains('on')) start();
    else stop();
  }).observe(view, { attributes: true, attributeFilter: ['class'] });
  start();
}

function bind() {
  if (!$('#editorView')) return;
  buildFrame();
  bindUploadEyes();
  const shell = $('#editorView .editor-shell');
  if (!shell) return;
  // closing the 3D popup when clicking outside is handled by the app's deselect;
  // the inspector itself stays hidden until showInfo adds .open.
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
