import { app } from '../state.js?v=r51-ai-modules-20261129';
import { aiState } from './state.js?v=r51-ai-modules-20261129';
import { aiToast } from './notify.js?v=r51-ai-modules-20261129';
import { buildContext } from './context.js?v=r51-ai-modules-20261129';
import {
  loadSessionMap,
  saveSessionMap,
  serializeConversations,
  normalizeConversations,
  persistConversations
} from './store.js?v=r51-ai-modules-20261129';
import {
  currentAiFileKey,
  saveActiveDraft,
  ensureChainIds,
  conversationAnchorIndex,
  newConversationId,
  schedulePersist,
  currentConversation
} from './session.js?v=r51-ai-modules-20261129';
import {
  hasKey,
  openSettings,
  closeSettings,
  saveSettings,
  clearSettings,
  testConnection
} from './settings.js?v=r51-ai-modules-20261129';
import { icon } from '../ui/icons.js?v=r51-ai-modules-20261129';
import { renderMarkdown } from '../ui/markdown.js?v=r51-ai-modules-20261129';
import { showPromptModal, showInputPopover } from '../ui/feedback.js?v=r51-ai-modules-20261129';
import { MAX_CONVERSATIONS, SLASH_COMMANDS } from './prompts.js?v=r51-ai-modules-20261129';

const roleLabel = { user: '你', assistant: 'AI', error: '错误' };

let viewActions = {
  sendChat: () => {},
  cancelChat: () => {},
  executeTotalAction: () => {},
  handleMessageAction: () => {}
};

export function configureViewActions(next) {
  viewActions = { ...viewActions, ...next };
}

export function switchAiFileContext(nextKey) {
  if (nextKey === aiState.aiFileKey) return;
  if (aiState.activeChatId) saveActiveDraft();
  const oldKey = aiState.aiFileKey;
  if (oldKey) {
    const map = loadSessionMap();
    if (aiState.conversations.length) map[oldKey] = serializeConversations();
    else delete map[oldKey];
    saveSessionMap(map);
  }
  aiState.aiFileKey = nextKey;
  aiState.activeChatId = null;
  aiState.chat.open = false;
  aiState.chat.busy = false;
  aiState.chat.queue = [];
  aiState.chat.attachments = [];
  if (aiState.chat.controller) {
    try {
      aiState.chat.controller.abort();
    } catch {}
    aiState.chat.controller = null;
  }
  if (aiState.ui) {
    renderChatAttachments();
    renderChatQueue();
    aiState.ui.chat.classList.remove('on');
    aiState.ui.chat.setAttribute('aria-hidden', 'true');
    aiState.ui.chatCard.classList.remove('history-open');
    aiState.ui.send.disabled = false;
    aiState.ui.send.textContent = '发送';
    if (aiState.ui.cancel) aiState.ui.cancel.hidden = true;
    aiState.ui.status.textContent = '';
  }
  const map = loadSessionMap();
  aiState.conversations = nextKey ? normalizeConversations(map[nextKey]) : [];
  renderConversationList();
}

export function ensureAiFileContext() {
  const key = currentAiFileKey();
  if (key !== aiState.aiFileKey) switchAiFileContext(key);
}

export function discardEmptyActiveConversation() {
  const conv = currentConversation();
  if (!conv || (conv.messages || []).length > 0) return false;
  aiState.conversations = aiState.conversations.filter((c) => c.id !== conv.id);
  aiState.activeChatId = null;
  persistConversations();
  renderConversationList();
  return true;
}

export function ensureUi() {
  if (aiState.ui) return aiState.ui;
  if (!document.body) return null;

  const settings = document.createElement('div');
  settings.id = 'aiSettingsModal';
  settings.className = 'ai-modal';
  settings.setAttribute('role', 'dialog');
  settings.setAttribute('aria-modal', 'true');
  settings.setAttribute('aria-hidden', 'true');
  settings.innerHTML = `
      <div class="ai-card ai-settings-card" role="document">
        <div class="ai-card-head">
          <div><b>AI 设置</b><span>使用你自己的 API Key。Key 只保存在当前浏览器，不会上传到 BlockFlow 站点。</span></div>
          <button class="ai-icon-btn" type="button" data-ai-close-settings aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="ai-settings-body">
          <label class="ai-field"><span>API Key</span><input id="aiKeyInput" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..."></label>
          <label class="ai-field"><span>模型</span><select id="aiModelInput"></select></label>
          <label class="ai-field" id="aiModelCustomField" hidden><span>自定义模型 ID</span><input id="aiModelCustom" type="text" spellcheck="false" placeholder="输入模型 ID"></label>
          <label class="ai-field"><span>推理</span><span class="ai-checkbox-line"><input id="aiReasoning" type="checkbox"> 开启推理（reasoning_effort）</span></label>
          <label class="ai-field"><span>推理等级</span><select id="aiReasoningLevel"><option value="low">Low</option><option value="high">High</option><option value="max">Max</option></select></label>
          <details class="ai-advanced">
            <summary>高级设置：Base URL 与输出上限</summary>
            <label class="ai-field" style="margin-top:10px"><span>Base URL</span><input id="aiBaseInput" type="url" spellcheck="false" placeholder="https://api.deepseek.com/v1"></label>
            <label class="ai-field"><span>最大输出 Token（留空 = 不限制）</span><input id="aiMaxTokens" type="number" min="1" step="1" placeholder="留空由服务商/模型决定"></label>
          </details>
          <p class="ai-warn">请使用单独的低额度 Key，并设置消费上限。静态页面无法防止浏览器扩展、XSS 或恶意脚本读取本地存储；不要在不可信页面输入主账号 Key。</p>
          <div id="aiTestStatus" class="ai-test-status" role="status"></div>
        </div>
        <div class="ai-card-foot">
          <button class="ai-btn danger" type="button" data-ai-clear>清除设置</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="ai-btn" type="button" data-ai-test>测试连接</button><button class="ai-btn" type="button" data-ai-close-settings>取消</button><button class="ai-btn primary" type="button" data-ai-save>保存</button></div>
        </div>
      </div>`;
  document.body.appendChild(settings);

  const chatModal = document.createElement('div');
  chatModal.id = 'aiChatModal';
  chatModal.className = 'ai-modal ai-chat-modal';
  chatModal.setAttribute('role', 'dialog');
  chatModal.setAttribute('aria-modal', 'true');
  chatModal.setAttribute('aria-hidden', 'true');
  chatModal.innerHTML = `
      <div class="ai-card ai-chat-card" role="document">
        <div class="ai-chat-layout">
          <aside class="ai-chat-side" aria-label="历史对话">
            <div class="ai-chat-side-head">
              <b>对话</b>
              <div class="ai-side-head-actions">
                <button class="ai-side-icon" type="button" data-ai-new-chat title="新建对话" aria-label="新建对话">${icon('plus')}</button>
                <button class="ai-side-icon" type="button" data-ai-import title="导入会话" aria-label="导入会话">${icon('download')}</button>
                <button class="ai-side-icon" type="button" data-ai-export title="导出会话" aria-label="导出会话">${icon('upload')}</button>
                <button class="ai-side-icon" type="button" data-ai-hide-side title="隐藏侧边栏" aria-label="隐藏侧边栏">${icon('chevron-left')}</button>
              </div>
            </div>
            <div id="aiChatList" class="ai-chat-list"></div>
            <div class="ai-chat-side-foot">
              <button class="ai-side-settings" type="button" data-ai-settings title="设置" aria-label="设置">${icon('settings')}</button>
              <input id="aiImportInput" type="file" hidden>
            </div>
          </aside>
          <section class="ai-chat-main">
            <div class="ai-card-head">
              <div><div class="ai-chat-title-row"><b id="aiChatTitle">AI 阅读</b><button class="ai-show-side-btn" type="button" data-ai-show-side title="显示侧边栏" aria-label="显示侧边栏" hidden>${icon('menu')}</button></div><span id="aiChatSubtitle">加载内置技能中…</span></div>
              <div class="ai-chat-head-actions">
                <button class="ai-btn ai-history-btn" type="button" data-ai-history>历史</button>
                <button class="ai-icon-btn" type="button" data-ai-close-chat aria-label="关闭">${icon('close')}</button>
              </div>
            </div>
            <div id="aiChatMessages" class="ai-chat-messages" aria-live="polite"></div>
            <div class="ai-chat-compose">
              <div id="aiSlashMenu" class="ai-slash-menu" hidden></div>
              <div id="aiChatQueue" class="ai-chat-queue" hidden></div>
              <div id="aiChatAttachments" class="ai-chat-attachments" hidden></div>
              <div class="ai-chat-input-wrap">
                <div class="ai-chat-input-shell">
                  <button id="aiChatAttach" class="ai-chat-attach" type="button" title="提交文本文件给 AI" aria-label="提交文件">${icon('plus')}</button>
                  <textarea id="aiChatInput" class="ai-chat-input" rows="1" placeholder="继续提问，例如：这条链有什么逻辑风险？" spellcheck="false"></textarea>
                </div>
                <button id="aiChatCancel" class="ai-chat-cancel" type="button" hidden>取消</button>
                <button id="aiChatSend" class="ai-chat-send" type="button">发送</button>
              </div>
              <input id="aiChatFileInput" type="file" multiple hidden>
              <div class="ai-chat-hint"><span id="aiChatStatus" class="ai-chat-status"></span></div>
            </div>
          </section>
        </div>
      </div>`;
  document.body.appendChild(chatModal);

  aiState.ui = {
    settings,
    chat: chatModal,
    chatCard: chatModal.querySelector('.ai-chat-card'),
    keyInput: settings.querySelector('#aiKeyInput'),
    baseInput: settings.querySelector('#aiBaseInput'),
    maxTokens: settings.querySelector('#aiMaxTokens'),
    modelInput: settings.querySelector('#aiModelInput'),
    modelCustom: settings.querySelector('#aiModelCustom'),
    modelCustomField: settings.querySelector('#aiModelCustomField'),
    reasoning: settings.querySelector('#aiReasoning'),
    reasoningLevel: settings.querySelector('#aiReasoningLevel'),
    testBtn: settings.querySelector('[data-ai-test]'),
    testStatus: settings.querySelector('#aiTestStatus'),
    messages: chatModal.querySelector('#aiChatMessages'),
    list: chatModal.querySelector('#aiChatList'),
    input: chatModal.querySelector('#aiChatInput'),
    slashMenu: chatModal.querySelector('#aiSlashMenu'),
    send: chatModal.querySelector('#aiChatSend'),
    cancel: chatModal.querySelector('#aiChatCancel'),
    attach: chatModal.querySelector('#aiChatAttach'),
    fileInput: chatModal.querySelector('#aiChatFileInput'),
    importInput: chatModal.querySelector('#aiImportInput'),
    attachments: chatModal.querySelector('#aiChatAttachments'),
    queue: chatModal.querySelector('#aiChatQueue'),
    title: chatModal.querySelector('#aiChatTitle'),
    subtitle: chatModal.querySelector('#aiChatSubtitle'),
    showSide: chatModal.querySelector('[data-ai-show-side]'),
    status: chatModal.querySelector('#aiChatStatus')
  };

  settings
    .querySelectorAll('[data-ai-close-settings]')
    .forEach((b) => b.addEventListener('click', closeSettings));
  settings.querySelector('[data-ai-save]').addEventListener('click', saveSettings);
  settings.querySelector('[data-ai-clear]').addEventListener('click', clearSettings);
  aiState.ui.testBtn.addEventListener('click', testConnection);
  settings.addEventListener('click', (e) => {
    if (e.target === settings) closeSettings();
  });
  aiState.ui.modelInput.addEventListener('change', () => {
    updateCustomModelField();
    updateReasoningForModel();
  });

  chatModal.querySelector('[data-ai-close-chat]').addEventListener('click', closeChat);
  chatModal.querySelector('[data-ai-settings]').addEventListener('click', openSettings);
  chatModal.querySelector('[data-ai-new-chat]').addEventListener('click', () => newChat());
  chatModal.querySelector('[data-ai-history]').addEventListener('click', () => {
    if (aiState.ui && aiState.ui.chatCard) aiState.ui.chatCard.classList.toggle('history-open');
  });
  chatModal.querySelector('[data-ai-export]').addEventListener('click', exportActiveConversation);
  chatModal.querySelector('[data-ai-import]').addEventListener('click', () => aiState.ui.importInput.click());
  chatModal.querySelector('[data-ai-hide-side]').addEventListener('click', () => toggleChatSidebar(true));
  aiState.ui.showSide.addEventListener('click', () => toggleChatSidebar(false));
  aiState.ui.importInput.addEventListener('change', async () => {
    await importConversationFile(aiState.ui.importInput.files && aiState.ui.importInput.files[0]);
    aiState.ui.importInput.value = '';
  });

  aiState.ui.cancel.addEventListener('click', viewActions.cancelChat);
  aiState.ui.attach.addEventListener('click', () => aiState.ui.fileInput.click());
  aiState.ui.fileInput.addEventListener('change', async () => {
    await addChatAttachments([...aiState.ui.fileInput.files]);
    aiState.ui.fileInput.value = '';
  });
  aiState.ui.attachments.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-ai-attachment-remove]');
    if (!remove) return;
    aiState.chat.attachments.splice(Number(remove.dataset.aiAttachmentRemove), 1);
    renderChatAttachments();
  });
  chatModal.addEventListener('click', (e) => {
    if (e.target === chatModal) closeChat();
  });
  aiState.ui.messages.addEventListener('scroll', () => {
    if (aiState.chat.rendering) return;
    const el = aiState.ui.messages;
    aiState.chat.scrollStick = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
  });
  aiState.ui.send.addEventListener('click', () => viewActions.sendChat(aiState.ui.input.value));
  aiState.ui.messages.addEventListener('click', (e) => {
    const total = e.target.closest('[data-ai-total-action]');
    if (total) {
      const wrap = total.closest('[data-ai-message-index]');
      const messageIndex = Number(wrap && wrap.dataset.aiMessageIndex);
      if (Number.isInteger(messageIndex)) viewActions.executeTotalAction(messageIndex);
      return;
    }
    const btn = e.target.closest('[data-ai-message-action]');
    if (!btn) return;
    const wrap = btn.closest('[data-ai-message-index]');
    const index = Number(wrap && wrap.dataset.aiMessageIndex);
    if (!Number.isInteger(index)) return;
    viewActions.handleMessageAction(btn.dataset.aiMessageAction, index);
  });
  aiState.ui.slashMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-ai-slash-command]');
    if (item) insertSlash('/' + item.dataset.aiSlashCommand + ' ');
  });
  aiState.ui.input.addEventListener('input', () => {
    aiState.chat.draft = aiState.ui.input.value;
    resizeInput();
    updateSlashMenu();
    if (aiState.ui) aiState.ui.list && schedulePersist();
  });
  aiState.ui.input.addEventListener('keydown', (e) => {
    if (aiState.ui && aiState.ui.slashMenu && !aiState.ui.slashMenu.hidden) {
      if (e.key === 'Tab' || e.key === 'Enter') {
        const active =
          aiState.ui.slashMenu.querySelector('.active') || aiState.ui.slashMenu.querySelector('[data-ai-slash-command]');
        if (active) {
          e.preventDefault();
          insertSlash('/' + active.dataset.aiSlashCommand + ' ');
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideSlashMenu();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveSlashSelection(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      viewActions.sendChat(aiState.ui.input.value);
    }
  });
  return aiState.ui;
}

export function resizeInput() {
  if (!aiState.ui || !aiState.ui.input) return;
  aiState.ui.input.style.height = 'auto';
  aiState.ui.input.style.height = Math.min(120, Math.max(46, aiState.ui.input.scrollHeight)) + 'px';
}

export async function addChatAttachments(files) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return;
  if (aiState.chat.attachments.length + list.length > 5) {
    aiToast('最多同时提交 5 个文本文件', 'warn');
    return;
  }
  for (const file of list) {
    if (!file) continue;
    if (file.size > 200 * 1024) {
      aiToast(`文件过大：${file.name}（单个最大 200KB）`, 'warn');
      continue;
    }
    try {
      const text = await file.text();
      if (text.includes('\u0000')) {
        aiToast(`不是文本文件：${file.name}`, 'err');
        continue;
      }
      if (text.length > 200000) {
        aiToast(`文件内容过长：${file.name}`, 'warn');
        continue;
      }
      aiState.chat.attachments.push({ name: file.name, size: file.size, type: file.type || '', text });
    } catch (err) {
      aiToast(`读取文件失败：${file.name}`, 'err');
    }
  }
  renderChatAttachments();
}

export function renderChatAttachments() {
  if (!aiState.ui || !aiState.ui.attachments) return;
  aiState.ui.attachments.replaceChildren();
  if (!aiState.chat.attachments.length) {
    aiState.ui.attachments.hidden = true;
    return;
  }
  aiState.ui.attachments.hidden = false;
  aiState.chat.attachments.forEach((file, index) => {
    const chip = document.createElement('span');
    chip.className = 'ai-attachment-chip';
    const name = document.createElement('b');
    name.textContent = file.name;
    const size = document.createElement('small');
    size.textContent = Math.max(1, Math.round(file.size / 1024)) + ' KB';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.aiAttachmentRemove = String(index);
    remove.innerHTML = icon('close');
    remove.title = '移除附件';
    chip.appendChild(name);
    chip.appendChild(size);
    chip.appendChild(remove);
    aiState.ui.attachments.appendChild(chip);
  });
}

export function renderChatQueue() {
  if (!aiState.ui || !aiState.ui.queue) return;
  aiState.ui.queue.replaceChildren();
  if (!aiState.chat.queue.length) {
    aiState.ui.queue.hidden = true;
    return;
  }
  aiState.ui.queue.hidden = false;
  const text = document.createElement('span');
  text.textContent = `待发送 ${aiState.chat.queue.length} 条：`;
  aiState.ui.queue.appendChild(text);
  aiState.chat.queue.forEach((item, index) => {
    const chip = document.createElement('span');
    chip.className = 'ai-queue-chip';
    const content = typeof item === 'string' ? item : item.text || '[附件]';
    chip.textContent = `${index + 1}. ${String(content).replace(/\s+/g, ' ').slice(0, 32)}`;
    aiState.ui.queue.appendChild(chip);
  });
}

export function hideSlashMenu() {
  if (aiState.ui && aiState.ui.slashMenu) {
    aiState.ui.slashMenu.hidden = true;
    aiState.ui.slashMenu.replaceChildren();
  }
}

export function updateSlashMenu() {
  if (!aiState.ui || !aiState.ui.input || !aiState.ui.slashMenu) return;
  const value = aiState.ui.input.value;
  if (!value.startsWith('/') || value.includes('\n')) {
    hideSlashMenu();
    return;
  }
  const query = value.slice(1).toLowerCase();
  const matches = SLASH_COMMANDS.filter(
    (item) => item.command.toLowerCase().startsWith(query) || item.hint.toLowerCase().includes(query)
  ).slice(0, 12);
  if (!matches.length) {
    hideSlashMenu();
    return;
  }
  aiState.ui.slashMenu.replaceChildren();
  matches.forEach((item, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.aiSlashCommand = item.command;
    btn.className = 'ai-slash-item' + (index === 0 ? ' active' : '');
    const b = document.createElement('b');
    b.textContent = '/' + item.command;
    const span = document.createElement('span');
    span.textContent = item.hint;
    btn.appendChild(b);
    btn.appendChild(span);
    aiState.ui.slashMenu.appendChild(btn);
  });
  aiState.ui.slashMenu.hidden = false;
}

export function moveSlashSelection(delta) {
  if (!aiState.ui || !aiState.ui.slashMenu) return;
  const items = [...aiState.ui.slashMenu.querySelectorAll('[data-ai-slash-command]')];
  if (!items.length) return;
  let index = items.findIndex((x) => x.classList.contains('active'));
  if (index < 0) index = 0;
  items[index].classList.remove('active');
  index = (index + delta + items.length) % items.length;
  items[index].classList.add('active');
  try {
    items[index].scrollIntoView({ block: 'nearest' });
  } catch {}
}

export function insertSlash(text) {
  if (!aiState.ui || !aiState.ui.input) return;
  aiState.ui.input.value = text;
  aiState.chat.draft = text;
  resizeInput();
  hideSlashMenu();
  try {
    aiState.ui.input.focus();
    aiState.ui.input.setSelectionRange(text.length, text.length);
  } catch {}
  schedulePersist();
}

export function presetPrompt(scope) {
  return scope === 'text'
    ? '请阅读文本模式中正在编辑的这条命令链，按 skill 的规范分析。重点指出语法问题、逻辑风险、链结构问题，并给出具体修改建议。'
    : scope === 'chain'
      ? '请阅读当前选中的这条命令链，按 skill 的规范分析。重点指出语法问题、逻辑风险、链结构问题，并给出具体修改建议。'
      : '请阅读当前结构的全部命令链，按 skill 的规范分析。重点指出语法问题、逻辑风险、链结构问题，并给出具体修改建议。';
}

export function scopeTitle(scope) {
  return scope === 'text' || scope === 'chain' ? 'AI 阅读分链' : 'AI 阅读全文';
}

export function renderConversationList() {
  if (!aiState.ui) return;
  aiState.ui.list.replaceChildren();
  const sorted = aiState.conversations.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'ai-chat-list-empty';
    empty.textContent = '暂无对话';
    aiState.ui.list.appendChild(empty);
    return;
  }
  const groups = [
    { key: 'all', label: '全文分析', scopes: ['all'] },
    { key: 'chain', label: '分链分析', scopes: ['chain', 'text'] },
    { key: '__other', label: '其他对话', scopes: [] }
  ];
  for (const group of groups) {
    const items = sorted.filter((conv) => {
      const scope = conv.scope || 'all';
      return group.key === '__other'
        ? !['all', 'chain', 'text'].includes(scope)
        : group.scopes.includes(scope);
    });
    if (!items.length) continue;
    const heading = document.createElement('div');
    heading.className = 'ai-chat-group-title';
    heading.textContent = `${group.label} · ${items.length}`;
    aiState.ui.list.appendChild(heading);
    for (const conv of items) {
      const row = document.createElement('div');
      row.className = 'ai-chat-item-row';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ai-chat-item' + (conv.id === aiState.activeChatId ? ' active' : '');
      item.dataset.chatId = conv.id;
      const title = document.createElement('b');
      title.textContent = conv.title || 'AI 对话';
      item.appendChild(title);
      item.addEventListener('click', () => activateConversation(conv.id));
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'ai-chat-item-rename';
      rename.title = '重命名会话';
      rename.setAttribute('aria-label', '重命名会话');
      rename.innerHTML = icon('pencil');
      rename.addEventListener('click', (event) => {
        event.stopPropagation();
        renameConversationById(conv.id, rename);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'ai-chat-item-del';
      del.title = '删除这个会话';
      del.setAttribute('aria-label', '删除这个会话');
      del.innerHTML = icon('close');
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteConversationById(conv.id);
      });
      row.appendChild(item);
      row.appendChild(rename);
      row.appendChild(del);
      aiState.ui.list.appendChild(row);
    }
  }
}

export function showChatModal() {
  if (!aiState.ui) return;
  aiState.chat.open = true;
  aiState.ui.chat.classList.add('on');
  aiState.ui.chat.setAttribute('aria-hidden', 'false');
  aiState.ui.chatCard.classList.remove('history-open');
  renderConversationList();
}

export function loadConversationIntoChat(conv) {
  aiState.activeChatId = conv.id;
  aiState.chat.scope = conv.scope || 'all';
  aiState.chat.chainUid = conv.chainUid || '';
  if (
    aiState.chat.scope === 'chain' &&
    conv.chainUid &&
    typeof app !== 'undefined' &&
    app &&
    Array.isArray(app.chains)
  ) {
    const ci = app.chains.findIndex((c) => c.uid === conv.chainUid);
    if (ci >= 0) conv.subtitle = `链 ${ci + 1} · ${(app.chains[ci].blocks || []).length} 个命令方块`;
  }
  aiState.chat.title = conv.title || scopeTitle(aiState.chat.scope);
  aiState.chat.subtitle = conv.subtitle || '';
  aiState.chat.messages = Array.isArray(conv.messages) ? conv.messages.slice() : [];
  aiState.chat.draft = conv.draft || '';
  aiState.chat.notice = `历史对话 · ${aiState.chat.subtitle || scopeTitle(aiState.chat.scope)}`;
  aiState.chat.attachments = [];
  aiState.chat.queue = [];
  if (aiState.ui) {
    renderChatAttachments();
    renderChatQueue();
    aiState.ui.title.textContent = aiState.chat.title;
    aiState.ui.subtitle.textContent = aiState.chat.subtitle;
    aiState.ui.status.textContent = '';
    aiState.ui.input.value = aiState.chat.draft;
    resizeInput();
  }
  renderChat();
  renderConversationList();
}

export function activateConversation(id) {
  if (!aiState.ui || id === aiState.activeChatId) return;
  if (aiState.chat.busy) {
    if (aiState.chat.controller) {
      try {
        aiState.chat.controller.abort();
      } catch {}
    }
    aiState.chat.busy = false;
    aiState.chat.queue = [];
    aiState.chat.attachments = [];
    renderChatAttachments();
    renderChatQueue();
  }
  discardEmptyActiveConversation();
  saveActiveDraft();
  const conv = aiState.conversations.find((c) => c.id === id);
  if (!conv) return;
  loadConversationIntoChat(conv);
  aiState.ui.chatCard.classList.remove('history-open');
  setTimeout(() => {
    try {
      aiState.ui.input.focus();
    } catch {}
  }, 30);
}

export function createConversation(scope, prompt) {
  ensureUi();
  if (!aiState.ui) return false;
  ensureAiFileContext();
  if (!hasKey()) {
    openSettings();
    aiToast('请先设置 AI API Key', 'warn');
    return false;
  }
  const info = buildContext(scope || 'all');
  if (!info) {
    aiToast('请先导入一个结构文件', 'warn');
    return false;
  }
  discardEmptyActiveConversation();
  if (aiState.activeChatId) saveActiveDraft();
  closeSettings();
  if (aiState.chat.busy && aiState.chat.controller) {
    try {
      aiState.chat.controller.abort();
    } catch {}
  }
  aiState.chat.busy = false;
  aiState.chat.queue = [];
  aiState.chat.attachments = [];
  ensureChainIds();
  const anchorIndex = conversationAnchorIndex(scope || 'all');
  const anchorChain = anchorIndex >= 0 ? app.chains[anchorIndex] : null;
  const conv = {
    id: newConversationId(),
    title: scopeTitle(scope || 'all'),
    subtitle:
      info.scope === 'all'
        ? `全部 ${info.chainCount} 条链 · ${info.commandCount} 个命令方块`
        : info.scope === 'text'
          ? `文本模式 · 链 ${info.chainIndex + 1}`
          : `链 ${info.chainIndex + 1} · ${info.commandCount} 个命令方块`,
    scope: scope || 'all',
    chainUid: anchorChain ? anchorChain.uid : '',
    chainNumber: anchorChain ? anchorIndex + 1 : 0,
    messages: [],
    draft: prompt || presetPrompt(scope || 'all'),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  aiState.conversations.unshift(conv);
  if (aiState.conversations.length > MAX_CONVERSATIONS) aiState.conversations.length = MAX_CONVERSATIONS;
  persistConversations();
  aiState.activeChatId = conv.id;
  aiState.chat.scope = conv.scope;
  aiState.chat.chainUid = conv.chainUid || '';
  aiState.chat.title = conv.title;
  aiState.chat.subtitle = conv.subtitle;
  aiState.chat.messages = conv.messages;
  aiState.chat.draft = conv.draft;
  aiState.chat.notice = `已准备 ${aiState.chat.subtitle}。可修改下方预设问题后点击发送。`;
  showChatModal();
  aiState.ui.title.textContent = aiState.chat.title;
  aiState.ui.subtitle.textContent = aiState.chat.subtitle;
  aiState.ui.status.textContent = '';
  aiState.ui.input.value = aiState.chat.draft;
  renderChatAttachments();
  renderChatQueue();
  resizeInput();
  renderChat();
  renderConversationList();
  setTimeout(() => {
    try {
      aiState.ui.input.focus();
      aiState.ui.input.setSelectionRange(0, 0);
    } catch {}
  }, 40);
  return true;
}

export function newChat(scope) {
  const target = scope || (typeof app !== 'undefined' && app && app.mode === 'chain' ? 'chain' : 'all');
  createConversation(target, presetPrompt(target));
}

export async function deleteConversationById(id) {
  const conv = aiState.conversations.find((c) => c.id === id);
  if (!conv) return;
  if (
    !(await showPromptModal(`删除会话「${conv.title || 'AI 对话'}」？`, {
      title: '删除会话',
      confirmText: '删除',
      cancelText: '取消'
    }))
  )
    return;
  const wasActive = id === aiState.activeChatId;
  if (wasActive && aiState.chat.busy && aiState.chat.controller) {
    try {
      aiState.chat.controller.abort();
    } catch {}
    aiState.chat.busy = false;
  }
  aiState.conversations = aiState.conversations.filter((c) => c.id !== id);
  persistConversations();
  if (!aiState.conversations.length) {
    aiState.activeChatId = null;
    if (aiState.chat.open) closeChat();
    renderConversationList();
    return;
  }
  if (wasActive) {
    aiState.activeChatId = null;
    const next = aiState.conversations.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    loadConversationIntoChat(next);
  } else {
    renderConversationList();
  }
}

export function appendNotice(text) {
  if (!aiState.ui) return;
  const el = document.createElement('div');
  el.className = 'ai-msg notice';
  el.innerHTML = '<div class="ai-msg-role">上下文</div><div class="ai-msg-body"></div>';
  el.querySelector('.ai-msg-body').textContent = text;
  aiState.ui.messages.appendChild(el);
  scrollChat();
}

export function messageNode(message, index) {
  const wrap = document.createElement('div');
  wrap.className =
    'ai-msg ' +
    (message.role === 'error' ? 'error' : message.role) +
    (message.streaming ? ' streaming' : '') +
    (message.stopped ? ' stopped' : '');
  wrap.dataset.aiMessageIndex = String(index);
  if (
    message.role === 'assistant' &&
    message.streaming &&
    !message.content &&
    !message.reasoning &&
    !(Array.isArray(message.actions) && message.actions.length)
  ) {
    wrap.hidden = true;
  }
  const role = document.createElement('div');
  role.className = 'ai-msg-role';
  role.textContent = roleLabel[message.role] || message.role;
  wrap.appendChild(role);
  if (message.role === 'assistant' && message.reasoning) {
    const think = document.createElement('details');
    think.className = 'ai-msg-reasoning';
    think.open = false;
    const summary = document.createElement('summary');
    summary.textContent = '思考过程';
    const thinkBody = document.createElement('div');
    thinkBody.className = 'ai-msg-reasoning-body';
    thinkBody.textContent = message.reasoning;
    const savedTop = Number(message._reasoningScrollTop) || 0;
    const stick = message._reasoningStick !== false;
    let userScrolled = false;
    const markUserScroll = () => {
      userScrolled = true;
    };
    thinkBody.addEventListener('wheel', markUserScroll, { passive: true });
    thinkBody.addEventListener('pointerdown', markUserScroll);
    thinkBody.addEventListener('keydown', markUserScroll);
    thinkBody.addEventListener('scroll', () => {
      if (!userScrolled) return;
      message._reasoningScrollTop = thinkBody.scrollTop;
      message._reasoningStick = thinkBody.scrollHeight - thinkBody.scrollTop - thinkBody.clientHeight < 24;
    });
    requestAnimationFrame(() => {
      try {
        thinkBody.scrollTop = stick ? thinkBody.scrollHeight : savedTop;
      } catch {}
    });
    think.appendChild(summary);
    think.appendChild(thinkBody);
    wrap.appendChild(think);
  }
  const body = document.createElement('div');
  body.className = 'ai-msg-body';
  if (message.role === 'assistant') {
    body.classList.add('markdown');
    if (String(message.content || '').trim()) body.innerHTML = renderMarkdown(message.content || '');
    else if (Array.isArray(message.actions) && message.actions.length) {
      body.innerHTML = '<p class="ai-empty-answer">（已生成直接操作按钮，点击执行）</p>';
    } else if (message.stopped) {
      body.innerHTML = '<p class="ai-empty-answer">（已停止生成）</p>';
    } else {
      body.hidden = true;
    }
  } else {
    let text = message.content || '';
    if (Array.isArray(message.attachments) && message.attachments.length) {
      text += (text ? '\n\n' : '') + '附件：' + message.attachments.map((file) => file.name).join('，');
    }
    body.textContent = text;
  }
  wrap.appendChild(body);
  if (message.stopped) {
    const stopped = document.createElement('div');
    stopped.className = 'ai-msg-stopped';
    stopped.textContent = '已停止生成';
    wrap.appendChild(stopped);
  }
  if (
    !message.streaming &&
    message.role === 'assistant' &&
    Array.isArray(message.actions) &&
    message.actions.length
  ) {
    const direct = document.createElement('div');
    direct.className = 'ai-msg-direct-actions';
    const count = message.actions.length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.aiTotalAction = '1';
    btn.title = message.actions.map((a) => a.label).join('；');
    if (message.totalApplied) {
      btn.textContent = `取消本次修改（${count} 项）`;
      btn.classList.add('cancel');
    } else if (message.totalCancelled) {
      btn.textContent = `重新应用全部修改（${count} 项）`;
    } else {
      btn.textContent = count === 1 ? message.actions[0].label : `修复全部 ${count} 项问题`;
    }
    direct.appendChild(btn);
    const details = document.createElement('details');
    details.className = 'ai-total-details';
    const summary = document.createElement('summary');
    summary.textContent = `查看 ${count} 项具体修改`;
    details.appendChild(summary);
    message.actions.forEach((action, actionIndex) => {
      const row = document.createElement('div');
      row.className = 'ai-total-detail-row';
      const title = document.createElement('b');
      title.textContent = `${actionIndex + 1}. ${action.label}`;
      row.appendChild(title);
      if (action.description && action.description !== action.label) {
        const desc = document.createElement('small');
        desc.textContent = action.description;
        row.appendChild(desc);
      }
      details.appendChild(row);
    });
    direct.appendChild(details);
    wrap.appendChild(direct);
  }
  if (!message.streaming && message.role === 'assistant') {
    const actions = document.createElement('div');
    actions.className = 'ai-msg-actions';
    for (const [action, label] of [['copy', '复制']]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.aiMessageAction = action;
      btn.textContent = label;
      actions.appendChild(btn);
    }
    wrap.appendChild(actions);
  }
  if (
    message.usage &&
    (message.usage.total_tokens || message.usage.prompt_tokens || message.usage.completion_tokens)
  ) {
    const usage = document.createElement('div');
    usage.className = 'ai-msg-usage';
    const prompt = Number(message.usage.prompt_tokens) || 0;
    const completion = Number(message.usage.completion_tokens) || 0;
    const total = Number(message.usage.total_tokens) || prompt + completion;
    usage.textContent = `Token 用量：输入 ${prompt} · 输出 ${completion} · 合计 ${total}`;
    wrap.appendChild(usage);
  }
  return wrap;
}

export function scrollChat() {
  if (!aiState.ui || !aiState.chat.scrollStick) return;
  requestAnimationFrame(() => {
    try {
      aiState.ui.messages.scrollTop = aiState.ui.messages.scrollHeight;
    } catch {}
  });
}

export function updateStreamingMessage(index) {
  if (!aiState.ui) return;
  const message = aiState.chat.messages[index];
  if (!message) return;
  const node = aiState.ui.messages.querySelector('[data-ai-message-index="' + index + '"]');
  if (!node || (message.reasoning && !node.querySelector('.ai-msg-reasoning'))) {
    renderChat();
    return;
  }
  node.hidden = false;
  const body = node.querySelector('.ai-msg-body');
  const content = String(message.content || '');
  if (body) {
    body.hidden = !content.trim();
    if (content.trim()) body.innerHTML = renderMarkdown(content);
  }
  const reasoningBody = node.querySelector('.ai-msg-reasoning-body');
  if (reasoningBody && message.reasoning) {
    const stick = message._reasoningStick !== false;
    const top = Number(message._reasoningScrollTop) || 0;
    reasoningBody.textContent = message.reasoning;
    if (stick) reasoningBody.scrollTop = reasoningBody.scrollHeight;
    else reasoningBody.scrollTop = top;
  }
  scrollChat();
}

export function renderChat() {
  if (!aiState.ui) return;
  const previousScroll = aiState.ui.messages.scrollTop;
  aiState.chat.rendering = true;
  aiState.ui.messages.replaceChildren();
  if (aiState.chat.notice) appendNotice(aiState.chat.notice);
  aiState.chat.messages.forEach((message, index) => aiState.ui.messages.appendChild(messageNode(message, index)));
  if (aiState.chat.busy) {
    const typing = document.createElement('div');
    typing.className = 'ai-typing';
    typing.innerHTML = '<i></i><i></i><i></i><span>AI 正在分析…</span>';
    aiState.ui.messages.appendChild(typing);
  }
  if (!aiState.chat.messages.length && !aiState.chat.busy) {
    const empty = document.createElement('div');
    empty.className = 'ai-chat-empty';
    empty.innerHTML =
      '<b>可以继续提问</b><span>例如：这条链有没有循环方块冲突？哪些命令可以合并？断链头的条件位是否正确？</span>';
    aiState.ui.messages.appendChild(empty);
  }
  aiState.ui.send.disabled = false;
  aiState.ui.send.textContent = aiState.chat.busy ? '追加' : '发送';
  if (aiState.ui.cancel) aiState.ui.cancel.hidden = !aiState.chat.busy;
  aiState.chat.rendering = false;
  if (aiState.chat.scrollStick) scrollChat();
  else
    requestAnimationFrame(() => {
      try {
        aiState.ui.messages.scrollTop = previousScroll;
      } catch {}
    });
}

export function setBusy(value) {
  aiState.chat.busy = !!value;
  if (aiState.ui) {
    aiState.ui.send.disabled = false;
    aiState.ui.send.textContent = value ? '追加' : '发送';
    if (aiState.ui.cancel) aiState.ui.cancel.hidden = !value;
    aiState.ui.status.textContent = value ? '请求中…' : aiState.chat.notice ? '' : '';
  }
  renderChat();
}

export async function renameConversationById(id, anchor = null) {
  const conv = aiState.conversations.find((c) => c.id === id);
  if (!conv) return;
  const name = await showInputPopover({
    anchor,
    title: '重命名会话',
    value: conv.title || scopeTitle(conv.scope),
    label: '会话名称',
    confirmText: '保存',
    cancelText: '取消'
  });
  if (name === false) return;
  const title = String(name || '')
    .trim()
    .slice(0, 60);
  if (!title) return;
  conv.title = title;
  conv.updatedAt = Date.now();
  if (conv.id === aiState.activeChatId) {
    aiState.chat.title = title;
    if (aiState.ui) aiState.ui.title.textContent = title;
  }
  persistConversations();
  renderConversationList();
}

export function exportActiveConversation() {
  const conv = currentConversation();
  if (!conv) return;
  const lines = [
    '# ' + (conv.title || 'AI 对话'),
    '',
    '- 范围：' + (conv.subtitle || scopeTitle(conv.scope)),
    '- 更新时间：' + new Date(conv.updatedAt || Date.now()).toLocaleString(),
    ''
  ];
  for (const message of conv.messages || []) {
    if (message.role === 'user') {
      lines.push('## 用户', '', String(message.content || ''), '');
    } else if (message.role === 'assistant') {
      lines.push('## AI');
      if (message.reasoning)
        lines.push(
          '',
          '<details><summary>思考过程</summary>',
          '',
          String(message.reasoning),
          '',
          '</details>'
        );
      lines.push('', String(message.content || ''));
      if (message.usage) {
        const p = Number(message.usage.prompt_tokens) || 0;
        const c = Number(message.usage.completion_tokens) || 0;
        const t = Number(message.usage.total_tokens) || p + c;
        lines.push('', `> Token：输入 ${p} · 输出 ${c} · 合计 ${t}`);
      }
      if (Array.isArray(message.actions) && message.actions.length) {
        lines.push('', '### 操作建议');
        for (const action of message.actions) {
          lines.push('', `- **${action.label}**${action.description ? '：' + action.description : ''}`);
          if (Array.isArray(action.ops))
            lines.push('', '```json', JSON.stringify(action.ops, null, 2), '```');
        }
      }
      lines.push('');
    } else if (message.role === 'error') {
      lines.push('## 错误', '', String(message.content || ''), '');
    }
  }
  const payload = JSON.stringify(
    { format: 'blockflow-conversation', version: 1, conversation: conv },
    null,
    2
  );
  lines.push('', '<!-- BLOCKFLOW-CONVERSATION-JSON', payload, '-->', '');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (conv.title || 'AI对话').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importConversationFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let payload = null;
    const marker = text.match(/<!--\s*BLOCKFLOW-CONVERSATION-JSON\s*([\s\S]*?)-->/i);
    if (marker) payload = JSON.parse(marker[1].trim());
    else payload = JSON.parse(text);
    const rawList = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.conversations)
        ? payload.conversations
        : [payload && payload.conversation ? payload.conversation : payload];
    const imported = normalizeConversations(rawList);
    if (!imported.length) throw new Error('文件中没有可识别的会话');
    if (aiState.chat.busy && aiState.chat.controller) {
      try {
        aiState.chat.controller.abort();
      } catch {}
    }
    aiState.chat.busy = false;
    aiState.chat.queue = [];
    ensureChainIds();
    for (const conv of imported) {
      if (!conv.chainUid) {
        const index = conversationAnchorIndex(conv.scope || 'chain');
        if (index >= 0 && app.chains[index]) {
          conv.chainUid = app.chains[index].uid;
          conv.chainNumber = index + 1;
        }
      }
      conv.id = newConversationId();
      conv.createdAt = conv.createdAt || Date.now();
      conv.updatedAt = Date.now();
    }
    aiState.conversations = imported.concat(aiState.conversations).slice(0, MAX_CONVERSATIONS);
    const current = imported[0];
    aiState.activeChatId = current.id;
    aiState.chat.attachments = [];
    aiState.chat.queue = [];
    showChatModal();
    loadConversationIntoChat(current);
    persistConversations();
    aiToast(`已导入 ${imported.length} 个会话`, 'ok');
  } catch (err) {
    aiToast('导入会话失败：' + ((err && err.message) || err), 'err');
  }
}

export function toggleChatSidebar(hidden) {
  if (!aiState.ui) return;
  aiState.ui.chatCard.classList.toggle('side-hidden', !!hidden);
  if (aiState.ui.showSide) aiState.ui.showSide.hidden = !hidden;
  if (hidden) {
    aiState.ui.chatCard.classList.remove('history-open');
  }
}



export function closeChat() {
  if (!aiState.chat.open) return;
  discardEmptyActiveConversation();
  if (aiState.activeChatId) saveActiveDraft();
  aiState.chat.open = false;
  if (aiState.chat.controller) {
    try {
      aiState.chat.controller.abort();
    } catch {}
    aiState.chat.controller = null;
  }
  aiState.chat.busy = false;
  aiState.chat.queue = [];
  aiState.chat.attachments = [];
  if (aiState.ui) {
    renderChatAttachments();
    renderChatQueue();
    aiState.ui.chat.classList.remove('on');
    aiState.ui.chat.setAttribute('aria-hidden', 'true');
    aiState.ui.chatCard.classList.remove('history-open');
    aiState.ui.send.disabled = false;
    aiState.ui.send.textContent = '发送';
  }
}

