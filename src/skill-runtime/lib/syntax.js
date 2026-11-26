import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMAND_TABLE, EXECUTE_SCORE_OPS, GAMEMODES, ID_CATEGORIES, JAVA_ONLY_PARAMS,
  SCOREBOARD_OPS, SELECTOR_PARAMS,
} from "./catalogue.js";
import { repr } from "./util.js";

export const ERROR = "error";
export const WARN = "warn";
export const INFO = "info";

const COORD_COMPONENT = "(?:[-+]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)|[~^][-+]?(?:\\d+(?:\\.\\d+)?)?)";
const COMPONENT_SCAN_RE = new RegExp(COORD_COMPONENT, "g");
const NUMBER_RE = /^[-+]?\d+(?:\.\d+)?$/;
const RANGE_RE = /^(?:[-+]?\d+)?\.\.(?:[-+]?\d+)?$|^[-+]?\d+$/;
const INT_RE = /^[-+]?\d+$/;
const SELECTOR_RE = /^@([aeprsn])(?:\[([\s\S]*)\])?$/;
const OBJECTIVE_RE = /^[A-Za-z0-9_]{1,16}$/;
const BLOCK_RE = /^(?:[a-z0-9_]+:)?[a-z0-9_./-]+(?:\[[\s\S]*\])?$/;
const DISPLAY_SLOTS = new Set(["sidebar", "list", "belowname"]);
const ID_ARGS = new Map([
  ["summon", [0, "entity"]], ["effect", [1, "effect"]], ["enchant", [1, "enchantment"]],
  ["gamerule", [0, "gamerule"]], ["damage", [2, "damage_cause"]], ["particle", [0, "particle"]],
  ["playsound", [0, "sound"]], ["playanimation", [1, "animation"]], ["fog", [2, "fog"]],
  ["event", [2, "entity_event"]], ["inputpermission", [2, "input_permission"]],
]);

export class Issue {
  constructor(severity, code, message, cmd = "") {
    this.severity = severity;
    this.code = code;
    this.message = message;
    this.cmd = cmd;
  }
  as_dict() {
    const out = { severity: this.severity, code: this.code, message: this.message };
    if (this.cmd) out.cmd = this.cmd;
    return out;
  }
}

export class PatternError extends Error {}

/* ---------------- 分词 ---------------- */

const isSpace = char => /\s/.test(char);

export function tokenize(cmd) {
  let text = String(cmd).trim();
  if (text.startsWith("/")) text = text.slice(1);
  const tokens = [];
  let buffer = "";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (const char of text) {
    if (inString) {
      buffer += char;
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      buffer += char;
    } else if (char === "[" || char === "{") {
      depth++;
      buffer += char;
    } else if (char === "]" || char === "}") {
      depth--;
      if (depth < 0) {
        return [buffer ? [...tokens, buffer] : tokens, "括号不配对"];
      }
      buffer += char;
    } else if (isSpace(char) && depth === 0) {
      if (buffer) { tokens.push(buffer); buffer = ""; }
    } else {
      buffer += char;
    }
  }
  if (buffer) tokens.push(buffer);
  if (inString) return [tokens, "引号未闭合"];
  if (depth !== 0) return [tokens, "括号不配对"];
  return [tokens, null];
}

/* ---------------- 签名模式 ---------------- */

export class Element {
  constructor(kind, value = null, optional = false) {
    this.kind = kind;
    this.value = value;
    this.optional = optional;
  }
}

export function parsePattern(pattern) {
  const elements = [];
  const text = String(pattern).trim();
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (isSpace(char)) { i++; continue; }
    if (text.startsWith("...", i)) {
      elements.push(new Element("rest"));
      i += 3;
      continue;
    }
    if (char === "<") {
      const end = text.indexOf(">", i);
      if (end < 0) throw new PatternError("未闭合的 '<'：" + repr(pattern));
      const body = text.slice(i + 1, end).trim();
      i = end + 1;
      if (body.endsWith("...")) {
        elements.push(new Element("rest"));
      } else if (body.includes("|")) {
        elements.push(new Element("choice", body.split("|").map(b => b.trim())));
      } else {
        elements.push(new Element("arg", body));
      }
      while (i < text.length && !isSpace(text[i]) && !"<[(".includes(text[i])) {
        elements.push(new Element("literal", text[i]));
        i++;
      }
      continue;
    }
    if (char === "[") {
      const end = text.indexOf("]", i);
      if (end < 0) throw new PatternError("未闭合的 '['：" + repr(pattern));
      const body = text.slice(i + 1, end).trim();
      i = end + 1;
      if (body.includes("...")) { elements.push(new Element("rest")); continue; }
      if (body.startsWith("<") && body.endsWith(">")) {
        elements.push(new Element("arg", body.slice(1, -1).trim(), true));
        continue;
      }
      elements.push(new Element("choice", body.split("|").map(o => o.trim()), true));
      continue;
    }
    if (char === "(") {
      const end = text.indexOf(")", i);
      if (end < 0) throw new PatternError("未闭合的 '('：" + repr(pattern));
      elements.push(new Element("choice", text.slice(i + 1, end).split("|").map(o => o.trim()), false));
      i = end + 1;
      continue;
    }
    let end = i;
    while (end < text.length && !isSpace(text[end]) && !"<[(".includes(text[end])) end++;
    elements.push(new Element("literal", text.slice(i, end)));
    i = end;
  }
  return elements;
}

// 签名是静态数据，解析结果按原文缓存，避免每条命令重复解析。
const patternCache = new Map();
function patternOf(pattern) {
  let elements = patternCache.get(pattern);
  if (elements === undefined) {
    elements = parsePattern(pattern);
    patternCache.set(pattern, elements);
  }
  return elements;
}

/* ---------------- 基本判定 ---------------- */

export function coordComponents(token) {
  const parts = String(token).match(COMPONENT_SCAN_RE);
  if (!parts || parts.join("") !== String(token)) return null;
  return parts;
}

export function isCoord(token) {
  const parts = coordComponents(token);
  return Boolean(parts) && parts.length >= 1 && parts.length <= 3;
}

export function consumePos(tokens, i) {
  const components = [];
  let j = i;
  while (j < tokens.length && components.length < 3) {
    const parts = coordComponents(tokens[j]);
    if (!parts || components.length + parts.length > 3) return null;
    components.push(...parts);
    j++;
  }
  return components.length === 3 ? j : null;
}

export const isInt = token => INT_RE.test(String(token));
export const isNumber = token => NUMBER_RE.test(String(token));

export function isTarget(token) {
  const text = String(token);
  if (text === "*" || SELECTOR_RE.test(text)) return true;
  if (isCoord(text)) return false;
  return /^[^\s\[\]]+$/.test(text);
}

export const isBlock = token => BLOCK_RE.test(String(token)) || String(token).startsWith("minecraft:");

export function isJson(token) {
  try { JSON.parse(String(token)); return true; } catch { return false; }
}

function selectorCandidates(kind, tokens, i) {
  if (i >= tokens.length) return [];
  const token = tokens[i];
  switch (kind) {
    case "target": return isTarget(token) ? [i + 1] : [];
    case "pos": { const next = consumePos(tokens, i); return next === null ? [] : [next]; }
    case "rot":
      return i + 2 <= tokens.length && isNumber(tokens[i]) && isNumber(tokens[i + 1]) ? [i + 2] : [];
    case "int": return isInt(token) ? [i + 1] : [];
    case "float":
    case "number": return isNumber(token) ? [i + 1] : [];
    case "objective": return OBJECTIVE_RE.test(token) ? [i + 1] : [];
    case "displayslot": return DISPLAY_SLOTS.has(String(token).toLowerCase()) ? [i + 1] : [];
    case "slottype": return String(token).toLowerCase().startsWith("slot.") ? [i + 1] : [];
    case "gamemode": return GAMEMODES.has(String(token).toLowerCase()) ? [i + 1] : [];
    case "block":
    case "item": return isBlock(token) ? [i + 1] : [];
    case "states":
      return String(token).startsWith("[") && String(token).endsWith("]") && String(token).includes('"') ? [i + 1] : [];
    case "entity": return /^(?:[a-z0-9_]+:)?[a-z0-9_./]+$/.test(String(token)) ? [i + 1] : [];
    case "json": return isJson(token) ? [i + 1] : [];
    default: return [i + 1];
  }
}

function matchPattern(elements, tokens, ei, ti) {
  if (ei === elements.length) return ti === tokens.length ? ti : null;
  const element = elements[ei];
  if (element.kind === "rest") return tokens.length;
  if (element.kind === "literal") {
    return ti < tokens.length && String(tokens[ti]).toLowerCase() === String(element.value).toLowerCase()
      ? matchPattern(elements, tokens, ei + 1, ti + 1) : null;
  }
  if (element.kind === "choice") {
    if (ti < tokens.length && element.value.map(o => String(o).toLowerCase()).includes(String(tokens[ti]).toLowerCase())) {
      return matchPattern(elements, tokens, ei + 1, ti + 1);
    }
    if (element.optional) return matchPattern(elements, tokens, ei + 1, ti);
    return null;
  }
  for (const next of selectorCandidates(String(element.value), tokens, ti)) {
    const result = matchPattern(elements, tokens, ei + 1, next);
    if (result !== null) return result;
  }
  if (element.optional) return matchPattern(elements, tokens, ei + 1, ti);
  return null;
}

/* ---------------- 选择器 ---------------- */

export function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function checkSelector(token, issues) {
  const match = SELECTOR_RE.exec(token);
  if (!match) return;
  const body = match[2];
  if (body === undefined) return;
  for (const part of splitTopLevel(body)) {
    const eq = part.indexOf("=");
    const name = (eq < 0 ? part : part.slice(0, eq)).trim();
    if (!name) continue;
    if (JAVA_ONLY_PARAMS.has(name)) {
      issues.push(new Issue(ERROR, "java-selector", "'@" + match[1] + "' 使用了 Java 专属参数 " + name + "=", token));
    } else if (!SELECTOR_PARAMS.has(name)) {
      issues.push(new Issue(ERROR, "selector-param", "未知选择器参数 " + name + "=", token));
    } else if (name === "type" || name === "family") {
      const value = (eq < 0 ? "" : part.slice(eq + 1)).trim().replace(/^!+/, "").replace(/^"+|"+$/g, "");
      if (value) checkId(name === "type" ? "entity" : "family", value, issues, token, name + "=");
    }
  }
}

/* ---------------- ID 数据 ---------------- */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const DATA_DIR = path.join(ROOT, "data", "ids");

const cache = new Map();

export function canonical(value) {
  let text = String(value ?? "").trim().toLowerCase();
  if (text.startsWith("minecraft:")) text = text.slice("minecraft:".length);
  return text;
}

function splitEntry(line) {
  let index;
  if (line.startsWith("minecraft:")) index = line.indexOf(":", "minecraft:".length);
  else index = line.indexOf(":");
  if (index <= 0) return null;
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}

export function loadIds(category) {
  if (!ID_CATEGORIES.has(category)) throw new Error("未知 ID 类别 " + repr(category));
  if (cache.has(category)) return cache.get(category);
  const file = path.join(DATA_DIR, ID_CATEGORIES.get(category)[0]);
  const entries = new Map();
  if (fs.existsSync(file)) {
    for (let line of fs.readFileSync(file, "utf8").split(/\r\n|\n|\r/)) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.startsWith("【")) continue;
      const split = splitEntry(line);
      if (!split) continue;
      entries.set(canonical(split[0]), split[1]);
    }
  }
  cache.set(category, entries);
  return entries;
}

export function hasId(category, value) {
  return loadIds(category).has(canonical(value));
}

function similarity(a, b) {
  if (a === b) return 1;
  const total = a.length + b.length;
  if (!total) return 1;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return (2 * prev[b.length]) / total;
}

const suggestCache = new Map();

export function suggestId(category, value, count = 3) {
  const key = canonical(value);
  if (!key) return [];
  const cacheKey = category + "\u0000" + key + "\u0000" + count;
  const cached = suggestCache.get(cacheKey);
  if (cached) return cached;
  // 长度比超过 2.33 时相似度上界已低于 0.6，先过滤可省掉大部分 LCS 计算。
  const maxLen = Math.floor(key.length * 2.4);
  const minLen = Math.ceil(key.length / 2.4);
  const result = [...loadIds(category).keys()]
    .filter(candidate => candidate.length >= minLen && candidate.length <= maxLen)
    .map((candidate, i) => ({ candidate, i, ratio: similarity(key, candidate) }))
    .filter(item => item.ratio >= 0.6)
    .sort((a, b) => b.ratio - a.ratio || a.i - b.i)
    .slice(0, count)
    .map(item => item.candidate);
  suggestCache.set(cacheKey, result);
  return result;
}

export function searchId(category, needle) {
  const query = String(needle ?? "").trim().toLowerCase();
  const rows = [];
  for (const [key, note] of [...loadIds(category)].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (key.includes(query) || note.toLowerCase().includes(query)) rows.push({ id: key, note });
  }
  return rows;
}

export function categoryCounts() {
  return new Map([...ID_CATEGORIES.keys()].map(name => [name, loadIds(name).size]));
}

export function categoriesTable() {
  return [...ID_CATEGORIES].map(([name, [file, label, , extensible]]) => [
    name, label, loadIds(name).size, "data/ids/" + file, extensible ? "附加包可扩展" : "仅原版",
  ]);
}

function checkId(category, value, issues, cmd, label = "") {
  const meta = ID_CATEGORIES.get(category);
  if (!meta) return;
  const raw = String(value ?? "").trim().replace(/^"+|"+$/g, "");
  if (!raw || raw.startsWith("@") || raw.startsWith("~")) return;
  if (hasId(category, raw)) return;
  const severity = meta[3] ? WARN : ERROR;
  const hint = suggestId(category, raw);
  const suffix = hint.length ? "，是不是 " + repr(hint[0]) + "？" : "";
  issues.push(new Issue(severity, "unknown-" + category,
    (label || meta[1]) + "未收录 " + repr(raw) + suffix + "（见 data/ids/" + meta[0] + "）", cmd));
}

function checkIdArgs(key, rest, issues, cmd) {
  const spec = ID_ARGS.get(key);
  if (spec) {
    const [index, category] = spec;
    if (index < rest.length) checkId(category, rest[index], issues, cmd);
  }
  if (key === "locate" && rest.length && String(rest[0]).toLowerCase() === "biome" && rest.length > 1) {
    checkId("biome", rest[1], issues, cmd);
  }
  for (const token of rest) {
    if (String(token).toLowerCase().startsWith("slot.")) checkId("slot", token, issues, cmd, "槽位");
  }
}

function checkOperators(tokens, issues, cmd) {
  if (tokens.includes("players") && tokens.includes("operation")) {
    const index = tokens.indexOf("operation");
    const opIndex = index + 3;
    if (opIndex < tokens.length && !SCOREBOARD_OPS.has(tokens[opIndex])) {
      issues.push(new Issue(ERROR, "scoreboard-op",
        "未知的运算 " + repr(tokens[opIndex]) + "；可用 " + [...SCOREBOARD_OPS].sort().join(", "), cmd));
    }
  }
}

/* ---------------- execute ---------------- */

function checkExecute(tokens, cmd) {
  const issues = [];
  let i = 1;
  let sawRun = false;
  while (i < tokens.length) {
    const sub = String(tokens[i]).toLowerCase();
    if (sub === "run") {
      sawRun = true;
      const rest = tokens.slice(i + 1);
      if (!rest.length) {
        issues.push(new Issue(ERROR, "execute-run-empty", "run 后面没有命令", cmd));
      } else {
        issues.push(...checkCommand(rest.join(" "), true));
      }
      break;
    }
    if (sub === "as" || sub === "at") { i += 2; continue; }
    if (sub === "positioned" || sub === "rotated") {
      if (i + 1 < tokens.length && String(tokens[i + 1]).toLowerCase() === "as") { i += 3; continue; }
      const next = consumePos(tokens, i + 1);
      if (next === null) {
        issues.push(new Issue(ERROR, "execute-pos", sub + " 后面需要坐标", cmd));
        break;
      }
      i = next;
      continue;
    }
    if (sub === "align") {
      if (i + 1 >= tokens.length || !/^[xyz]+$/.test(tokens[i + 1])) {
        issues.push(new Issue(ERROR, "execute-align", "align 需要 x/y/z 组合", cmd));
        break;
      }
      i += 2;
      continue;
    }
    if (sub === "anchored") {
      if (i + 1 >= tokens.length || !["eyes", "feet"].includes(String(tokens[i + 1]).toLowerCase())) {
        issues.push(new Issue(ERROR, "execute-anchored", "anchored 需要 eyes 或 feet", cmd));
        break;
      }
      i += 2;
      continue;
    }
    if (sub === "facing") {
      if (i + 1 < tokens.length && String(tokens[i + 1]).toLowerCase() === "entity") { i += 4; continue; }
      const next = consumePos(tokens, i + 1);
      if (next === null) {
        issues.push(new Issue(ERROR, "execute-facing", "facing 需要坐标或 entity <target> eyes|feet", cmd));
        break;
      }
      i = next;
      continue;
    }
    if (sub === "in" || sub === "on") { i += 2; continue; }
    if (sub === "if" || sub === "unless") {
      i += 1;
      if (i >= tokens.length) {
        issues.push(new Issue(ERROR, "execute-condition", sub + " 后面缺少条件", cmd));
        break;
      }
      const kind = String(tokens[i]).toLowerCase();
      i += 1;
      if (kind === "block") {
        const next = consumePos(tokens, i);
        if (next === null) {
          issues.push(new Issue(ERROR, "execute-condition", "if block 需要坐标", cmd));
          break;
        }
        i = next + 1;
      } else if (kind === "blocks") {
        let next = consumePos(tokens, i);
        if (next === null) { issues.push(new Issue(ERROR, "execute-condition", "if blocks 需要三个坐标", cmd)); break; }
        i = next;
        next = consumePos(tokens, i);
        if (next === null) { issues.push(new Issue(ERROR, "execute-condition", "if blocks 需要三个坐标", cmd)); break; }
        i = next;
        next = consumePos(tokens, i);
        if (next === null) { issues.push(new Issue(ERROR, "execute-condition", "if blocks 需要三个坐标", cmd)); break; }
        i = next;
        if (i < tokens.length && ["all", "masked"].includes(String(tokens[i]).toLowerCase())) i += 1;
      } else if (kind === "entity") {
        i += 1;
      } else if (kind === "score") {
        if (i + 1 >= tokens.length) {
          issues.push(new Issue(ERROR, "execute-condition", "if score 缺少目标", cmd));
          break;
        }
        if (i + 2 < tokens.length && String(tokens[i + 2]).toLowerCase() === "matches") {
          if (i + 3 >= tokens.length) {
            issues.push(new Issue(ERROR, "execute-condition", "if score ... matches 缺少区间", cmd));
            break;
          }
          if (!RANGE_RE.test(tokens[i + 3])) {
            issues.push(new Issue(ERROR, "score-range",
              "分数区间 " + repr(tokens[i + 3]) + " 无效（例：5、1..5、..5、5..）", cmd));
          }
          i += 4;
        } else {
          if (i + 4 >= tokens.length) {
            issues.push(new Issue(ERROR, "execute-condition", "if score 需要 <目标> <计分板> <运算> <目标> <计分板>", cmd));
            break;
          }
          if (!EXECUTE_SCORE_OPS.has(tokens[i + 2])) {
            issues.push(new Issue(ERROR, "scoreboard-op",
              "if score 的运算 " + repr(tokens[i + 2]) + " 无效（可用 " + [...EXECUTE_SCORE_OPS].sort().join(" ") + "）", cmd));
          }
          i += 5;
        }
      } else {
        issues.push(new Issue(ERROR, "execute-condition",
          "未知条件 " + repr(kind) + "（可用 block/blocks/entity/score）", cmd));
        break;
      }
      continue;
    }
    issues.push(new Issue(ERROR, "execute-subcommand", "未知 execute 子命令 " + repr(tokens[i]), cmd));
    break;
  }
  if (!sawRun) issues.push(new Issue(ERROR, "execute-no-run", "execute 必须以 run <命令> 结尾", cmd));
  return issues;
}

/* ---------------- 主入口 ---------------- */

function resolveKey(tokens) {
  for (const size of [4, 3, 2, 1]) {
    if (size <= tokens.length) {
      const key = tokens.slice(0, size).map(t => String(t).toLowerCase()).join(" ");
      if (COMMAND_TABLE.has(key)) return [key, size];
    }
  }
  return [null, 0];
}

function postChecks(key, tokens, cmd) {
  const issues = [];
  checkOperators(tokens, issues, cmd);
  if (key === "tellraw" || key === "titleraw") {
    for (const token of tokens) {
      if (String(token).startsWith("{") && !isJson(token)) {
        issues.push(new Issue(ERROR, "rawtext-json", "rawtext 不是合法 JSON", cmd));
        break;
      }
    }
    if (!tokens.some(token => String(token).startsWith("{"))) {
      issues.push(new Issue(ERROR, "rawtext-json", "tellraw/titleraw 需要 {rawtext:...} JSON", cmd));
    }
  }
  return issues;
}

export function checkCommand(cmd, allowExecute = true) {
  const text = String(cmd ?? "").trim();
  if (!text) return [new Issue(ERROR, "empty", "空命令", text)];
  const [tokens, problem] = tokenize(text);
  if (problem) return [new Issue(ERROR, "tokenize", problem, text)];
  if (!tokens.length) return [new Issue(ERROR, "empty", "空命令", text)];

  const issues = [];
  for (const token of tokens) {
    if (String(token).startsWith("@")) checkSelector(token, issues);
  }

  const [key, used] = resolveKey(tokens);
  if (key === null) {
    for (const token of tokens) {
      if (String(token).includes(":") && !String(token).startsWith("@") && !String(token).includes("/")) {
        issues.push(new Issue(WARN, "namespaced-command", "命令名不能带命名空间：" + repr(tokens[0]), text));
        break;
      }
    }
    issues.push(new Issue(ERROR, "unknown-command", "未知命令 " + repr(tokens[0]), text));
    return issues;
  }

  if (key === "execute") return [...issues, ...checkExecute(tokens, text)];

  const entry = COMMAND_TABLE.get(key);
  const rest = tokens.slice(used);
  let bestMissing = "";
  for (const pattern of entry.patterns) {
    let elements;
    try {
      elements = patternOf(pattern);
    } catch (error) {
      if (error instanceof PatternError) {
        issues.push(new Issue(WARN, "bad-signature", "内部签名错误：" + error.message, text));
        continue;
      }
      throw error;
    }
    if (matchPattern(elements, rest, 0, 0) !== null) {
      issues.push(...postChecks(key, tokens, text));
      checkIdArgs(key, rest, issues, text);
      return issues;
    }
    if (!bestMissing) bestMissing = pattern;
  }

  if (!entry.certain) {
    issues.push(new Issue(INFO, "lenient-signature", key + " 的签名未完全校验（" + bestMissing + "）", text));
    checkIdArgs(key, rest, issues, text);
    return issues;
  }
  issues.push(new Issue(ERROR, "args",
    key + " 的参数不匹配；期望 " + bestMissing + "，实际 " + (rest.length ? rest.join(" ") : "(无)"), text));
  return issues;
}

export function checkCommands(commands) {
  const issues = [];
  for (const cmd of commands) issues.push(...checkCommand(cmd));
  return issues;
}
