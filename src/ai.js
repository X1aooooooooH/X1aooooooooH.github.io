'use strict';
/*
 * BlockFlow AI assistant.
 * - User supplies an OpenAI-compatible endpoint + API key (BYOK).
 * - Key stays in this browser; no BlockFlow server is involved.
 * - The bundled skills/be-cmd/SKILL.md is injected as the system prompt.
 */
import { aiState } from './ai/state.js?v=r51-ai-modules-20261129';
import {
  loadConfig,
  normalizeConversations,
  loadConversations,
  loadSessionMap
} from './ai/store.js?v=r51-ai-modules-20261129';
import { currentAiFileKey } from './ai/session.js?v=r51-ai-modules-20261129';
import {
  ensureUi,
  ensureAiFileContext,
  renderConversationList,
  closeChat,
  configureViewActions
} from './ai/view.js?v=r51-ai-modules-20261129';
import {
  hasKey,
  openSettings,
  closeSettings,
  configureSettings
} from './ai/settings.js?v=r51-ai-modules-20261129';
import {
  sendChat,
  cancelChat,
  executeTotalAction,
  handleMessageAction,
  openChat,
  openBlock
} from './ai/send.js?v=r51-ai-modules-20261129';

const roleLabel = { user: '你', assistant: 'AI', error: '错误' };
aiState.config = loadConfig();
aiState.conversations = loadConversations();

function refresh() {
  ensureAiFileContext();
}

function bindGlobal() {
  ensureUi();
  const initialKey = currentAiFileKey();
  if (initialKey) {
    aiState.aiFileKey = initialKey;
    const map = loadSessionMap();
    if (Object.prototype.hasOwnProperty.call(map, initialKey)) {
      aiState.conversations = normalizeConversations(map[initialKey]);
    } else {
      aiState.conversations = [];
    }
    renderConversationList();
  }
  ensureAiFileContext();
  refresh();
}

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape') return;
    if (aiState.ui && aiState.ui.settings.classList.contains('on')) {
      e.preventDefault();
      e.stopPropagation();
      closeSettings();
      return;
    }
    if (aiState.chat.busy) {
      e.preventDefault();
      e.stopPropagation();
      cancelChat();
      return;
    }
    if (aiState.chat.open) {
      e.preventDefault();
      e.stopPropagation();
      closeChat();
      return;
    }
  },
  true
);

configureViewActions({ sendChat, cancelChat, executeTotalAction, handleMessageAction });
configureSettings({ ensureUi, closeChat, refresh });

window.BlockFlowAI = {
  refresh,
  openChat,
  open: openChat,
  openBlock,
  openSettings,
  getConfig: () => ({ ...aiState.config, key: '', hasKey: hasKey() }),
  getChatState: () => ({
    busy: aiState.chat.busy,
    open: aiState.chat.open,
    queue: aiState.chat.queue.slice(),
    activeChatId: aiState.activeChatId,
    cancelled: aiState.chat.cancelled
  }),
  hasKey
};

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', bindGlobal, { once: true });
else bindGlobal();
