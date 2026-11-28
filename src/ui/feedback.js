import { icon } from './icons.js?v=r51-ai-modules-20261129';
let lastPointerElement = null;
document.addEventListener(
  'pointerdown',
  (event) => {
    const target = event.target?.closest?.('button,a,[role="button"],input,select,textarea');
    if (target) lastPointerElement = target;
  },
  true
);
const modalFocusStack = new Map();

function toast(msg, type, duration) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const item = document.createElement('div');
  item.className = 'toast-stack-item ' + (type || '');
  item.style.setProperty('--toast-life', `${duration || 3000}ms`);
  const message = document.createElement('span');
  message.className = 'toast-stack-message';
  message.textContent = String(msg ?? '');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-stack-close';
  close.setAttribute('aria-label', '关闭提示');
  close.innerHTML = icon('close', 'icon icon-sm');
  item.append(message, close);
  stack.prepend(item);
  while (stack.children.length > 5) stack.lastElementChild.remove();
  const remove = () => {
    if (!item.isConnected || item.classList.contains('out')) return;
    item.classList.remove('in');
    item.classList.add('out');
    setTimeout(() => item.remove(), 260);
  };
  let timer = setTimeout(remove, duration || 3000);
  item._toastRestart = (ms = 1500) => {
    clearTimeout(timer);
    item.style.setProperty('--toast-life', `${ms}ms`);
    timer = setTimeout(remove, ms);
  };
  close.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
  requestAnimationFrame(() => item.classList.add('in'));
  return item;
}

export function undoToast(message, duration = 1500) {
  const stack = document.getElementById('toastStack');
  if (!stack) {
    toast(message, 'warn', duration);
    return;
  }
  const active = stack.querySelector('.toast-stack-item:not(.out)');
  if (active?._toastRestart) {
    // Keep the action that was just undone visible, crossed out, and give it
    // a fresh 1.5s visibility window.
    active.classList.add('is-undone');
    active.style.setProperty('--toast-life', duration + 'ms');
    active._toastRestart(duration);
    const text = active.querySelector('.toast-stack-message')?.textContent || '';
    active.setAttribute('aria-label', '已撤销：' + text);
    return;
  }
  toast(message, 'warn', duration);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function closeFeatureModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('on');
    m.setAttribute('aria-hidden', 'true');
    restoreModalFocus(id);
  }
}

function rememberModalFocus(id) {
  const m = document.getElementById(id);
  if (m) modalFocusStack.set(id, document.activeElement);
}

function modalFocusable(m) {
  return Array.from(
    m?.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    ) || []
  ).filter((el) => el.offsetParent !== null);
}

function restoreModalFocus(id) {
  const el = modalFocusStack.get(id);
  modalFocusStack.delete(id);
  if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0);
}

function setupModalFocusTrap() {
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Tab') return;
      const activeModal = [...document.querySelectorAll('[role="dialog"].on')].pop();
      if (!activeModal) return;
      const items = modalFocusable(activeModal);
      if (!items.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    { capture: true }
  );
}

function positionPopover(card, anchor, width = 360) {
  if (!card) return;
  const margin = 12;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const w = Math.min(width, viewportW - margin * 2);
  const rect = anchor?.getBoundingClientRect?.();
  let left;
  let top;
  if (rect) {
    left = Math.max(margin, Math.min(viewportW - w - margin, rect.left + rect.width / 2 - w / 2));
    top = rect.bottom + 8;
  } else {
    left = (viewportW - w) / 2;
    top = Math.max(24, viewportH * 0.18);
  }
  card.style.width = `${w}px`;
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.classList.remove('above');
  requestAnimationFrame(() => {
    const height = card.getBoundingClientRect().height;
    if (rect && top + height > viewportH - margin) {
      top = Math.max(margin, rect.top - height - 8);
      card.style.top = `${top}px`;
      card.classList.add('above');
    }
  });
}

function showPromptModal(
  message,
  { title = '提示', confirmText = '继续', cancelText = '取消', anchor = null, kind = 'popconfirm' } = {}
) {
  const modal = document.getElementById('promptModal');
  if (!modal) return Promise.resolve(false);
  document.getElementById('promptModalTitle').textContent = title;
  document.getElementById('promptModalMessage').textContent = String(message ?? '');
  document.getElementById('promptModalConfirm').textContent = confirmText;
  document.getElementById('promptModalCancel').textContent = cancelText;
  rememberModalFocus('promptModal');
  const card = modal.querySelector('.feature-card');
  const isModal = kind === 'modal';
  modal.classList.toggle('popconfirm', !isModal);
  modal.classList.toggle('notice-modal', isModal);
  modal.dataset.noticeKind = isModal ? 'modal' : 'popconfirm';
  if (card) {
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.classList.remove('above');
  }
  modal.classList.add('on');
  modal.setAttribute('aria-hidden', 'false');
  if (!isModal) positionPopover(card, anchor || lastPointerElement || document.activeElement, 360);
  setTimeout(() => document.getElementById('promptModalConfirm')?.focus(), 0);
  return new Promise((resolve) => {
    let settled = false;
    const confirmBtn = document.getElementById('promptModalConfirm');
    const cancelBtn = document.getElementById('promptModalCancel');
    const closeBtn = document.getElementById('promptModalClose');
    const finish = (value) => {
      if (settled) return;
      settled = true;
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      closeFeatureModal('promptModal');
      resolve(value);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
  });
}

function showInputPopover({
  title = '重命名',
  value = '',
  label = '名称',
  confirmText = '保存',
  cancelText = '取消'
} = {}) {
  let modal = document.getElementById('renameModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'renameModal';
    modal.className = 'feature-modal notice-modal rename-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="feature-card rename-card"><div class="feature-head"><div><b id="renameModalTitle">重命名</b><span>输入新的名称</span></div><button id="renameModalClose" class="feature-close" type="button" aria-label="关闭">' +
      icon('close') +
      '</button></div><label class="feature-input-label"><span id="renameModalLabel">名称</span><input id="renameModalInput" type="text" autocomplete="off"></label><div class="feature-actions"><button id="renameModalCancel" class="feature-btn" type="button">取消</button><button id="renameModalConfirm" class="feature-btn primary" type="button">保存</button></div></div>';
    document.body.append(modal);
  }
  document.getElementById('renameModalTitle').textContent = title;
  document.getElementById('renameModalLabel').textContent = label;
  document.getElementById('renameModalConfirm').textContent = confirmText;
  document.getElementById('renameModalCancel').textContent = cancelText;
  const input = document.getElementById('renameModalInput');
  input.value = String(value ?? '');
  modal.classList.add('on');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    input.focus();
    input.select();
  }, 30);
  return new Promise((resolve) => {
    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      modal.classList.remove('on');
      modal.setAttribute('aria-hidden', 'true');
      input.onkeydown = null;
      resolve(result);
    };
    input.onkeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        close(String(input.value || '').trim());
      }
    };
    document.getElementById('renameModalConfirm').onclick = () => close(String(input.value || '').trim());
    document.getElementById('renameModalCancel').onclick = () => close(false);
    document.getElementById('renameModalClose').onclick = () => close(false);
    modal.onclick = (event) => {
      if (event.target === modal) close(false);
    };
  });
}

setupModalFocusTrap();

export {
  toast,
  download,
  closeFeatureModal,
  rememberModalFocus,
  restoreModalFocus,
  showPromptModal,
  showInputPopover
};
