import { aiState } from './state.js?v=r51-ai-modules-20261129';
import {
  CONFIG_KEY,
  CHATS_KEY,
  SESSIONS_KEY,
  MAX_CONVERSATIONS,
  MAX_MESSAGES,
  DEFAULT_BASE,
  DEFAULT_MODEL
} from './prompts.js?v=r51-ai-modules-20261129';

export function loadConfig() {
  let parsed = {};
  try {
    parsed = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') || {};
  } catch {
    parsed = {};
  }
  const rawModel =
    typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL;
  const modelAliases = {
    'deepseek-V4.1-Flash': 'deepseek-flash',
    'deepseek-ai/deepseek-v4.1-flash-1017': 'deepseek-flash'
  };
  const model = modelAliases[rawModel] || rawModel;
  const reasoningDefault = /deepseek-flash|v4-pro|reasoner/i.test(model);
  return {
    key: typeof parsed.key === 'string' ? parsed.key : '',
    baseUrl:
      typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? parsed.baseUrl.trim() : DEFAULT_BASE,
    model,
    reasoning: parsed.reasoning === true || (parsed.reasoning === undefined && reasoningDefault),
    reasoningLevel: ['low', 'high', 'max'].includes(parsed.reasoningLevel) ? parsed.reasoningLevel : 'high',
    maxTokens:
      Number.isFinite(Number(parsed.maxTokens)) && Number(parsed.maxTokens) > 0
        ? Math.floor(Number(parsed.maxTokens))
        : 0
  };
}

export function persistConfig() {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(aiState.config));
  } catch (error) {
    console.warn('[BlockFlow] AI 设置保存失败：localStorage 不可用或已满', error);
  }
}

export function normalizeConversations(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      id: typeof c.id === 'string' ? c.id : 'c' + Date.now() + Math.random().toString(36).slice(2, 8),
      title: typeof c.title === 'string' && c.title.trim() ? c.title.trim() : 'AI 对话',
      subtitle: typeof c.subtitle === 'string' ? c.subtitle : '',
      scope: ['all', 'chain', 'text'].includes(c.scope) ? c.scope : 'all',
      chainUid: typeof c.chainUid === 'string' ? c.chainUid : '',
      chainNumber: Number(c.chainNumber) || 0,
      messages: Array.isArray(c.messages)
        ? c.messages.filter((m) => m && ['user', 'assistant', 'error'].includes(m.role)).slice(-MAX_MESSAGES)
        : [],
      draft: typeof c.draft === 'string' ? c.draft : '',
      createdAt: Number(c.createdAt) || Date.now(),
      updatedAt: Number(c.updatedAt) || Number(c.createdAt) || Date.now()
    }))
    .slice(0, MAX_CONVERSATIONS);
}

export function loadConversations() {
  let parsed = [];
  try {
    parsed = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]');
  } catch {
    parsed = [];
  }
  return normalizeConversations(parsed);
}

export function loadSessionMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSessionMap(map) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(map));
  } catch (error) {
    console.warn('[BlockFlow] AI 会话索引保存失败：localStorage 不可用或已满', error);
  }
}

export function serializeConversations() {
  return aiState.conversations.slice(0, MAX_CONVERSATIONS).map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    scope: c.scope,
    chainUid: c.chainUid || '',
    chainNumber: Number(c.chainNumber) || 0,
    messages: (c.messages || []).slice(-MAX_MESSAGES),
    draft: c.draft || '',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }));
}

export function persistConversations() {
  try {
    const data = serializeConversations();
    localStorage.setItem(CHATS_KEY, JSON.stringify(data));
    if (aiState.aiFileKey) {
      const map = loadSessionMap();
      map[aiState.aiFileKey] = data;
      saveSessionMap(map);
    }
  } catch (error) {
    console.warn('[BlockFlow] AI 历史保存失败：localStorage 不可用或已满', error);
  }
}
