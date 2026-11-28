import { DEFAULT_SKILL, SKILL_PATHS } from './prompts.js?v=r49-cleanup-20261129';

let skillCache = null;
let skillSource = '';
let skillRuntimePromise = null;
/**
 * 按顺序尝试若干路径，返回第一个能加载的模块。
 * src/skill-runtime/lib/ 现在只是转发层，真实实现在 skills/be-cmd/scripts/lib/，
 * 所以第二个路径通常就是第一个路径实际加载到的那份文件；保留回退是为了
 * 万一转发路径在某些部署布局下解析不到时仍能直接命中实现。
 */
async function loadFirstAvailable(paths) {
  for (const path of paths) {
    try {
      return await import(path);
    } catch (error) {
      console.warn('[BlockFlow] 技能模块加载失败，尝试下一路径：' + path, error);
    }
  }
  return null;
}

export async function loadSkillRuntime() {
  if (location.protocol === 'file:') return { syntax: null, rules: null };
  if (skillRuntimePromise) return skillRuntimePromise;
  skillRuntimePromise = (async () => ({
    syntax: await loadFirstAvailable([
      '../skill-runtime/lib/syntax.js',
      '../../skills/be-cmd/scripts/lib/syntax.js'
    ]),
    rules: await loadFirstAvailable([
      '../skill-runtime/lib/rules.js',
      '../../skills/be-cmd/scripts/lib/rules.js'
    ])
  }))().catch(() => ({ syntax: null, rules: null }));
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
    return 'ID 查询运行时错误：' + String((err && err.message) || err);
  }
}
export async function loadSkill() {
  if (skillCache) return skillCache;
  if (
    location.protocol === 'file:' &&
    typeof window.BLOCKFLOW_BUNDLED_SKILL === 'string' &&
    window.BLOCKFLOW_BUNDLED_SKILL.trim().length > 40
  ) {
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
  if (
    typeof window.BLOCKFLOW_BUNDLED_SKILL === 'string' &&
    window.BLOCKFLOW_BUNDLED_SKILL.trim().length > 40
  ) {
    skillCache = window.BLOCKFLOW_BUNDLED_SKILL;
    skillSource = 'bundled';
    return skillCache;
  }
  skillCache = DEFAULT_SKILL;
  skillSource = 'default';
  return skillCache;
}

export const getSkillSource = () => skillSource;
