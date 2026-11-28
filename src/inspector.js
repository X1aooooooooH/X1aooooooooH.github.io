import { TYPE_LABEL } from './core/constants.js?v=r51-ai-modules-20261129';
import { icon } from './ui/icons.js?v=r51-ai-modules-20261129';

const elements = new Map();
function byId(id) {
  if (!elements.has(id)) elements.set(id, document.getElementById(id));
  return elements.get(id);
}

export function showInfo(ci, bi, block) {
  const title = byId('inspectorTitle');
  if (title) title.textContent = '#' + bi + ' ' + (TYPE_LABEL[block.blockType] || '命令方块');
  const typeSelect = byId('infoBlockType');
  if (typeSelect) typeSelect.value = block.blockType;
  const markButton = byId('infoMark');
  if (markButton) {
    markButton.innerHTML = icon('block-mark');
    markButton.title = block.marked ? '取消标记' : '标记';
    markButton.setAttribute('aria-label', markButton.title);
    markButton.classList.toggle('active', !!block.marked);
  }
  const condSelect = byId('infoCond');
  const autoSelect = byId('infoAuto');
  if (condSelect) condSelect.value = block.cond ? '1' : '0';
  if (autoSelect) autoSelect.value = block.auto !== 0 ? '1' : '0';
  byId('infoPanel').classList.add('on');
  byId('inspector')?.classList.add('open');
  window.dispatchEvent(new CustomEvent('blockflow:block-edit', { detail: { chain: ci, block: bi } }));
  const command = byId('infoCmd');
  const note = byId('infoNote');
  if (command && document.activeElement !== command) command.value = block.cmd || '';
  if (note && document.activeElement !== note) note.value = block.note || '';
}

export function hideInfo() {
  byId('infoPanel').classList.remove('on');
  byId('inspector')?.classList.remove('open');
  window.dispatchEvent(new CustomEvent('blockflow:block-edit', { detail: null }));
}
