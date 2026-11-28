import { aiState } from './state.js?v=r51-ai-modules-20261129';
import { persistConfig } from './store.js?v=r51-ai-modules-20261129';
import { aiToast } from './notify.js?v=r51-ai-modules-20261129';
import {
  CONFIG_KEY,
  DEFAULT_BASE,
  DEFAULT_MODEL,
  MODEL_OPTIONS
} from './prompts.js?v=r51-ai-modules-20261129';
import { callChatApi } from './api.js?v=r51-ai-modules-20261129';
import { showPromptModal } from '../ui/feedback.js?v=r51-ai-modules-20261129';
import { logInfo, logWarn } from '../log.js?v=r51-ai-modules-20261129';

let hooks = {
  ensureUi: () => aiState.ui,
  refresh: () => {},
  closeChat: () => {}
};

export function configureSettings(next) {
  hooks = { ...hooks, ...next };
}

export function fillModelSelect(selected) {
  if (!aiState.ui) return;
  const values = new Set(MODEL_OPTIONS.map((m) => m.value));
  const options = MODEL_OPTIONS.map((m) => `<option value="${m.value}">${m.label}</option>`);
  if (selected && !values.has(selected)) {
    options.push(
      `<option value="${selected.replace(/"/g, '&quot;')}">${selected.replace(/</g, '&lt;')}（当前）</option>`
    );
    values.add(selected);
  }
  options.push('<option value="__custom__">自定义模型…</option>');
  aiState.ui.modelInput.innerHTML = options.join('');
  aiState.ui.modelInput.value = selected && values.has(selected) ? selected : selected || DEFAULT_MODEL;
  if (aiState.ui.modelInput.value !== selected && selected) aiState.ui.modelInput.value = selected;
  aiState.ui.modelCustom.value = '';
  updateCustomModelField();
}

export function updateCustomModelField() {
  if (!aiState.ui) return;
  const custom = aiState.ui.modelInput.value === '__custom__';
  aiState.ui.modelCustomField.hidden = !custom;
  if (custom)
    setTimeout(() => {
      try {
        aiState.ui.modelCustom.focus();
      } catch {}
    }, 20);
}

export function updateReasoningForModel() {
  if (!aiState.ui) return;
  const model = (aiState.ui.modelInput.value === '__custom__' ? aiState.ui.modelCustom.value : aiState.ui.modelInput.value) || '';
  if (/v4\.1[-_.]?flash|deepseek-flash|v4-pro|reasoner/i.test(model)) {
    aiState.ui.reasoning.checked = true;
    aiState.ui.reasoningLevel.value = 'high';
  }
}

export function hasKey() {
  return !!String(aiState.config.key || '').trim();
}

export async function testConnection() {
  if (!aiState.ui || !aiState.ui.testBtn) return;
  const key = aiState.ui.keyInput.value.trim();
  const base = aiState.ui.baseInput.value.trim() || DEFAULT_BASE;
  const custom = aiState.ui.modelInput.value === '__custom__';
  const model = custom ? aiState.ui.modelCustom.value.trim() : aiState.ui.modelInput.value;
  if (!key) {
    aiState.ui.testStatus.className = 'ai-test-status';
    aiState.ui.testStatus.textContent = '';
    aiState.ui.keyInput.focus();
    aiToast('请先填写 API Key。', 'warn');
    return;
  }
  if (!model) {
    aiState.ui.testStatus.className = 'ai-test-status err';
    aiState.ui.testStatus.textContent = '请先选择模型。';
    return;
  }
  aiState.ui.testBtn.disabled = true;
  aiState.ui.testBtn.textContent = '连接中…';
  aiState.ui.testStatus.className = 'ai-test-status';
  aiState.ui.testStatus.textContent = '正在向真实 API 发送最小请求（会消耗少量 Token）…';
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, 30000);
  try {
    const testConfig = {
      ...aiState.config,
      key,
      baseUrl: base,
      model,
      reasoning: !!aiState.ui.reasoning.checked,
      reasoningLevel: aiState.ui.reasoningLevel.value || 'high',
      maxTokens: Math.floor(Number(aiState.ui.maxTokens.value) || 0)
    };
    const result = await callChatApi(
      { config: testConfig, signal: controller.signal },
      '你是连通性测试助手。',
      [{ role: 'user', content: '只回复 OK' }],
      { stream: false }
    );
    const usage = result.usage;
    const usageText = usage
      ? ` · Token ${Number(usage.total_tokens) || (Number(usage.prompt_tokens) || 0) + (Number(usage.completion_tokens) || 0)}`
      : '';
    const shown = result.content || result.reasoning;
    aiState.ui.testStatus.className = 'ai-test-status ok';
    aiState.ui.testStatus.textContent = `连接成功：${model} · ${result.content ? '回复' : '推理'} ${shown.slice(0, 80)}${usageText}`;
  } catch (err) {
    let message = err && err.message ? err.message : String(err);
    if (err && err.name === 'AbortError') message = '连接超时（30 秒）。';
    else if (err instanceof TypeError) message = '请求失败：可能是网络、Base URL 或服务商 CORS 限制。';
    aiState.ui.testStatus.className = 'ai-test-status err';
    aiState.ui.testStatus.textContent = '连接失败：' + message;
  } finally {
    clearTimeout(timer);
    aiState.ui.testBtn.disabled = false;
    aiState.ui.testBtn.textContent = '测试连接';
  }
}


export function openSettings() {
  hooks.ensureUi();
  if (!aiState.ui) return;
  aiState.ui.keyInput.value = '';
  aiState.ui.keyInput.placeholder = hasKey() ? '已保存 API Key；留空则沿用当前设置' : 'sk-...';
  aiState.ui.baseInput.value = aiState.config.baseUrl || DEFAULT_BASE;
  fillModelSelect(aiState.config.model || DEFAULT_MODEL);
  aiState.ui.reasoning.checked = !!aiState.config.reasoning;
  aiState.ui.reasoningLevel.value = aiState.config.reasoningLevel || 'high';
  aiState.ui.maxTokens.value = aiState.config.maxTokens ? String(aiState.config.maxTokens) : '';
  aiState.ui.settings.classList.add('on');
  aiState.ui.settings.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    try {
      aiState.ui.keyInput.focus();
    } catch {}
  }, 30);
}

export function closeSettings() {
  if (!aiState.ui) return;
  aiState.ui.settings.classList.remove('on');
  aiState.ui.settings.setAttribute('aria-hidden', 'true');
}

export function saveSettings() {
  if (!aiState.ui) return;
  const enteredKey = aiState.ui.keyInput.value.trim();
  const nextKey = enteredKey || aiState.config.key;
  if (!nextKey) {
    aiToast('请输入 API Key', 'err');
    aiState.ui.keyInput.focus();
    return;
  }
  const selectedModel = aiState.ui.modelInput.value;
  const model = selectedModel === '__custom__' ? aiState.ui.modelCustom.value.trim() : selectedModel;
  if (!model) {
    aiToast('请选择或输入模型', 'err');
    aiState.ui.modelCustom.focus();
    return;
  }
  const rawMax = aiState.ui.maxTokens.value.trim();
  const maxTokens = rawMax ? Math.floor(Number(rawMax)) : 0;
  if (rawMax && (!Number.isFinite(maxTokens) || maxTokens < 1)) {
    aiToast('最大输出 Token 必须是正整数，或留空表示不限制', 'err');
    aiState.ui.maxTokens.focus();
    return;
  }
  const baseUrl = aiState.ui.baseInput.value.trim() || DEFAULT_BASE;
  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
  } catch {
    aiToast('Base URL 必须是有效的 http(s) 地址', 'err');
    aiState.ui.baseInput.focus();
    return;
  }
  aiState.config.key = nextKey;
  aiState.config.baseUrl = baseUrl;
  aiState.config.model = model;
  aiState.config.reasoning = !!aiState.ui.reasoning.checked;
  aiState.config.reasoningLevel = ['low', 'high', 'max'].includes(aiState.ui.reasoningLevel.value)
    ? aiState.ui.reasoningLevel.value
    : 'high';
  aiState.config.maxTokens = maxTokens;
  persistConfig();
  closeSettings();
  hooks.refresh();
  logInfo(`AI 设置已保存：模型 ${aiState.config.model}`, 'AI 设置');
  aiToast('AI 设置已保存，仅保存在当前浏览器', 'ok');
}

export async function clearSettings() {
  if (!aiState.ui) return;
  const ok = await showPromptModal('清除保存在这个浏览器里的 AI API Key 和设置？', {
    title: '清除 AI 设置',
    confirmText: '清除',
    cancelText: '取消'
  });
  if (!ok) return;
  aiState.config = {
    key: '',
    baseUrl: DEFAULT_BASE,
    model: DEFAULT_MODEL,
    reasoning: false,
    reasoningLevel: 'high',
    maxTokens: 0
  };
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {}
  aiState.ui.keyInput.value = '';
  aiState.ui.baseInput.value = DEFAULT_BASE;
  aiState.ui.modelInput.value = DEFAULT_MODEL;
  aiState.ui.maxTokens.value = '';
  closeSettings();
  hooks.closeChat();
  hooks.refresh();
  logWarn('已清除 AI API Key 与模型设置', 'AI 设置');
  aiToast('已清除 AI 设置', 'ok');
}


