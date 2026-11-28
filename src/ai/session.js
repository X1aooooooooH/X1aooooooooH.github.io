import { app } from '../state.js?v=r51-ai-modules-20261129';
import { getTextEditChain } from '../ui/text-editor.js?v=r51-ai-modules-20261129';
import { aiState } from './state.js?v=r51-ai-modules-20261129';
import { persistConversations } from './store.js?v=r51-ai-modules-20261129';
import { aiToast } from './notify.js?v=r51-ai-modules-20261129';
import { logWarn } from '../log.js?v=r51-ai-modules-20261129';

export function currentAiFileKey() {
  if (typeof app === 'undefined' || !app) return '';
  const name = String(app.fileName || '').trim();
  if (!name && !(app.chains || []).length) return '';
  return name || '未命名结构';
}

export function currentConversation() {
  return aiState.conversations.find((c) => c.id === aiState.activeChatId) || null;
}

export function saveActiveDraft() {
  const conv = currentConversation();
  if (!conv) return;
  conv.draft =
    aiState.chat.draft || (aiState.ui && aiState.ui.input ? aiState.ui.input.value : '') || '';
  conv.updatedAt = Date.now();
  persistConversations();
}

export function newChainUid() {
  return 'chain-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function ensureChainIds() {
  if (typeof app === 'undefined' || !app || !Array.isArray(app.chains)) return;
  for (const chain of app.chains) if (!chain.uid) chain.uid = newChainUid();
}

export function conversationAnchorIndex(scope) {
  if (typeof app === 'undefined' || !app || !Array.isArray(app.chains) || !app.chains.length) return -1;
  if (scope === 'text') {
    const inlineChain = getTextEditChain();
    if (Number.isInteger(inlineChain) && inlineChain >= 0) return inlineChain;
  }
  if (
    typeof app.selectedChain === 'number' &&
    app.selectedChain >= 0 &&
    app.selectedChain < app.chains.length
  )
    return app.selectedChain;
  return 0;
}

export function ensureConversationChain(conv, create = true) {
  if (typeof app === 'undefined' || !app || !Array.isArray(app.chains)) return { index: -1 };
  ensureChainIds();
  let index = conv && conv.chainUid ? app.chains.findIndex((c) => c.uid === conv.chainUid) : -1;
  if (index >= 0) return { index };
  if (conv && !conv.chainUid) {
    const fallback = conversationAnchorIndex(conv.scope || 'chain');
    if (fallback >= 0 && app.chains[fallback]) {
      conv.chainUid = app.chains[fallback].uid;
      conv.chainNumber = fallback + 1;
      persistConversations();
      return { index: fallback };
    }
  }
  const oldNumber = conv ? Number(conv.chainNumber) || 0 : 0;
  if (!create || !app.chains.length) return { index: -1 };
  let fallback = -1;
  if (
    Number.isInteger(app.selectedChain) &&
    app.selectedChain >= 0 &&
    app.selectedChain < app.chains.length
  ) {
    fallback = app.selectedChain;
  } else if (oldNumber > 0) {
    fallback = Math.min(oldNumber - 1, app.chains.length - 1);
  } else {
    fallback = 0;
  }
  if (fallback < 0) return { index: -1 };
  if (conv) {
    conv.chainUid = app.chains[fallback].uid || '';
    conv.chainNumber = fallback + 1;
    persistConversations();
  }
  if (aiState.ui) aiToast('会话绑定的链已不存在，已改绑到当前链', 'warn');
  logWarn(`AI 会话原绑定的链已删除，改绑到链 ${fallback + 1}；不会自动新建空链`, 'AI 结构同步');
  return { index: fallback };
}

export function newConversationId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function schedulePersist() {
  clearTimeout(aiState.persistTimer);
  aiState.persistTimer = setTimeout(() => saveActiveDraft(), 350);
}
