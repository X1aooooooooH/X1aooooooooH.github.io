import assert from 'node:assert/strict';
import { callChatApi } from '../src/ai/api.js';

const config = { key: 'test', baseUrl: 'https://example.com/v1' };

globalThis.fetch = async () =>
  new Response('<html><body>gateway login</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' }
  });
let message = '';
try {
  await callChatApi({ config, signal: null }, 'system', [{ role: 'user', content: 'hello' }], {
    stream: true
  });
} catch (error) {
  message = String(error.message || error);
}
assert.match(message, /空内容/);
assert.match(message, /响应片段/);
assert.match(message, /gateway login/);
console.log('non-SSE diagnostics ok:', message);

globalThis.fetch = async () =>
  new Response(
    'data: {"choices":[{"delta":{"content":"he"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n' +
      'data: [DONE]\n\n',
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
const result = await callChatApi({ config, signal: null }, 'system', [{ role: 'user', content: 'hello' }], {
  stream: true
});
assert.equal(result.content, 'hello');
console.log('SSE frame parsing ok:', result.content);
