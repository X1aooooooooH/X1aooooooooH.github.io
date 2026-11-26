import { COMMAND_TYPES } from "./format.js";
import {
  findBrokenSetblockIndexes, hasExecuteAtBeforeRun, hasRelativeCoordinateSyntax,
  isBrokenChainPlaceholder, isExecuteRunRelativeCommand, isSetblockFirstMarker,
  isSetblockSecondMarker, isTestforCommand, relativeCommandOperation,
} from "./chain.js";

export const ERROR = "error";
export const WARN = "warn";
export const INFO = "info";

const OBJECTIVE_ADD_RE = /^\s*\/?\s*scoreboard\s+objectives\s+add\s+(\S+)/i;
const SCOREBOARD_USE_RE = /scoreboard\s+players\s+\w+\s+[^ ]+\s+([A-Za-z0-9_.-]+)/i;
const SCORES_SELECTOR_RE = /scores\s*=\s*\{([^}]*)\}/i;
const EXECUTE_WITHOUT_RUN_RE = /^\s*\/?execute\b/i;
const LEGACY_EXECUTE_RE = /^\s*\/?execute\s+@[a-z]/i;
const SELECTOR_RE = /@([a-z])(\[([^\]]*)\])?/;
const EXECUTE_RE = /^\s*\/?\s*execute\b/i;
const AS_RE = /\bas\s+@/i;
const RESET_RE = /^\s*\/?\s*scoreboard\s+players\s+reset\s+(\S+)\s+(\S+)\s*$/i;
const OBJECTIVE_NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const AS_G = new RegExp(AS_RE.source, "gi");
const SELECTOR_G = new RegExp(SELECTOR_RE.source, "g");
const SCORES_SELECTOR_G = new RegExp(SCORES_SELECTOR_RE.source, "gi");
const SCOREBOARD_USE_G = new RegExp(SCOREBOARD_USE_RE.source, "gi");

export class Finding {
  constructor(severity, code, message, { chain = null, step = null, index = null, cmd = "" } = {}) {
    this.severity = severity;
    this.code = code;
    this.message = message;
    this.chain = chain;
    this.step = step;
    this.index = index;
    this.cmd = cmd;
  }
  as_dict() {
    const out = { severity: this.severity, code: this.code, message: this.message };
    if (this.index !== null) out.line = this.index;
    if (this.chain !== null) out.chain = this.chain;
    if (this.step !== null) out.step = this.step;
    if (this.cmd) out.cmd = this.cmd;
    return out;
  }
}

function sortedKeys(values) {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function withKeys(map) {
  return new Set(map.keys());
}

/* ---------------- 风格规则（第 1–4 条） ---------------- */

export function selectorArgs(body) {
  const args = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function selectorsIn(cmd) {
  const found = [];
  for (const match of String(cmd ?? "").matchAll(SELECTOR_G)) {
    const body = match[3] ?? "";
    found.push(["@" + match[1], body ? selectorArgs(body) : []]);
  }
  return found;
}

export function checkStyleCommands(commands, maxSelectorArgs = 2) {
  const findings = [];
  let executeCount = 0;

  commands.forEach((raw, i) => {
    const index = i + 1;
    const stripped = String(raw ?? "").trim();
    if (!stripped) return;

    if (RESET_RE.test(stripped)) {
      findings.push(new Finding(ERROR, "rule1-reset",
        "scoreboard players reset: replace with objectives remove + add", { index, cmd: stripped }));
    }

    for (const [selector, args] of selectorsIn(stripped)) {
      if (args.length > maxSelectorArgs) {
        findings.push(new Finding(WARN, "rule2-selector-args",
          selector + " has " + args.length + " arguments (" + args.join(", ") + "); prefer tag/scores only",
          { index, cmd: stripped }));
      }
    }

    if (EXECUTE_RE.test(stripped)) {
      executeCount++;
      const asHits = (stripped.match(AS_G) ?? []).length;
      if (asHits > 1) {
        findings.push(new Finding(WARN, "rule3-many-as",
          "execute uses 'as' " + asHits + " times; keep at most one", { index, cmd: stripped }));
      }
      if (!(" " + stripped + " ").includes(" run ")) {
        findings.push(new Finding(ERROR, "execute-without-run",
          "execute has no run subcommand", { index, cmd: stripped }));
      }
    }
  });

  if (commands.length) {
    const ratio = executeCount / Math.max(1, commands.length);
    if (ratio > 0.5 && executeCount > 3) {
      findings.push(new Finding(INFO, "rule4-execute-heavy",
        executeCount + "/" + commands.length + " commands are execute; check whether a native selector form is enough"));
    }
  }
  return findings;
}

export function rewriteCommands(commands) {
  const out = [];
  const notes = [];
  for (const raw of commands) {
    const cmd = String(raw ?? "").replace(/\s+$/, "");
    const match = RESET_RE.exec(cmd.trim());
    if (!match) { out.push(cmd); continue; }
    const [target, objective] = [match[1], match[2]];
    const lineNo = out.length + 1;
    if (objective === "*") {
      notes.push("line " + lineNo + ": '" + cmd + "' resets all objectives; rewrite by hand");
      out.push(cmd);
      continue;
    }
    if (!OBJECTIVE_NAME_RE.test(objective)) {
      notes.push("line " + lineNo + ": objective '" + objective + "' is not a valid name");
      out.push(cmd);
      continue;
    }
    const prefix = cmd.trimStart().startsWith("/") ? "/" : "";
    out.push(prefix + "scoreboard objectives remove " + objective);
    out.push(prefix + "scoreboard objectives add " + objective + " dummy");
    notes.push("line " + lineNo + ": reset " + target + " " + objective + " -> remove + add " + objective);
  }
  return [out, notes];
}

/* ---------------- 链规则 ---------------- */

function balancedJson(text) {
  const marker = String(text).indexOf('"rawtext"');
  if (marker < 0) return [true, ""];
  const start = String(text).lastIndexOf("{", marker);
  if (start < 0) return [true, ""];
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, index + 1);
        try {
          JSON.parse(candidate);
        } catch (error) {
          return [false, "invalid JSON: " + error.message];
        }
        return [true, ""];
      }
    }
  }
  return [false, "unbalanced JSON braces"];
}

export function declaredObjectives(structure) {
  const objectives = new Set();
  for (const block of structure.blocks.values()) {
    const match = OBJECTIVE_ADD_RE.exec(block.cmd ?? "");
    if (match) objectives.add(match[1]);
  }
  return objectives;
}

export function usedObjectives(cmd) {
  const used = new Set();
  for (const match of String(cmd).matchAll(SCORES_SELECTOR_G)) {
    for (const part of match[1].split(",")) {
      const name = part.split("=")[0].trim();
      if (name) used.add(name);
    }
  }
  for (const match of String(cmd).matchAll(SCOREBOARD_USE_G)) {
    const name = match[1];
    if (!["set", "add", "remove", "reset", "list", "get", "operation"].includes(name)) used.add(name);
  }
  return used;
}

export function lintChains(structure, chains) {
  const findings = [];
  const declared = declaredObjectives(structure);
  for (const block of structure.blocks.values()) {
    if (!COMMAND_TYPES.includes(block.type)) continue;
    if (!String(block.cmd ?? "").trim()) {
      findings.push(new Finding(WARN, "empty-command",
        "command block at (" + block.x + "," + block.y + "," + block.z + ") has no command text"));
    } else if (!String(block.cmd).trimStart().startsWith("/")) {
      findings.push(new Finding(INFO, "no-slash",
        "(" + block.x + "," + block.y + "," + block.z + ") omits the leading slash (allowed, but keep it consistent)"));
    }
    const relativeOp = relativeCommandOperation(block.cmd);
    if (["fill", "clone", "structure"].includes(relativeOp) && hasRelativeCoordinateSyntax(block.cmd)) {
      findings.push(new Finding(INFO, "relative-non-marker",
        "(" + block.x + "," + block.y + "," + block.z + ") uses relative coordinates in /" + relativeOp +
        "; this is NOT a chain marker"));
    }
  }
  chains.forEach((chain, i) => findings.push(...lintChain(chain, i + 1, declared)));
  return findings;
}

function lintChain(chain, index, declared) {
  const findings = [];
  const blocks = chain.blocks;
  const mark = step => ({ chain: index, step });

  const repeating = blocks.map((b, i) => (b.type === "repeating" ? i : -1)).filter(i => i >= 0);
  if (repeating.length > 1) {
    findings.push(new Finding(WARN, "multiple-repeating",
      "chain " + index + " contains " + repeating.length + " repeating command blocks; only one is allowed",
      mark(repeating[1])));
  }

  if (chain.type === "snake") {
    const headKind = chain.head_kind;
    const groups = chain.broken_groups ?? [];
    const kind = groups.length ? groups[0] : (chain.broken_kind ?? "");
    let markerIndexes = findBrokenSetblockIndexes(blocks);
    if (kind.startsWith("execute") && markerIndexes.includes(0)) {
      markerIndexes = markerIndexes.filter(i => i !== 0);
    }
    const expectedMarkers = kind === "execute-direct" ? 1 : 2;
    if (markerIndexes.length !== expectedMarkers) {
      findings.push(new Finding(ERROR, "broken-head-markers",
        "chain " + index + " looks like a broken head but has " + markerIndexes.length +
        " /setblock marker(s), expected " + expectedMarkers, mark(0)));
    } else if (kind === "execute-direct") {
      const step = markerIndexes[0];
      if (!isSetblockSecondMarker(blocks[step].cmd)) {
        findings.push(new Finding(ERROR, "marker-template",
          "chain " + index + " step " + step + " should be /setblock ~~~ chain_command_block", mark(step)));
      }
      if (blocks[step].type !== "chain") {
        findings.push(new Finding(ERROR, "marker-block-type",
          "chain " + index + " step " + step + ": markers must be chain command blocks, found " + blocks[step].type,
          mark(step)));
      }
      if (blocks[step].cond !== 0) {
        findings.push(new Finding(WARN, "marker-conditional",
          "chain " + index + " step " + step + ": execute-head marker conditional should be 0", mark(step)));
      }
    } else {
      const [first, second] = markerIndexes;
      if (!isSetblockFirstMarker(blocks[first].cmd)) {
        findings.push(new Finding(ERROR, "marker-template",
          "chain " + index + " step " + first + " should be /setblock ~~~-1 chain_command_block", mark(first)));
      }
      if (!isSetblockSecondMarker(blocks[second].cmd)) {
        findings.push(new Finding(ERROR, "marker-template",
          "chain " + index + " step " + second + " should be /setblock ~~~ chain_command_block", mark(second)));
      }
      for (const step of [first, second]) {
        if (blocks[step].type !== "chain") {
          findings.push(new Finding(ERROR, "marker-block-type",
            "chain " + index + " step " + step + ": markers must be chain command blocks, found " + blocks[step].type,
            mark(step)));
        }
      }
      const expectedFirstCond = headKind === "testfor" ? 1 : 0;
      if (blocks[first].cond !== expectedFirstCond) {
        findings.push(new Finding(WARN, "marker-conditional",
          "chain " + index + " step " + first + ": first marker conditional should be " + expectedFirstCond, mark(first)));
      }
      if (blocks[second].cond !== 0) {
        findings.push(new Finding(WARN, "marker-conditional",
          "chain " + index + " step " + second + ": second marker conditional should be 0", mark(second)));
      }
    }
  }

  const hintsSeen = new Set();
  blocks.forEach((block, step) => {
    const cmd = block.cmd ?? "";
    if (cmd.includes("operation") && (cmd.includes("@e") || cmd.includes("@a")) &&
        !hintsSeen.has("operation-multi-target")) {
      hintsSeen.add("operation-multi-target");
      findings.push(new Finding(INFO, "operation-multi-target",
        "chain " + index + ": 多目标 operation 是笛卡尔积（目标×源逐对执行），求最值/求和/分配 UID 都依赖这一点（见 special-patterns.md §3）",
        mark(step)));
    }
    if (/\bat\s+@[ae]/.test(cmd) && cmd.includes("@p") && !hintsSeen.has("pairing-at-p")) {
      hintsSeen.add("pairing-at-p");
      findings.push(new Finding(INFO, "pairing-at-p",
        "chain " + index + ": at 多目标 + @p 是笛卡尔积（n×m 次触发），且单条命令只能标记一侧；分数不唯一时会多对多（见 special-patterns.md §2）",
        mark(step)));
    }
    if (isTestforCommand(cmd) && step !== 0) {
      findings.push(new Finding(WARN, "testfor-not-head",
        "chain " + index + " step " + step + ": testfor is not the chain head", mark(step)));
    }
    if (EXECUTE_WITHOUT_RUN_RE.test(cmd) && !(" " + cmd + " ").includes(" run ")) {
      findings.push(new Finding(ERROR, "execute-without-run",
        "chain " + index + " step " + step + ": execute has no run subcommand", { ...mark(step), cmd }));
    }
    if (LEGACY_EXECUTE_RE.test(cmd) && !String(cmd).trimStart().toLowerCase().startsWith("/execute as")) {
      findings.push(new Finding(WARN, "legacy-execute",
        "chain " + index + " step " + step + ": legacy execute syntax; Bedrock 1.19.80+ needs execute as|at|if ... run",
        { ...mark(step), cmd }));
    }
    if (isExecuteRunRelativeCommand(cmd) && hasExecuteAtBeforeRun(cmd) && step === 0) {
      findings.push(new Finding(INFO, "execute-at-not-head",
        "chain " + index + " step 0: execute uses 'at @' before run, so it is not a broken head", mark(step)));
    }
    if (/\btellraw\b|\btitleraw\b/i.test(cmd)) {
      const [ok, message] = balancedJson(cmd);
      if (!ok) {
        findings.push(new Finding(ERROR, "rawtext-json",
          "chain " + index + " step " + step + ": " + message, { ...mark(step), cmd }));
      }
    }
    const undeclared = [...usedObjectives(cmd)].filter(name => !declared.has(name));
    for (const objective of sortedKeys(undeclared)) {
      findings.push(new Finding(INFO, "objective-undeclared",
        "chain " + index + " step " + step + ": objective '" + objective + "' has no scoreboard objectives add in this structure",
        mark(step)));
    }
  });

  if (isBrokenChainPlaceholder(blocks)) {
    findings.push(new Finding(INFO, "broken-placeholder",
      "chain " + index + " starts with an empty command block; verify the gap slot is intended", mark(0)));
  }
  return findings;
}

/* ---------------- 系统审计 ---------------- */

const OBJ_ADD = /^\/scoreboard objectives add (\S+) (\S+)/;
const PLAYERS = /\/scoreboard players (\w+) (\S+) ([A-Za-z0-9_]+)/;
const SET_SETTINGS = /^\/scoreboard players set (\S+) settings (-?\d+)$/;
const OP_SETTINGS = /\/scoreboard players operation (\S+) settings (?:=|\+=|-=|\*=|\/=|%=) /;
const SCORES = /scores=\{([^}]*)\}/;
const TAG = /\/tag (\S+) (add|remove) (\S+)/;
const SCORE_COND = /(?:if|unless) score (\S+) ([A-Za-z0-9_]+) (matches \S+|[<>=]+ \S+ [A-Za-z0-9_]+)/;
const DIV = /\/scoreboard players operation \S+ ([A-Za-z0-9_]+) ([%/]=) (\S+) settings/;
const JSON_OBJECTIVE = /"objective"\s*:\s*"([A-Za-z0-9_]+)"/;
const OP_SOURCE = /players operation (\S+) ([A-Za-z0-9_]+) (\S+) (\S+) ([A-Za-z0-9_]+)/;
const LITERAL_SET_RE = /\/scoreboard players set \S+ ([A-Za-z0-9_]+) (-?\d+)$/;
const SETTINGS_USE_G = /(?:^|[\s(])(\S+) settings(?=[\s)\]]|$)/g;
const MATCHES_G = /matches (\S+)/g;
const IF_SCORE_MATCHES_RE = /if score \S+ ([A-Za-z0-9_]+) matches/;
const PLAYERS_G = new RegExp(PLAYERS.source, "g");
const SCORES_G = new RegExp(SCORES.source, "g");
const SCORE_COND_G = new RegExp(SCORE_COND.source, "g");
const JSON_OBJECTIVE_G = new RegExp(JSON_OBJECTIVE.source, "g");
const OP_SOURCE_G = new RegExp(OP_SOURCE.source, "g");
const OP_SETTINGS_G = new RegExp(OP_SETTINGS.source, "g");

export function allCommands(chains) {
  const out = [];
  for (const chain of chains) {
    for (const block of chain.blocks) {
      if (!block.is_air_placeholder && String(block.cmd ?? "").trim()) out.push(block.cmd);
    }
  }
  return out;
}

function createdObjectives(commands) {
  const out = new Map();
  for (const cmd of commands) {
    const match = OBJ_ADD.exec(String(cmd).trim());
    if (match) out.set(match[1], match[2]);
  }
  return out;
}

function referencedObjectives(commands) {
  const found = new Set();
  for (const cmd of commands) {
    for (const match of String(cmd).matchAll(PLAYERS_G)) found.add(match[3]);
    for (const match of String(cmd).matchAll(SCORES_G)) {
      for (const part of match[1].split(",")) {
        const name = part.split("=")[0].trim();
        if (name) found.add(name);
      }
    }
    for (const match of String(cmd).matchAll(SCORE_COND_G)) found.add(match[2]);
    for (const match of String(cmd).matchAll(JSON_OBJECTIVE_G)) found.add(match[1]);
    for (const match of String(cmd).matchAll(OP_SOURCE_G)) {
      found.add(match[2]);
      found.add(match[5]);
    }
  }
  return found;
}

function settingsSets(commands) {
  const out = new Map();
  for (const cmd of commands) {
    const match = SET_SETTINGS.exec(String(cmd).trim());
    if (match) {
      out.set(match[1], Number(match[2]));
      continue;
    }
    for (const op of String(cmd).matchAll(OP_SETTINGS_G)) {
      if (!out.has(op[1])) out.set(op[1], 0);
    }
  }
  return out;
}

function settingsUses(commands) {
  const used = new Set();
  for (const cmd of commands) {
    if (String(cmd).includes("objectives")) continue;
    for (const match of String(cmd).matchAll(SETTINGS_USE_G)) {
      const name = match[1].replace(/^\//, "");
      if (name && !["if", "unless", "score"].includes(name)) used.add(name);
    }
  }
  return used;
}

function tagCounts(commands) {
  const out = new Map();
  for (const cmd of commands) {
    const match = TAG.exec(cmd);
    if (!match) continue;
    const tag = match[3];
    if (!out.has(tag)) out.set(tag, [0, 0]);
    const pair = out.get(tag);
    const slot = match[2] === "add" ? 0 : 1;
    pair[slot] += 1;
  }
  return out;
}

function literalValues(commands) {
  const out = new Map();
  for (const cmd of commands) {
    const match = LITERAL_SET_RE.exec(String(cmd).trim());
    if (match) {
      if (!out.has(match[1])) out.set(match[1], new Set());
      out.get(match[1]).add(Number(match[2]));
    }
  }
  return out;
}

function testedValues(commands) {
  const out = new Map();
  const add = (name, text) => {
    const value = String(text).trim();
    if (value.includes("..")) {
      const [lowText, highText] = value.split("..", 2);
      const low = /^-?\d+$/.test(lowText.trim()) ? Number(lowText) : null;
      const high = /^-?\d+$/.test(highText.trim()) ? Number(highText) : null;
      if (!out.has(name)) out.set(name, []);
      out.get(name).push([low, high]);
    } else if (/^-?\d+$/.test(value)) {
      const single = Number(value);
      if (!out.has(name)) out.set(name, []);
      out.get(name).push([single, single]);
    }
  };
  for (const cmd of commands) {
    for (const match of String(cmd).matchAll(SCORES_G)) {
      for (const part of match[1].split(",")) {
        if (!part.includes("=")) continue;
        const [name, value] = part.split("=").slice(0, 2);
        add(name.trim(), value);
      }
    }
    for (const match of String(cmd).matchAll(MATCHES_G)) {
      const nameMatch = IF_SCORE_MATCHES_RE.exec(cmd);
      if (nameMatch) add(nameMatch[1], match[1]);
    }
  }
  return out;
}

export function auditStructure(structure, chains) {
  const commands = allCommands(chains);
  const findings = [];
  const created = createdObjectives(commands);
  const used = referencedObjectives(commands);
  const constSets = settingsSets(commands);
  const constUses = settingsUses(commands);

  const missing = sortedKeys([...used].filter(name => !withKeys(created).has(name) && name !== "settings"));
  for (const name of missing) {
    findings.push(new Finding(ERROR, "objective-missing", "计分板 " + name + " 被引用但从未 objectives add"));
  }
  const unused = sortedKeys([...withKeys(created)].filter(name => !used.has(name)));
  for (const name of unused) {
    findings.push(new Finding(INFO, "objective-unused", "计分板 " + name + " 创建后从未被使用"));
  }
  const constMissing = sortedKeys([...constUses].filter(name => !withKeys(constSets).has(name)));
  for (const name of constMissing) {
    findings.push(new Finding(ERROR, "constant-missing", "常量 " + name + " 被读取但从未赋值（settings）"));
  }
  const constUnused = sortedKeys([...withKeys(constSets)].filter(name => !constUses.has(name)));
  for (const name of constUnused) {
    findings.push(new Finding(INFO, "constant-unused", "常量 " + name + " 赋值后从未被读取"));
  }

  for (const [tag, [added, removed]] of [...tagCounts(commands)].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (added && !removed) {
      findings.push(new Finding(WARN, "tag-leak", "tag " + tag + " 只 add 从未 remove（" + added + " 次），可能累积"));
    } else if (removed && !added) {
      findings.push(new Finding(INFO, "tag-orphan", "tag " + tag + " 只 remove 从未 add（" + removed + " 次）"));
    }
  }

  const tested = testedValues(commands);
  for (const [name, values] of [...literalValues(commands)].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const ranges = tested.get(name);
    if (!ranges) continue;
    const dead = [...values].sort((a, b) => a - b).filter(value => !ranges.some(([lo, hi]) =>
      (lo === null || value >= lo) && (hi === null || value <= hi)));
    if (dead.length) {
      findings.push(new Finding(INFO, "value-dead",
        name + " 有 " + dead.length + " 个赋值从不被判定（" + dead.slice(0, 6).join(", ") + "…）"));
    }
  }

  for (const cmd of commands) {
    const match = DIV.exec(cmd);
    if (match && constSets.get(match[3]) === 0) {
      findings.push(new Finding(ERROR, "divide-by-zero", "对常量 " + match[3] + " 做 " + match[2] + " 运算，但它是 0"));
    }
  }

  chains.forEach((chain, i) => {
    const index = i + 1;
    const seen = new Map();
    for (const block of chain.blocks) {
      const cmd = String(block.cmd ?? "").trim();
      if (!cmd) continue;
      seen.set(cmd, (seen.get(cmd) ?? 0) + 1);
    }
    for (const [cmd, count] of seen) {
      if (count > 1) {
        findings.push(new Finding(INFO, "duplicate-command",
          "链 " + index + " 内重复 " + count + " 次：" + cmd.slice(0, 60)));
      }
    }
  });
  return findings;
}
