import { app } from './state.js?v=r49-cleanup-20261129';

const MAX_LOGS = 300;

export function appendLog(level, message, action) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  app.logs = Array.isArray(app.logs) ? app.logs : [];
  app.logs.push({
    time,
    level,
    message: String(message || ''),
    action: String(action || app.currentAction || '空闲')
  });
  if (app.logs.length > MAX_LOGS) app.logs.splice(0, app.logs.length - MAX_LOGS);
}

export function setCurrentAction(action) {
  app.currentAction = String(action || '空闲');
}

export const logInfo = (message, action) => appendLog('info', message, action);
export const logOk = (message, action) => appendLog('ok', message, action);
export const logWarn = (message, action) => appendLog('warn', message, action);
export const logError = (message, action) => appendLog('error', message, action);

export function formatLogText() {
  const lines = ['BlockFlow 运行日志', '当前执行：' + (app.currentAction || '空闲'), ''];
  for (const item of app.logs || [])
    lines.push(`[${item.time}] [${item.level.toUpperCase()}] [${item.action}] ${item.message}`);
  return lines.join('\n');
}
