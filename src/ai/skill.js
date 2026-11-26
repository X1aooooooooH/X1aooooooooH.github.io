import { DEFAULT_SKILL, SKILL_PATHS } from './prompts.js';

let skillCache = null;
let skillSource = '';
let skillRuntimePromise = null;
export async function loadSkillRuntime() {
    if (location.protocol === 'file:') return { syntax: null, rules: null };
    if (skillRuntimePromise) return skillRuntimePromise;
    skillRuntimePromise = (async () => {
      let syntax = null;
      let rules = null;
      for (const path of ['../skill-runtime/lib/syntax.js', '../../skills/be-cmd/scripts/lib/syntax.js']) {
        try { syntax = await import(path); break; } catch {}
      }
      for (const path of ['../skill-runtime/lib/rules.js', '../../skills/be-cmd/scripts/lib/rules.js']) {
        try { rules = await import(path); break; } catch {}
      }
      return { syntax, rules };
    })().catch(() => ({ syntax: null, rules: null }));
    return skillRuntimePromise;
  }
export async function searchSkillIds(query) {
    const runtime = await loadSkillRuntime();
    if (!runtime || !runtime.syntax || typeof runtime.syntax.categoriesTable !== 'function') return '';
    const q = String(query || '').trim();
    if (!q) return '';
    try {
      const rows = [];
      for (const row of runtime.syntax.categoriesTable()) {
        const category = row[0];
        for (const hit of runtime.syntax.searchId(category, q)) {
          rows.push(`${category}: ${hit.id}${hit.note ? ' — ' + hit.note : ''}`);
          if (rows.length >= 40) break;
        }
        if (rows.length >= 40) break;
      }
      return rows.length ? rows.join('\n') : '未找到匹配的 ID。';
    } catch (err) {
      return 'ID 查询运行时错误：' + String(err && err.message || err);
    }
  }
export async function loadSkill() {
    if (skillCache) return skillCache;
    if (location.protocol === 'file:' && typeof window.BLOCKFLOW_BUNDLED_SKILL === 'string' && window.BLOCKFLOW_BUNDLED_SKILL.trim().length > 40) {
      skillCache = window.BLOCKFLOW_BUNDLED_SKILL;
      skillSource = 'bundled';
      return skillCache;
    }
    for (const path of SKILL_PATHS) {
      try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) continue;
        const text = await res.text();
        if (text && text.trim().length > 40) {
          skillCache = text;
          skillSource = 'file';
          return text;
        }
      } catch {}
    }
    if (typeof window.BLOCKFLOW_BUNDLED_SKILL === 'string' && window.BLOCKFLOW_BUNDLED_SKILL.trim().length > 40) {
      skillCache = window.BLOCKFLOW_BUNDLED_SKILL;
      skillSource = 'bundled';
      return skillCache;
    }
    skillCache = DEFAULT_SKILL;
    skillSource = 'default';
    return skillCache;
  }

export const getSkillSource = () => skillSource;
