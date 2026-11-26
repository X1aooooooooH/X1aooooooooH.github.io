// localStorage can throw in private mode or when the quota is full; callers rely on the boolean result.
export function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}

export function storageRemove(key) {
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}
