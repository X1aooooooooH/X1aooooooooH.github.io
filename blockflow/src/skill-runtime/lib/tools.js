import fs from "node:fs";
import path from "node:path";
import { Block } from "./format.js";
import { ERROR, checkCommand } from "./syntax.js";

/* ---------------- 单脉冲测试台 ---------------- */

export const DEFAULT_OBJECTIVE = "test";
export const RES_OBJECTIVE = "test_res";

export class Emitted {
  constructor(cmd, cond) { this.cmd = cmd; this.cond = cond; }
}

const textPart = value => ({ text: value });
const scorePart = (name, objective) => ({ score: { name, objective } });
const tellraw = parts => "/tellraw @a " + JSON.stringify({ rawtext: parts });

export class BenchBuilder {
  constructor(objective = DEFAULT_OBJECTIVE, resObjective = RES_OBJECTIVE) {
    this.objective = objective;
    this.res = resObjective;
    this.steps = [];
  }

  emit(cmd, cond = 0) {
    let text = String(cmd);
    if (!text.trimStart().startsWith("/")) text = "/" + text.trimStart();
    this.steps.push(new Emitted(text, cond ? 1 : 0));
  }

  judge(testCase, index) {
    const expect = testCase.expect ?? {};
    const objective = expect.objective;
    if (!objective) return;
    const want = Math.trunc(Number(expect.value ?? 0));
    const res = this.res;
    this.emit("scoreboard players add @p " + objective + " 0", 1);
    this.emit("scoreboard players operation #d " + res + " = @p " + objective, 1);
    if (want > 0) this.emit("scoreboard players remove #d " + res + " " + want, 1);
    else if (want < 0) this.emit("scoreboard players add #d " + res + " " + -want, 1);
    this.emit("scoreboard players operation #a " + res + " = #d " + res, 1);
    this.emit("scoreboard players operation #a " + res + " *= #m1 " + res, 1);
    this.emit("scoreboard players operation #abs " + res + " = #d " + res, 1);
    this.emit("scoreboard players operation #abs " + res + " > #a " + res, 1);
    this.emit("scoreboard players operation #abs " + res + " < #one " + res, 1);
    this.emit("scoreboard players set #pass " + res + " 1", 1);
    this.emit("scoreboard players operation #pass " + res + " -= #abs " + res, 1);
    const parts = [
      textPart("§8[判定 " + index + "] §f" + String(testCase.name ?? "样例 " + index) + "\n"),
      textPart("§7期望 "), textPart(String(want)),
      textPart("  §7实际 "), scorePart("@p", objective),
      textPart("  §7判定 "), scorePart("#pass", res),
      textPart("  §8(1=通过 0=失败)\n"),
    ];
    this.emit(tellraw(parts), 1);
  }

  metrics(testCase) {
    const entries = testCase.metrics ?? [];
    if (!entries.length) return;
    const parts = [textPart("§7指标：")];
    entries.forEach((entry, i) => {
      if (i) parts.push(textPart("  "));
      parts.push(textPart(String(entry.label ?? "值") + " "));
      parts.push(scorePart(entry.player ?? "@p", entry.objective));
    });
    parts.push(textPart("\n"));
    this.emit(tellraw(parts), 1);
  }

  runCase(testCase, index) {
    const parts = [
      textPart("§8[样例 " + index + "] §f" + String(testCase.name ?? "样例 " + index) + "\n"),
      textPart(testCase.note ? "§7" + testCase.note + "\n" : ""),
    ];
    const expect = testCase.expect ?? {};
    if (expect.objective) {
      parts.push(textPart("§7期望 "));
      parts.push(textPart(String(expect.value)));
      parts.push(textPart("  "));
    }
    parts.push(textPart("§7按一次按钮看判定\n"));
    this.emit(tellraw(parts), 1);
    this.emit("scoreboard players set @p " + this.objective + " " + (index + 1), 1);
    for (const cmd of testCase.setup ?? []) this.emit(String(cmd), 1);
    for (const cmd of testCase.run ?? []) this.emit(String(cmd), 1);
  }
}

const PLAYERS_OBJ_RE = /scoreboard\s+players\s+(?:set|add|remove|reset|test|get|random|operation)\s+\S+\s+([A-Za-z0-9_]+)/i;
const SCORES_OBJ_RE = /scores\s*=\s*\{[^}]*?([A-Za-z0-9_]+)\s*=/i;
const PLAYERS_OBJ_G = new RegExp(PLAYERS_OBJ_RE.source, "gi");
const SCORES_OBJ_G = new RegExp(SCORES_OBJ_RE.source, "gi");

export function declaredObjectives(spec) {
  const found = [];
  for (const name of spec.objectives ?? []) {
    if (typeof name === "string" && name && !found.includes(name)) found.push(name);
  }
  for (const testCase of spec.cases ?? []) {
    for (const cmd of [...(testCase.setup ?? []), ...(testCase.run ?? [])]) {
      for (const match of String(cmd).matchAll(PLAYERS_OBJ_G)) {
        if (!found.includes(match[1])) found.push(match[1]);
      }
      for (const match of String(cmd).matchAll(SCORES_OBJ_G)) {
        if (!found.includes(match[1])) found.push(match[1]);
      }
    }
  }
  return found;
}

export function buildSteps(spec) {
  const objective = spec.objective ?? DEFAULT_OBJECTIVE;
  const cases = spec.cases ?? [];
  if (!cases.length) throw new Error("spec has no cases");
  const builder = new BenchBuilder(objective);
  const title = spec.title ?? "样例回归测试";
  const total = cases.length;
  const extra = declaredObjectives(spec).filter(name => ![objective, builder.res].includes(name));

  builder.emit("scoreboard objectives add " + objective + " dummy", 0);
  builder.emit("scoreboard objectives remove " + builder.res, 1);
  builder.emit("scoreboard objectives add " + builder.res + " dummy", 1);
  for (const name of extra) {
    builder.emit("scoreboard objectives remove " + name, 1);
    builder.emit("scoreboard objectives add " + name + " dummy", 1);
  }
  builder.emit("scoreboard players set #m1 " + builder.res + " -1", 1);
  builder.emit("scoreboard players set #one " + builder.res + " 1", 1);
  builder.emit("scoreboard players set #zero " + builder.res + " 0", 1);
  builder.emit("scoreboard players set @p " + objective + " 1", 1);
  builder.emit(tellraw([
    textPart("§8==== §b" + title + " §8====\n"),
    textPart("§7共 " + total + " 组样例，每次按下按钮执行一步。\n"),
    textPart("§7先运行样例，下一次按下时给出上一组的判定。\n"),
    textPart("§7判定 §f1§7 = 通过，§f0§7 = 失败。\n"),
    textPart("§a初始化完成，按一次开始。\n"),
  ]), 1);

  cases.forEach((testCase, i) => {
    const index = i + 1;
    builder.emit("scoreboard players test @p " + objective + " " + index, 0);
    if (index > 1) builder.judge(cases[index - 2], index - 1);
    builder.runCase(testCase, index);
    builder.metrics(testCase);
  });

  builder.emit("scoreboard players test @p " + objective + " " + (total + 1), 0);
  builder.emit(tellraw([
    textPart("§8==== §a测试结束 §8====\n"),
    textPart("§7已完成 " + total + " 组样例。\n"),
    textPart("§7逐条对照上面的判定：§f1§7 通过、§f0§7 失败。\n"),
    textPart("§7再按一次会重新初始化。\n"),
  ]), 1);
  builder.emit("scoreboard objectives remove " + objective, 1);
  builder.emit("scoreboard objectives remove " + builder.res, 1);
  return builder.steps;
}

export function buildBench(spec) {
  return buildSteps(spec).map((step, index) =>
    new Block(index, 0, 0, index === 0 ? "command" : "chain", 2, step.cmd, step.cond, 1));
}

export function planText(spec) {
  return buildSteps(spec)
    .map((step, i) => String(i + 1).padStart(3) + " " + (step.cond ? "cond" : "----") + " " + step.cmd)
    .join("\n");
}

/* ---------------- 文档命令自检 ---------------- */

const BACKTICK = "\u0060";
const LIST_PREFIX = /^(?:[-*+]|[0-9]+\.)\s+/;
const COMMENT = /\s+#/;
const ANNOTATION = /\s+[（(]/;

export class DocCommand {
  constructor(file, line, text) { this.file = file; this.line = line; this.text = text; }
  as_dict() { return { file: this.file, line: this.line, command: this.text }; }
}

export function docFiles(root) {
  const files = [];
  const knowledge = path.join(root, "knowledge");
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) files.push(full);
    }
  };
  walk(knowledge);
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const skill = path.join(root, "SKILL.md");
  if (fs.statSync(skill, { throwIfNoEntry: false })?.isFile()) files.push(skill);
  return files;
}

export function cleanLine(line) {
  let text = String(line).trim();
  if (text.startsWith("[c]")) text = text.slice(3).trim();
  text = text.replace(LIST_PREFIX, "");
  if (text.length >= 2 && text.startsWith(BACKTICK) && text.endsWith(BACKTICK)) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function variants(text) {
  const out = [text];
  let match = COMMENT.exec(text);
  if (match) out.push(text.slice(0, match.index).trim());
  match = ANNOTATION.exec(text);
  if (match) out.push(text.slice(0, match.index).trim());
  const cut = text.indexOf(BACKTICK);
  if (cut > 0) out.push(text.slice(0, cut).trim());
  return out.filter(item => item.startsWith("/"));
}

const hasError = command => checkCommand(command).some(issue => issue.severity === ERROR);

export function extractDocCommands(root, files = docFiles(root)) {
  const rows = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    String(fs.readFileSync(file, "utf8")).split(/\r\n|\n|\r/).forEach((line, i) => {
      const text = cleanLine(line);
      if (text.startsWith("/")) rows.push(new DocCommand(rel, i + 1, text));
    });
  }
  return rows;
}

export function runDoccheck(root) {
  const files = docFiles(root);
  const rows = extractDocCommands(root, files);
  const errors = [];
  const trimmed = [];
  const byFile = {};

  for (const row of rows) {
    byFile[row.file] = (byFile[row.file] ?? 0) + 1;
    if (!hasError(row.text)) continue;
    const repaired = variants(row.text).filter(candidate => !hasError(candidate));
    if (repaired.length) {
      trimmed.push({ ...row.as_dict(), used: repaired[repaired.length - 1] });
    } else {
      errors.push(row.as_dict());
    }
  }
  return {
    files: files.length,
    commands: rows.length,
    errors,
    trimmed,
    by_file: byFile,
  };
}
