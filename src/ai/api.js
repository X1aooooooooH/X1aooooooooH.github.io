import { DEFAULT_BASE } from './prompts.js?v=r49-cleanup-20261129';

export function endpointFor(baseUrl) {
  const base = String(baseUrl || DEFAULT_BASE)
    .trim()
    .replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return base + '/chat/completions';
}
export function contentToText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(contentToText).join('');
  if (typeof value === 'object') {
    return contentToText(value.text ?? value.content ?? value.value ?? '');
  }
  return String(value);
}
export function extractResponseText(data) {
  const choice = data && data.choices && data.choices[0];
  const message = choice && choice.message;
  const finalText =
    contentToText(message && message.content).trim() ||
    contentToText(choice && choice.text).trim() ||
    contentToText(data && (data.output_text || data.response || data.answer)).trim();
  const reasoning = contentToText(message && (message.reasoning_content || message.reasoning)).trim();
  const finish = (choice && (choice.finish_reason || choice.finishReason)) || '';
  return { text: finalText, reasoning, finish };
}
export async function callChatApi(request, systemPrompt, messages, options = {}) {
  const { config, signal } = request;
  const res = await fetch(endpointFor(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + config.key
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.2,
      ...(config.reasoning ? { reasoning_effort: config.reasoningLevel || 'high' } : {}),
      ...(Number(config.maxTokens) > 0 ? { max_tokens: Math.floor(Number(config.maxTokens)) } : {}),
      stream: options.stream === true
    }),
    signal
  });
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}
    const detail = data && data.error ? data.error.message || JSON.stringify(data.error) : raw.slice(0, 500);
    throw new Error(`API ${res.status}：${detail || res.statusText}`);
  }
  if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}
    const parsed = extractResponseText(data);
    if (!parsed.text && !parsed.reasoning) {
      const finish = parsed.finish ? `，finish_reason=${parsed.finish}` : '';
      throw new Error(`API 返回了空内容${finish}${raw ? `；响应片段：${raw.replace(/\s+/g, ' ').slice(0, 200)}` : ''}。`);
    }
    options.onDelta && options.onDelta({ content: parsed.text, reasoning: parsed.reasoning });
    return {
      content: parsed.text,
      reasoning: parsed.reasoning,
      usage: data && data.usage ? data.usage : null
    };
  }
  if (!res.body) {
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {}
    const parsed = extractResponseText(data);
    if (!parsed.text && !parsed.reasoning) throw new Error('API 返回了空内容。');
    options.onDelta && options.onDelta({ content: parsed.text, reasoning: parsed.reasoning });
    return {
      content: parsed.text,
      reasoning: parsed.reasoning,
      usage: data && data.usage ? data.usage : null
    };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  let usage = null;
  let finish = '';
  let rawPreview = '';
  let invalidFrames = 0;
  let frame = [];
  const handleData = (rawData) => {
    const text = String(rawData || '').trim();
    if (!text || text === '[DONE]') return true;
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      return false;
    }
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    if (data.usage) usage = data.usage;
    const choice = data.choices && data.choices[0];
    if (!choice) return true;
    finish = choice.finish_reason || finish;
    const delta = choice.delta || choice.message || {};
    const c = contentToText(delta.content);
    const r = contentToText(delta.reasoning_content || delta.reasoning);
    if (c) content += c;
    if (r) reasoning += r;
    options.onDelta && options.onDelta({ content, reasoning });
    return true;
  };
  const flushFrame = (force = false) => {
    if (!frame.length) return;
    const payload = frame.join('\n').trim();
    frame = [];
    if (!payload) return;
    if (!handleData(payload) && force) invalidFrames++;
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (rawPreview.length < 500) rawPreview += chunk.slice(0, 500 - rawPreview.length);
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushFrame(true);
        continue;
      }
      if (trimmed.startsWith('data:')) {
        frame.push(trimmed.slice(5).trim());
        flushFrame();
      } else if (trimmed.startsWith('{')) {
        flushFrame(true);
        handleData(trimmed);
      }
    }
  }
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:')) frame.push(trimmed.slice(5).trim());
    else if (trimmed.startsWith('{')) handleData(trimmed);
  }
  flushFrame(true);
  if (!content.trim() && !reasoning.trim()) {
    const details = [
      finish ? `finish_reason=${finish}` : '',
      invalidFrames ? `${invalidFrames} 个流事件无法解析` : '',
      rawPreview ? `响应片段：${rawPreview.replace(/\s+/g, ' ').slice(0, 200)}` : ''
    ]
      .filter(Boolean)
      .join('；');
    throw new Error(`API 返回了空内容${details ? `（${details}）` : ''}。`);
  }
  return { content, reasoning, usage };
}
export function extractToolRequests(text) {
  const requests = [];
  const re = /```blockflow-tool\s*([\s\S]*?)```/gi;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      if (data && typeof data.name === 'string') {
        requests.push({
          name: data.name,
          arguments: data.arguments && typeof data.arguments === 'object' ? data.arguments : {}
        });
      }
    } catch {}
  }
  return requests;
}
export function stripToolBlocks(text) {
  return String(text || '')
    .replace(/```blockflow-tool\s*[\s\S]*?(?:```|$)/gi, '')
    .trim();
}
export function stripDisplayBlocks(text) {
  return String(text || '')
    .replace(/```blockflow-(?:tool|actions)\s*[\s\S]*?(?:```|$)/gi, '')
    .trim();
}
export function mergeUsage(total, result) {
  if (!result || !result.usage) return total;
  const usage = total
    ? { ...total }
    : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const prompt = Number(result.usage.prompt_tokens ?? result.usage.input_tokens) || 0;
  const completion = Number(result.usage.completion_tokens ?? result.usage.output_tokens) || 0;
  usage.prompt_tokens += prompt;
  usage.completion_tokens += completion;
  usage.total_tokens += Number(result.usage.total_tokens) || prompt + completion;
  return usage;
}
