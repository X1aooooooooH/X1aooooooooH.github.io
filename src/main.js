'use strict';

import { MAX_STRUCTURE_SIZE, MAX_IMPORT_BYTES } from './core/constants.js';
import { isAirPlaceholderBlock } from './core/blocks.js';
import { buildExportLayouts, ensureStructureSize, reflowChainsForSize } from './core/layout.js';
import { serializeOutputForFormat } from './core/structure.js';
import { cloneChains } from './core/model.js';
import { app } from './state.js';
import { storageGet } from './core/storage.js';
import { rand6 } from './core/util.js';
import { logInfo, logOk, logError, setCurrentAction, formatLogText } from './log.js';
import { escapeHtml, isInputFocused } from './ui/dom.js';
import { renderReadmeMarkdown } from './ui/markdown.js';
import {
  toast,
  download,
  closeFeatureModal,
  rememberModalFocus,
  showPromptModal,
  showInputPopover
} from './ui/feedback.js';
import {
  renderAllBlocks,
  selectBlock,
  deselect,
  saveCamera,
  resizeRenderer,
  setBlockVisibility,
  applyChainCamera,
  animateCameraTo,
  captureOverviewCamera,
  cycleBlock,
  setViewPreset,
  getPickRecord,
  setSceneHandlers
} from './scene.js';
import { initTheme } from './ui/theme.js?v=r40-broken-chain-20261129';
import { hideInfo } from './inspector.js?v=r40-broken-chain-20261129';

import {
  updateChainBar,
  closeChainAddModal,
  addChainOfType,
  importChainFromMcstructure,
  reorderChains,
  deleteChainAt,
  updateStats,
  refreshChainsUI,
  pushHistory,
  clearAutosave,
  syncSavedState,
  undo,
  redo,
  restoreAutosave,
  loadMcstructure,
  flushAutosave,
  duplicateChainAt
} from './editor.js';
import { highlightTextEditorLine, importChainFromTxt } from './ui/text-editor.js?v=r40-broken-chain-20261129';

initTheme();

function setupChainAddDialog() {
  document.getElementById('chainAddClose').onclick = closeChainAddModal;
  document.getElementById('chainAddModal').addEventListener('click', (e) => {
    if (e.target.id === 'chainAddModal') closeChainAddModal();
  });
  document
    .querySelectorAll('[data-add-chain-type]')
    .forEach((btn) => btn.addEventListener('click', () => addChainOfType(btn.dataset.addChainType)));
  const mcstructureInput = document.getElementById('importMcstructureInput');
  const txtInput = document.getElementById('importTxtInput');
  document.getElementById('importMcstructureBtn').onclick = () => mcstructureInput?.click();
  document.getElementById('importTxtBtn').onclick = () => txtInput?.click();
  mcstructureInput?.addEventListener('change', async () => {
    const file = mcstructureInput.files?.[0];
    mcstructureInput.value = '';
    if (!file) return;
    try {
      await importChainFromMcstructure(file);
    } catch (e) {
      toast('导入失败：' + e.message, 'err');
    }
  });
  txtInput?.addEventListener('change', async () => {
    const file = txtInput.files?.[0];
    txtInput.value = '';
    if (!file) return;
    try {
      await importChainFromTxt(file);
    } catch (e) {
      toast('导入失败：' + e.message, 'err');
    }
  });
}

function withViewTransition(update) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!document.startViewTransition || reduced) {
    update();
    document.body.classList.add('ws-mode-fallback');
    setTimeout(() => document.body.classList.remove('ws-mode-fallback'), 360);
    return;
  }
  document.startViewTransition(() => update());
}
function enterChainMode(ci) {
  if (ci < 0 || ci >= app.chains.length) return;
  if (app.singleChain) return;
  withViewTransition(() => {
    if (app.mode === 'overview') captureOverviewCamera();
    app.mode = 'chain';
    app.selectedChain = ci;
    app.selectedBlock = -1;
    hideInfo();
    window.syncWorkspaceMode?.();
    window.renderInlineText?.(true);

    setBlockVisibility(ci);
    applyChainCamera();

    document.getElementById('exitChainBtn').style.display = 'flex';
    updateStats();
    updateChainBar();
    logInfo(`进入链 ${ci + 1} 视图`, '切换链视图');
  });
}
function exitChainMode() {
  if (app.mode === 'overview' && !app.singleChain) return;
  withViewTransition(() => {
    app.mode = 'overview';
    app.selectedChain = -1;
    app.selectedBlock = -1;
    hideInfo();
    deselect();
    window.syncWorkspaceMode?.();
    window.renderInlineText?.(true);

    setBlockVisibility(-1);
    if (app.overviewCamera) {
      animateCameraTo(
        [app.overviewCamera.px, app.overviewCamera.py, app.overviewCamera.pz],
        [app.overviewCamera.tx, app.overviewCamera.ty, app.overviewCamera.tz],
        600
      );
    }

    document.getElementById('exitChainBtn').style.display = 'none';
    updateStats();
    updateChainBar();
    logInfo('返回结构主视图', '切换链视图');
  });
}

window.addEventListener('pagehide', flushAutosave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAutosave();
});
window.addEventListener('beforeunload', (e) => {
  flushAutosave();
  if (app.saved === false) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function copyLogs() {
  const textValue = formatLogText();
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(textValue);
    else {
      const ta = document.createElement('textarea');
      ta.value = textValue;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('日志已复制', 'ok');
  } catch (e) {
    toast('复制日志失败：' + e.message, 'err');
  }
}
async function loadReadmeFromSibling() {
  const body = document.getElementById('usageReadmeBody');
  if (!body) return;
  body.textContent = '正在读取操作文档';
  try {
    const readmeUrl = new URL('./README.md', document.baseURI);
    const response = await fetch(readmeUrl.href, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const markdown = await response.text();
    if (!markdown.trim()) throw new Error('README.md 内容为空');
    body.innerHTML = renderReadmeMarkdown(markdown);
  } catch (error) {
    const localFile = location.protocol === 'file:';
    body.innerHTML = localFile
      ? '<h2>无法直接读取本地 README.md</h2><p>浏览器会限制网页通过 <code>file://</code> 自动读取同目录文件。请通过本地 HTTP 服务打开 BlockFlow，或使用在线版本；页面会自动从 <code>index.html</code> 同目录读取 <code>README.md</code>。</p><p><a href="./README.md" target="_blank" rel="noopener noreferrer">在新标签页直接打开同目录 README.md</a></p>'
      : `<h2>README 读取失败</h2><p>${escapeHtml(error.message || String(error))}</p><p>请确认 <code>README.md</code> 与 <code>index.html</code> 位于同一目录，并且服务器已发布该文件，然后重新打开使用说明。</p>`;
  }
}
function openUsageHelp() {
  const modal = document.getElementById('usageHelpModal');
  const body = document.getElementById('usageReadmeBody');
  if (!modal || !body) return;
  rememberModalFocus('usageHelpModal');
  modal.classList.add('on');
  modal.setAttribute('aria-hidden', 'false');
  body.scrollTop = 0;
  loadReadmeFromSibling();
  setTimeout(() => document.getElementById('usageHelpClose')?.focus(), 0);
}
window.openUsageHelp = openUsageHelp;
function openLogs() {
  const m = document.getElementById('diagnosticModal');
  if (!m) return;
  const body = document.getElementById('diagnosticBody');
  const logs = app.logs || [];
  body.innerHTML = `<div class="log-toolbar"><span>当前执行：${escapeHtml(app.currentAction || '空闲')} · 共 ${logs.length} 条</span><button id="logClear" class="log-clear" type="button">清空日志</button></div><div class="log-list">${logs.length ? logs.map((x) => `<div class="log-entry"><div class="log-entry-top"><span class="log-time">${escapeHtml(x.time)}</span><span class="log-level ${x.level}">${x.level === 'error' ? '错误' : x.level === 'warn' ? '警告' : x.level === 'ok' ? '完成' : '信息'}</span><span class="log-action">${escapeHtml(x.action)}</span></div><div class="log-message">${escapeHtml(x.message)}</div></div>`).join('') : '<div class="log-empty">暂时没有日志</div>'}</div>`;
  body.querySelector('#logClear')?.addEventListener('click', () => {
    app.logs = [];
    openLogs();
  });
  rememberModalFocus('diagnosticModal');
  m.classList.add('on');
  m.setAttribute('aria-hidden', 'false');
  const list = body.querySelector('.log-list');
  if (list)
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  setTimeout(() => body.querySelector('button,input,select,textarea')?.focus(), 0);
}
window.addEventListener('error', (event) => {
  const reason = event.error?.stack || event.message || '未知运行错误';
  logError(reason, app.currentAction || '未知执行');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.stack || event.reason?.message || String(event.reason || '未知异步错误');
  logError(reason, app.currentAction || '未知异步执行');
});

const searchInput = document.getElementById('blockSearch');
const searchClear = document.getElementById('searchClear');
const searchResults = document.getElementById('searchResults');
searchResults.addEventListener('click', (event) => {
  const item = event.target.closest('.search-result');
  if (!item) return;
  const ci = Number(item.dataset.chain),
    bi = Number(item.dataset.block);
  if (!Number.isInteger(ci) || !Number.isInteger(bi)) return;
  searchResults.classList.remove('on');
  if (!app.singleChain && !(app.mode === 'chain' && app.selectedChain === ci)) enterChainMode(ci);
  const rec = getPickRecord(ci, bi);
  if (rec) selectBlock(rec);
  else {
    app.selectedChain = ci;
    app.selectedBlock = bi;
    renderAllBlocks();
    setTimeout(() => {
      const nextRec = getPickRecord(ci, bi);
      if (nextRec) selectBlock(nextRec);
    }, 0);
  }
});
function renderSearchResults() {
  const q = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = '';
  if (!q) {
    searchResults.classList.remove('on');
    return;
  }
  const hits = [];
  for (let ci = 0; ci < app.chains.length; ci++) {
    const chain = app.chains[ci];
    for (let bi = 0; bi < chain.blocks.length; bi++) {
      const b = chain.blocks[bi];
      if (isAirPlaceholderBlock(b)) continue;
      const cmd = String(b.cmd || ''),
        note = String(b.note || '');
      if (cmd.toLowerCase().includes(q) || note.toLowerCase().includes(q)) {
        hits.push({ ci, bi, b });
      }
      if (hits.length >= 80) break;
    }
    if (hits.length >= 80) break;
  }
  if (!hits.length) {
    searchResults.innerHTML = '<div class="search-empty">没有找到匹配内容</div>';
    searchResults.classList.add('on');
    return;
  }
  for (const h of hits) {
    const item = document.createElement('div');
    item.className = 'search-result';
    item.dataset.chain = String(h.ci);
    item.dataset.block = String(h.bi);
    item.innerHTML = `<div class="search-result-meta">链${h.ci + 1} #${h.bi}</div><div class="search-result-text">${escapeHtml(h.b.cmd || h.b.note || '')}</div>`;
    searchResults.appendChild(item);
  }
  searchResults.classList.add('on');
}
searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('on', !!searchInput.value);
  renderSearchResults();
});
searchInput.addEventListener('focus', () => {
  searchInput.placeholder = '搜索命令或注释';
  if (searchInput.value) renderSearchResults();
});
searchInput.addEventListener('blur', () => {
  searchInput.placeholder = '搜索命令或...';
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    searchClear.classList.remove('on');
    searchResults.classList.remove('on');
    searchInput.blur();
  }
});
searchClear.onclick = () => {
  searchInput.value = '';
  searchClear.classList.remove('on');
  searchResults.classList.remove('on');
  searchInput.focus();
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap') && !e.target.closest('#searchResults'))
    searchResults.classList.remove('on');
});

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
async function handleFile(file) {
  if (!file) {
    toast('没有选择文件', 'err');
    return;
  }
  if (Number.isFinite(file.size) && file.size > MAX_IMPORT_BYTES) {
    toast(`文件超过 ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB 的导入上限，已取消读取`, 'err', 6000);
    return;
  }
  setCurrentAction('导入结构文件');
  logInfo(`开始读取 ${file.name}`, '导入结构文件');
  try {
    const buf = await file.arrayBuffer();
    logInfo(`文件读取完成：${buf.byteLength} 字节`, '导入结构文件');
    await loadMcstructure(file, buf);
    const physicalCount = app.chains.reduce(
      (n, c) => n + c.blocks.filter((b) => !isAirPlaceholderBlock(b)).length,
      0
    );
    const auxiliaryCount = app.chains.reduce((n, c) => n + c.blocks.filter((b) => !!b.isAuxiliary).length, 0);
    logOk(
      `导入完成：${app.chains.length} 条链，共 ${physicalCount} 个命令方块${auxiliaryCount ? `，其中辅助方块 ${auxiliaryCount} 个` : ''}`,
      '导入结构文件'
    );
  } catch (e) {
    logError(e?.stack || e?.message || String(e), '导入结构文件');
    toast('加载失败：' + e.message, 'err');
  } finally {
    setCurrentAction('空闲');
  }
}
function hasCurrentChain() {
  return app.mode === 'chain' && app.selectedChain >= 0 && app.selectedChain < app.chains.length;
}
function getReplaceMatches(find, scope) {
  if (!find) return [];
  if (scope === 'current' && !hasCurrentChain()) return [];
  const list = [];
  const start = scope === 'current' ? app.selectedChain : 0;
  const end = scope === 'current' ? app.selectedChain + 1 : app.chains.length;
  for (let ci = start; ci < end; ci++)
    for (let bi = 0; bi < app.chains[ci].blocks.length; bi++) {
      const b = app.chains[ci].blocks[bi];
      if (String(b.cmd || '').includes(find)) list.push({ ci, bi });
    }
  return list;
}
function getReplaceEmptyResultCount(find, replacement, scope) {
  if (!find) return 0;
  return getReplaceMatches(find, scope).filter(({ ci, bi }) => {
    const cmd = String(app.chains[ci]?.blocks?.[bi]?.cmd ?? '');
    return cmd.split(find).join(replacement).trim() === '' && cmd.trim() !== '';
  }).length;
}
function updateReplacePreview() {
  const find = document.getElementById('replaceFind')?.value || '';
  const replacement = document.getElementById('replaceWith')?.value || '';
  const scope = document.querySelector('input[name="replaceScope"]:checked')?.value || 'all';
  const hits = getReplaceMatches(find, scope);
  const el = document.getElementById('replacePreview');
  if (!el) return;
  if (scope === 'current' && !hasCurrentChain()) {
    el.textContent = '请先进入一条链后再使用“当前链”';
    return;
  }
  if (!find) {
    el.textContent = '输入查找内容后会显示匹配数量';
    return;
  }
  const empties = getReplaceEmptyResultCount(find, replacement, scope);
  el.textContent = `匹配 ${hits.length} 个物理命令方块${empties ? `；${empties} 个替换后将成为空命令方块（仍保留节点）` : ''}`;
}
function openReplaceModal() {
  const m = document.getElementById('replaceModal');
  if (!m) return;
  rememberModalFocus('replaceModal');
  const current = document.querySelector('input[name="replaceScope"][value="current"]');
  if (current) {
    current.disabled = !hasCurrentChain();
    if (current.disabled) {
      const all = document.querySelector('input[name="replaceScope"][value="all"]');
      if (all) all.checked = true;
    }
  }
  document.getElementById('replaceFind').value = '';
  document.getElementById('replaceWith').value = '';
  updateReplacePreview();
  m.classList.add('on');
  m.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('replaceFind')?.focus(), 0);
}
async function applyBatchReplace() {
  setCurrentAction('批量替换命令');
  logInfo('开始批量替换命令', '批量替换命令');
  try {
    const find = document.getElementById('replaceFind').value;
    const rep = document.getElementById('replaceWith').value;
    const scope = document.querySelector('input[name="replaceScope"]:checked')?.value || 'all';
    if (!find) {
      toast('请输入查找内容', 'err');
      return;
    }
    const hits = getReplaceMatches(find, scope);
    if (!hits.length) {
      toast('没有找到匹配命令', 'err');
      return;
    }
    const becomeEmpty = getReplaceEmptyResultCount(find, rep, scope);
    if (
      becomeEmpty &&
      !(await showPromptModal(
        `本次替换会让 ${becomeEmpty} 个命令变为空命令方块，但会保留这些物理节点和它们的朝向。确定继续吗？`,
        { title: '确认批量替换', confirmText: '继续替换', cancelText: '取消' }
      ))
    )
      return;
    const nextChains = cloneChains(app.chains);
    for (const h of hits) {
      const b = nextChains[h.ci].blocks[h.bi];
      b.cmd = String(b.cmd || '')
        .split(find)
        .join(rep);
    }
    reflowChainsForSize(nextChains);
    ensureStructureSize(nextChains, '批量替换后结构');
    app.chains = nextChains;
    pushHistory();
    refreshChainsUI();
    closeFeatureModal('replaceModal');
    toast(`已替换 ${hits.length} 个物理节点${becomeEmpty ? `，其中 ${becomeEmpty} 个为空命令` : ''}`, 'ok');
    logOk(`完成替换：${hits.length} 个物理节点，其中 ${becomeEmpty} 个成为空命令`, '批量替换命令');
  } catch (e) {
    logError(e?.stack || e?.message || String(e), '批量替换命令');
    toast('替换失败：' + (e?.message || String(e)), 'err');
  } finally {
    setCurrentAction('空闲');
  }
}

document.getElementById('backBtn').onclick = async () => {
  const confirmed = await showPromptModal('退出当前结构的编辑？未导出的修改会保留在当前页面历史中。', {
    title: '退出编辑',
    confirmText: '退出',
    cancelText: '继续编辑',
    kind: 'modal'
  });
  if (!confirmed) return;
  saveCamera();
  document.getElementById('uploadView').classList.add('on');
  document.getElementById('editorView').classList.remove('on');
  fileInput.value = '';
  clearAutosave();
  app.savedHistoryIndex = app.historyIndex;
  syncSavedState();
};
const uploadError = document.getElementById('uploadError');
const uploadErrorText = document.getElementById('uploadErrorText');
const uploadSelected = document.getElementById('uploadSelected');
const uploadSelectedName = document.getElementById('uploadSelectedName');
const uploadSelectedSize = document.getElementById('uploadSelectedSize');
const uploadRemove = document.getElementById('uploadRemove');
const uploadReselect = document.getElementById('uploadReselect');
const uploadLoad = document.getElementById('uploadLoad');
let stagedUpload = null;

function formatUploadSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024,
    index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return value.toFixed(value >= 10 ? 1 : 2) + ' ' + units[index];
}

function clearUploadError() {
  uploadError?.classList.remove('is-visible');
  dropzone.classList.remove('is-error');
}

function showUploadError(message) {
  if (uploadErrorText) uploadErrorText.textContent = message;
  uploadError?.classList.add('is-visible');
  dropzone.classList.add('is-error');
}

function stageUpload(file) {
  if (!file) return;
  clearUploadError();
  if (!/\.mcstructure$/i.test(file.name)) {
    showUploadError(`不支持的文件类型 "${file.name}"，请选择 .mcstructure 文件`);
    return;
  }
  stagedUpload = file;
  uploadSelectedName.textContent = file.name;
  uploadSelectedSize.textContent = formatUploadSize(file.size);
  dropzone.hidden = true;
  uploadSelected.classList.add('is-visible');
}

function resetUploadBox() {
  stagedUpload = null;
  fileInput.value = '';
  clearUploadError();
  dropzone.hidden = false;
  dropzone.classList.remove('is-dragover');
  uploadSelected.classList.remove('is-visible');
  uploadSelectedName.textContent = '';
  uploadSelectedSize.textContent = '';
}

async function loadStagedUpload() {
  if (!stagedUpload) return;
  uploadLoad.disabled = true;
  const label = uploadLoad.textContent;
  uploadLoad.textContent = '加载中…';
  try {
    await handleFile(stagedUpload);
  } finally {
    uploadLoad.disabled = false;
    uploadLoad.textContent = label;
  }
}

dropzone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.add('is-dragover');
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.add('is-dragover');
});
dropzone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('is-dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('is-dragover');
  const f = e.dataTransfer?.files?.[0];
  if (f) stageUpload(f);
});
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) stageUpload(f);
});
uploadRemove.addEventListener('click', resetUploadBox);
uploadReselect.addEventListener('click', () => {
  resetUploadBox();
  fileInput.click();
});
uploadLoad.addEventListener('click', loadStagedUpload);
const uploadView = document.getElementById('uploadView');
if (uploadView) {
  new MutationObserver(() => {
    if (uploadView.classList.contains('on')) resetUploadBox();
  }).observe(uploadView, { attributes: true, attributeFilter: ['class'] });
}

document.querySelectorAll('[data-preset]').forEach((b) => {
  b.onclick = () => setViewPreset(b.dataset.preset);
});
document.getElementById('undoBtn').onclick = undo;
document.getElementById('redoBtn').onclick = redo;
document.getElementById('exitChainBtn').onclick = () => exitChainMode();

async function exportCommandChains(choice) {
  closeFeatureModal('exportFormatModal');
  const formats = choice === 'both' ? [1, 2, 3] : [choice === 'old' ? 1 : choice === 'netease' ? 3 : 2];
  const labels = formats.map((v) => (v === 1 ? '旧版' : v === 2 ? '新版' : '网易版'));
  const suffix = (v) => (v === 1 ? 'old' : v === 2 ? 'new' : 'netease');
  let layouts;
  try {
    layouts = buildExportLayouts(app.chains);
    if (!layouts.some((layout) => layout.blocks.some((b) => !isAirPlaceholderBlock(b))))
      throw new Error('没有命令方块');
  } catch (e) {
    toast('导出失败：' + e.message, 'err');
    logError(e?.stack || e?.message || String(e), '导出命令链结构');
    return;
  }
  const filesToCreate = [];
  for (let fi = 0; fi < formats.length; fi++) {
    const batchId = rand6();
    for (let li = 0; li < layouts.length; li++) {
      const partSuffix = layouts.length > 1 ? `-part${li + 1}` : '';
      const name = `${app.fileName}${batchId}${partSuffix}-${suffix(formats[fi])}.mcstructure`;
      filesToCreate.push({ format: formats[fi], label: labels[fi], layout: layouts[li], name, part: li + 1 });
    }
  }
  const dimensions = layouts
    .map(
      (layout) =>
        `第 ${layout.part} 个：${layout.spanX}×${layout.sizeY}×${layout.sizeZ}（${layout.chainCount} 条链）`
    )
    .join('\n');
  const exportNotice = `导出说明：将生成 ${layouts.length} 个独立结构，每个结构的 X/Y/Z 尺寸均不超过 ${MAX_STRUCTURE_SIZE} 格。每条命令链先按编辑器规则完整摆放，超过 32 格的长链继续按原规则堆叠到 Y 层；只有全部链摆放完成后，整体 X 尺寸超过 64 格时，才会在链与链之间拆分为多个结构，绝不会截断单条链。${formats.length > 1 ? `\n\n导出格式：${labels.join('、')}。` : ''}\n\n结构分组：\n${dimensions}\n\n文件列表：\n${filesToCreate.map((file) => file.name).join('\n')}\n\n导出文件只保留本编辑器识别并编辑的命令链方块，不包含原结构中的普通方块、实体及其他非命令方块。\n\n确定继续导出吗？`;
  if (
    !(await showPromptModal(exportNotice, {
      title: '导出说明',
      confirmText: '确认导出',
      cancelText: '取消',
      kind: 'modal'
    }))
  )
    return;
  setCurrentAction('导出命令链结构');
  logInfo(`开始构建${labels.join('、')}格式导出结构，共 ${layouts.length} 个分片`, '导出命令链结构');
  try {
    const files = [];
    for (const item of filesToCreate) {
      const bytes = await serializeOutputForFormat(item.format, item.layout, {
        originalRoot: app.originalRoot,
        sourceOrigin: app.sourceOrigin
      });
      files.push({ name: item.name, bytes });
    }
    for (const file of files)
      download(new Blob([file.bytes], { type: 'application/octet-stream' }), file.name);
    toast(`已导出 ${files.length} 个文件（${layouts.length} 个结构分片）`, 'ok');
    logOk('导出完成：' + files.map((f) => f.name).join('；'), '导出命令链结构');
    app.savedHistoryIndex = app.historyIndex;
    syncSavedState();
    clearAutosave();
  } catch (e) {
    logError(e?.stack || e?.message || String(e), '导出命令链结构');
    toast('导出失败：' + e.message, 'err');
  } finally {
    setCurrentAction('空闲');
  }
}

document.getElementById('infoClose').onclick = () => deselect();

(function setupFeatureBindings() {
  document.getElementById('usageHelpBtn').onclick = openUsageHelp;
  document.getElementById('usageHelpClose').onclick = () => closeFeatureModal('usageHelpModal');
  const supportModal = document.getElementById('supportModal');
  document.getElementById('supportOpen')?.addEventListener('click', () => {
    if (!supportModal) return;
    rememberModalFocus('supportModal');
    supportModal.classList.add('on');
    supportModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => document.getElementById('supportClose')?.focus(), 0);
  });
  document.getElementById('supportClose')?.addEventListener('click', () => closeFeatureModal('supportModal'));
  supportModal?.addEventListener('click', (e) => {
    if (e.target === supportModal) closeFeatureModal('supportModal');
  });
  document.getElementById('usageHelpModal').addEventListener('click', (e) => {
    if (e.target.id === 'usageHelpModal') closeFeatureModal('usageHelpModal');
  });
  document.getElementById('diagnoseBtn').onclick = openLogs;
  document.getElementById('logCopy').onclick = copyLogs;
  document.getElementById('diagnosticClose').onclick = () => closeFeatureModal('diagnosticModal');
  document.getElementById('diagnosticModal').addEventListener('click', (e) => {
    if (e.target.id === 'diagnosticModal') closeFeatureModal('diagnosticModal');
  });
  document.getElementById('replaceBtn').onclick = openReplaceModal;
  document.getElementById('exportOldBtn').onclick = () => exportCommandChains('old');
  document.getElementById('exportNewBtn').onclick = () => exportCommandChains('new');
  document.getElementById('exportNetEaseBtn').onclick = () => exportCommandChains('netease');
  document.getElementById('exportBothBtn').onclick = () => exportCommandChains('both');
  document.getElementById('promptModal').addEventListener('click', (e) => {
    if (e.target.id === 'promptModal') document.getElementById('promptModalCancel').click();
  });
  document.getElementById('replaceClose').onclick = () => closeFeatureModal('replaceModal');
  document.getElementById('replaceCancel').onclick = () => closeFeatureModal('replaceModal');
  document.getElementById('replaceApply').onclick = applyBatchReplace;
  document.getElementById('replaceFind').addEventListener('input', updateReplacePreview);
  document.getElementById('replaceWith').addEventListener('input', updateReplacePreview);
  document
    .querySelectorAll('input[name="replaceScope"]')
    .forEach((r) => r.addEventListener('change', updateReplacePreview));
  document.getElementById('replaceModal').addEventListener('click', (e) => {
    if (e.target.id === 'replaceModal') closeFeatureModal('replaceModal');
  });
})();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const addModal = document.getElementById('chainAddModal');
    if (addModal && addModal.classList.contains('on')) {
      closeChainAddModal();
      return;
    }
    for (const id of [
      'usageHelpModal',
      'diagnosticModal',
      'replaceModal',
      'exportFormatModal',
      'supportModal',
      'promptModal'
    ]) {
      const m = document.getElementById(id);
      if (m && m.classList.contains('on')) {
        if (id === 'promptModal') document.getElementById('promptModalCancel').click();
        else closeFeatureModal(id);
        return;
      }
    }
    if (app.mode === 'chain' && !app.singleChain) exitChainMode();
    return;
  }
  if (!isInputFocused() && app.mode === 'chain' && (e.key === '[' || e.key === ']')) {
    e.preventDefault();
    cycleBlock(e.key === ']' ? 1 : -1);
    return;
  }
  // Let native text-editing shortcuts work inside textareas/inputs, and don't
  // mutate a hidden editor while dialogs or the upload screen are active.
  if (isInputFocused()) return;
  if (!document.getElementById('editorView')?.classList.contains('on')) return;
  if (document.querySelector('.feature-modal.on,.chain-add-modal.on')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
    e.preventDefault();
    redo();
  }
});

window.addEventListener('load', () => {
  const bar = document.getElementById('resumeBar');
  try {
    const raw = storageGet(app.autosaveKey);
    const data = raw ? JSON.parse(raw) : null;
    if (
      bar &&
      data &&
      Array.isArray(data.chains) &&
      data.chains.length &&
      document.getElementById('uploadView').classList.contains('on')
    )
      bar.hidden = false;
  } catch {}
  document.getElementById('resumeBtn').onclick = () => restoreAutosave();
  document.getElementById('resumeDismiss').onclick = () => {
    clearAutosave();
    app.savedHistoryIndex = app.historyIndex;
    syncSavedState();
  };
  setTimeout(() => {
    const w = document.getElementById('canvasWrap');
    if (w) resizeRenderer();
  }, 100);
});

setupChainAddDialog();
setSceneHandlers({ enterChainMode, afterRender: updateChainBar });

/* Optional globals retained for the workspace shell and console debugging. */
window.app = app;
window.toast = toast;
window.logInfo = logInfo;
window.logError = logError;
window.showInputPopover = showInputPopover;
window.reflowChainsForSize = reflowChainsForSize;
window.ensureStructureSize = ensureStructureSize;
window.renderAllBlocks = renderAllBlocks;
window.updateStats = updateStats;
window.updateChainBar = updateChainBar;
window.selectBlock = selectBlock;
window.pushHistory = pushHistory;
window.deleteChainAt = deleteChainAt;
window.duplicateChainAt = duplicateChainAt;
window.reorderChains = reorderChains;
window.highlightTextEditorLine = highlightTextEditorLine;
