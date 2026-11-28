import { app } from '../state.js';
import { storageGet, storageSet } from '../core/storage.js';
import { updateSceneTheme } from '../scene.js';
import { logOk, setCurrentAction } from '../log.js';
import { icon } from './icons.js';

export function setTheme(theme, animate = true) {
  const root = document.documentElement;
  const themeButton = document.getElementById('themeBtn');
  if (animate) {
    root.classList.add('theme-switching');
    themeButton?.classList.add('theme-spin');
  }
  app.theme = theme;
  root.setAttribute('data-theme', theme);
  if (themeButton) {
    // The glyph reflects the active day/night state: sun by day, moon by night.
    themeButton.innerHTML = icon(theme === 'dark' ? 'moon' : 'sun');
    themeButton.title = theme === 'dark' ? '当前深色模式，切换为浅色' : '当前浅色模式，切换为深色';
    themeButton.setAttribute('aria-label', themeButton.title);
  }
  storageSet('mcs-theme', theme);
  if (window._sceneReady) updateSceneTheme();
  if (animate) {
    window.setTimeout(() => {
      root.classList.remove('theme-switching');
      themeButton?.classList.remove('theme-spin');
    }, 520);
  }
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
  // The head boot script already picked the same theme before first paint.
  // Re-apply it without the theme-switching transition.
  const bootTheme = document.documentElement.dataset.theme;
  const stored = storageGet('mcs-theme');
  const initial = stored === 'dark' || stored === 'light'
    ? stored
    : bootTheme === 'dark' || bootTheme === 'light'
      ? bootTheme
      : (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(initial, false);
}
