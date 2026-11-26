import { app } from '../state.js';
import { storageGet, storageSet } from '../core/storage.js';
import { updateSceneTheme } from '../scene.js';
import { logOk, setCurrentAction } from '../log.js';

export function setTheme(theme) {
  const root = document.documentElement;
  const themeButton = document.getElementById('themeBtn');
  root.classList.add('theme-switching');
  themeButton?.classList.add('theme-spin');
  app.theme = theme;
  root.setAttribute('data-theme', theme);
  storageSet('mcs-theme', theme);
  if (window._sceneReady) updateSceneTheme();
  window.setTimeout(() => {
    root.classList.remove('theme-switching');
    themeButton?.classList.remove('theme-spin');
  }, 520);
}

export function initTheme() {
  const themeButton = document.getElementById('themeBtn');
  if (themeButton) {
    themeButton.onclick = () => {
      setCurrentAction('切换主题');
      setTheme(app.theme === 'dark' ? 'light' : 'dark');
      logOk(`已切换为${app.theme === 'dark' ? '深色' : '浅色'}模式`, '切换主题');
      setCurrentAction('空闲');
    };
  }
  const stored = storageGet('mcs-theme');
  if (stored === 'dark' || stored === 'light') setTheme(stored);
  else if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
  else setTheme('light');
}
