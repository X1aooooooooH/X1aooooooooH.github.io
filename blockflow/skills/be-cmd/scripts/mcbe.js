import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  SystemExit, emitJson, fail, isTextFile, padEnd, padStart, print, printErr, printTable,
  readJson, readText, repr, splitLines, writeBytes, writeText,
} from "./lib/util.js";
import {
  Block, INT, INT_ARRAY, Structure, StructureError, Tag, buildStructure, loadStructure,
  parseNbt, serializeNbt, summary,
} from "./lib/format.js";
import {
  Chain, LayoutError, STD_Z, buildLayouts, extractChains, formatChain,
  isExecuteRunRelativeCommand, isSetblockRelativeCommand, markdown as groupMarkdown,
  mergeCandidates, objectiveFamilies, profiles, questions, reflowChains, relayoutChain,
  rotateRelativeCoordinateTriples, splitCandidates, steadyState,
} from "./lib/chain.js";
import {
  DATA_DIR, ERROR, INFO, WARN, categoryCounts, categoriesTable, checkCommand, checkCommands,
  hasId, loadIds, searchId, suggestId,
} from "./lib/syntax.js";
import {
  auditStructure, checkStyleCommands, lintChains, rewriteCommands,
} from "./lib/rules.js";
import {
  buildBench, planText, runDoccheck,
} from "./lib/tools.js";

const MARKER_TEMPLATE = "/setblock {pos} chain_command_block [\"conditional_bit\"={cond},\"facing_direction\"={facing}]";
const FORMAT_SUFFIX = { old: "old", new: "new", netease: "netease" };
const FORMAT_VERSION = { old: 1, new: 2, netease: 1 };

/* ---------------- 公共辅助 ---------------- */

function load(file) {
  try {
    return loadStructure(file);
  } catch (error) {
    if (error instanceof StructureError) fail(error.message);
    throw error;
  }
}

function commandsOf(structure) {
  const out = [];
  for (const chainItem of extractChains(structure)) {
    for (const block of chainItem.blocks) {
      if (!block.is_air_placeholder && block.cmd) out.push(block.cmd);
    }
  }
  return out;
}

function readCommandList(file) {
  if (isTextFile(file)) {
    return splitLines(readText(file)).map(line => line.replace(/\s+$/, ""));
  }
  return commandsOf(load(file));
}

/** .txt 里可能混有多链指令（#@）、注释（#）和条件前缀（[c]），检查前先剥掉。 */
function cleanTextCommands(lines) {
  const out = [];
  for (const line of lines) {
    let text = String(line).trim();
    if (!text || text.startsWith("#")) continue;
    if (text.toLowerCase().startsWith("[c]")) text = text.slice(3).trim();
    if (text) out.push(text);
  }
  return out;
}

function emitText(lines) {
  process.stdout.write(lines.join("\n") + (lines.length ? "\n" : ""));
}

function syntaxGate(commands, force, label = "commands") {
  const issues = checkCommands(commands.filter(cmd => String(cmd).trim()));
  const errors = issues.filter(issue => issue.severity === ERROR);
  const warns = issues.filter(issue => issue.severity === WARN);
  for (const issue of errors) {
    print("[syntax:error] " + issue.code + ": " + issue.message);
    if (issue.cmd) print("    " + issue.cmd);
  }
  for (const issue of warns) {
    print("[syntax:warn ] " + issue.code + ": " + issue.message);
  }
  print("syntax: " + errors.length + " error(s), " + warns.length + " warning(s) in " +
    commands.length + " " + label);
  if (errors.length && !force) {
    printErr("syntax check failed; fix the commands or pass --force");
    return false;
  }
  return true;
}

function parseOrigin(values) {
  if (!values) return [0, 0, 0];
  if (values.length !== 3) fail("--origin 需要三个整数");
  return values.map(Number);
}

function checkChoice(value, allowed, label = "--format") {
  if (!allowed.includes(value)) fail(label + " 只能是 " + allowed.join(" / ") + "，收到 " + repr(value));
  return value;
}

function markerCommands(facing = 2, firstCond = 0) {
  const first = MARKER_TEMPLATE.replace("{pos}", "~~~-1").replace("{cond}", "false").replace("{facing}", String(facing));
  const second = MARKER_TEMPLATE.replace("{pos}", "~~~").replace("{cond}", "false").replace("{facing}", "1");
  return [first, second];
}

function maxOf(values) {
  let max = -Infinity;
  for (const value of values) if (value > max) max = value;
  return max;
}

/** 由方块列表推导结构尺寸；Z 至少保留 STD_Z 以容纳断链标记。 */
function structureSize(blocks) {
  return [
    maxOf(blocks.map(b => b.x)) + 1,
    maxOf(blocks.map(b => b.y)) + 1,
    Math.max(STD_Z, maxOf(blocks.map(b => b.z)) + 1),
  ];
}

function writeStructure(file, blocks, size, { formatVersion, origin = [0, 0, 0], base = null, netease = false }) {
  const [, data] = buildStructure(blocks, size, { formatVersion, origin, base, netease });
  writeBytes(file, data);
  return file;
}

function writeParts(source, parts, out, formatKey, origin) {
  const target = path.resolve(out);
  const dir = path.dirname(target);
  const stem = path.basename(target, path.extname(target));
  const ext = path.extname(target) || ".mcstructure";
  const suffix = FORMAT_SUFFIX[formatKey];
  const written = [];
  for (const part of parts) {
    const name = parts.length > 1
      ? stem + "-part" + part.part + "-" + suffix + ext
      : stem + "-" + suffix + ext;
    written.push(writeStructure(path.join(dir, name), part.blocks, part.size, {
      formatVersion: FORMAT_VERSION[formatKey], origin, base: source,
      netease: formatKey === "netease",
    }));
  }
  return written;
}

/* ---------------- inspect ---------------- */

function cmdInspect(args) {
  const structure = load(args.file);
  const chainList = extractChains(structure);

  let selected = chainList;
  let offset = 1;
  if (args.chain) {
    const index = args.chain - 1;
    if (!(index >= 0 && index < chainList.length)) {
      fail("chain " + args.chain + " does not exist (1.." + chainList.length + ")");
    }
    offset = args.chain;
    selected = [chainList[index]];
  }

  if (args.text) {
    const lines = [];
    for (const item of selected) {
      for (const block of item.blocks) if (!block.is_air_placeholder) lines.push(block.cmd);
    }
    emitText(lines);
    return 0;
  }

  if (args.chain) {
    if (args.json) {
      emitJson({
        size: [...structure.size], origin: [...structure.origin],
        format_version: structure.format_version,
        chains: selected.map(formatChain),
      });
      return 0;
    }
    printChainDetail(selected, offset);
    return 0;
  }

  const info = summary(structure);
  if (args.json) {
    emitJson({
      ...info,
      chains: chainList.map(formatChain),
      chain_count: chainList.length,
      command_count: chainList.reduce((total, item) => total + item.command_count, 0),
    });
    return 0;
  }

  print("file            " + args.file);
  print("format_version  " + info.format_version);
  print("size            " + info.size.join(" x "));
  print("origin          [" + info.origin.join(", ") + "]");
  print("palette         " + info.palette_entries + " entries");
  print("command blocks  " + info.command_blocks);
  for (const [name, count] of Object.entries(info.block_types).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    print("  " + padEnd(name, 14) + count);
  }
  print("with command    " + info.commands_with_text);
  if (info.warnings.length) {
    print("warnings:");
    for (const warning of info.warnings) print("  - " + warning);
  }
  print("");
  const rows = chainList.map((item, i) => {
    const head = item.blocks.length ? item.blocks[0] : null;
    return [
      i + 1, item.type, item.head_kind ?? "-", item.blocks.length, item.command_count,
      head ? "(" + head.x + "," + head.y + "," + head.z + ")" : "-",
      (head ? head.cmd : "").slice(0, 48),
    ];
  });
  printTable(rows, ["#", "type", "head", "blocks", "cmds", "origin", "first command"]);
  print("");
  print(chainList.length + " chains, " +
    chainList.reduce((total, item) => total + item.blocks.length, 0) + " blocks, " +
    chainList.reduce((total, item) => total + item.command_count, 0) + " commands");
  return 0;
}

function printChainDetail(chainList, offset = 1) {
  chainList.forEach((item, i) => {
    print("== chain " + (offset + i) + ": " + item.type + " (" + item.command_count + " commands) ==");
    item.blocks.forEach((block, step) => {
      const flags = [];
      if (block.is_air_placeholder) flags.push("air-placeholder");
      if (block.is_auxiliary) flags.push("auxiliary");
      if (block.broken_wrong_facing) flags.push("wrong-facing");
      const flagText = flags.length ? " [" + flags.join(",") + "]" : "";
      print("  " + padStart(step, 3) + " (" + padStart(block.x, 3) + "," + block.y + "," + block.z + ") " +
        padEnd(block.type, 9) + " f=" + block.facing + " c=" + block.cond + " a=" + block.auto + flagText);
      print("      " + block.cmd);
    });
    print("");
  });
}

/* ---------------- check ---------------- */

const GROUP_NAMES = { syntax: "语法", chain: "链", style: "风格", system: "系统" };

function countRows(rows) {
  const counts = { [ERROR]: 0, [WARN]: 0, [INFO]: 0 };
  for (const row of rows) counts[row.severity] = (counts[row.severity] ?? 0) + 1;
  return counts;
}

function aggregate(rows) {
  const table = new Map();
  for (const row of rows) {
    const key = row.severity + "\u0000" + row.code + "\u0000" + row.message;
    table.set(key, (table.get(key) ?? 0) + 1);
  }
  return [...table.entries()]
    .map(([key, count]) => {
      const [severity, code, message] = key.split("\u0000");
      return { severity, code, message, count };
    })
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || (b.count - a.count));
}

function cmdCheck(args) {
  const structure = isTextFile(args.file) ? null : load(args.file);
  const chainList = structure ? extractChains(structure) : [];
  const commands = structure ? commandsOf(structure) : readCommandList(args.file);

  if (args.fix) {
    if (!structure) {
      const [rewritten, notes] = rewriteCommands(commands);
      if (args.out) {
        writeText(args.out, rewritten.join("\n") + "\n");
        print("wrote " + args.out + " (" + commands.length + " -> " + rewritten.length + " commands)");
      } else {
        emitText(rewritten);
      }
      for (const note of notes) printErr("note: " + note);
      return 0;
    }
    fail("--fix 只对 .txt 生效");
  }

  const wanted = args.only ? [args.only] : ["syntax", "chain", "style", "system"];
  const textCommands = structure ? commands.filter(cmd => String(cmd).trim()) : cleanTextCommands(commands);
  const groups = [];
  if (wanted.includes("syntax")) groups.push(["syntax", checkCommands(textCommands)]);
  if (structure && wanted.includes("chain")) groups.push(["chain", lintChains(structure, chainList)]);
  if (wanted.includes("style")) groups.push(["style", checkStyleCommands(textCommands)]);
  if (structure && wanted.includes("system")) groups.push(["system", auditStructure(structure, chainList)]);
  if (args.only && !groups.length) {
    if (!structure && (args.only === "chain" || args.only === "system")) {
      fail("文本文件只有语法和风格两组；链/系统检查请给 .mcstructure");
    }
    fail("--only 只能是 syntax / chain / style / system");
  }

  const counts = {};
  let totalErrors = 0, totalWarns = 0;
  for (const [key, rows] of groups) {
    const c = countRows(rows);
    counts[GROUP_NAMES[key]] = c;
    totalErrors += c[ERROR];
    totalWarns += c[WARN];
  }

  if (args.json) {
    emitJson({
      file: String(args.file),
      chains: chainList.length,
      commands: textCommands.length,
      counts,
      groups: Object.fromEntries(groups.map(([key, rows]) => [GROUP_NAMES[key], aggregate(rows)])),
    });
    return args.strict && totalErrors ? 1 : 0;
  }

  print("# " + args.file);
  print(chainList.length + " 条链，" + textCommands.length + " 条命令");
  print(totalErrors + " error / " + totalWarns + " warn\n");
  print("| 类别 | error | warn | info |");
  print("|---|---|---|---|");
  for (const [key] of groups) {
    const c = counts[GROUP_NAMES[key]];
    print("| " + GROUP_NAMES[key] + " | " + c[ERROR] + " | " + c[WARN] + " | " + c[INFO] + " |");
  }

  for (const [key, rows] of groups) {
    const agg = aggregate(rows);
    if (!agg.length) continue;
    print("\n## " + GROUP_NAMES[key]);
    let shown = 0;
    for (const item of agg) {
      if (item.severity === INFO && !args.verbose) continue;
      print("- [" + item.severity + "] " + item.code + ": " + item.message +
        (item.count > 1 ? "（×" + item.count + "）" : ""));
      shown++;
      if (shown >= args.maxItems) {
        const rest = agg.filter(x => x.severity !== INFO).length - shown;
        if (rest > 0) print("- …还有 " + rest + " 条，见 --report 或 --json");
        break;
      }
    }
  }

  if (args.report) {
    const report = ["# 检查报告：" + path.basename(String(args.file)), "",
      "- 链 " + chainList.length + " 条，命令 " + commands.length + " 条",
      "- 合计 " + totalErrors + " error / " + totalWarns + " warn", ""];
    for (const [key, rows] of groups) {
      report.push("## " + GROUP_NAMES[key], "");
      for (const item of aggregate(rows)) {
        report.push("- \u0060" + item.severity + "\u0060 **" + item.code + "** — " + item.message +
          (item.count > 1 ? "（×" + item.count + "）" : ""));
      }
      report.push("");
    }
    writeText(args.report, report.join("\n") + "\n");
    print("\nwrote " + args.report);
  }
  return args.strict && totalErrors ? 1 : 0;
}

/* ---------------- build ---------------- */

function hasSliceDirectives(text) {
  return splitLines(text).some(line => line.trim().startsWith("#@"));
}

function parseSliceSections(text) {
  const sections = [];
  let current = null;
  let pendingName = "";
  for (const rawLine of splitLines(text)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#@")) {
      const body = line.slice(2).trim();
      const space = body.indexOf(" ");
      const key = (space < 0 ? body : body.slice(0, space)).toLowerCase();
      const value = space < 0 ? "" : body.slice(space + 1).trim();
      if (key === "head") {
        current = { name: pendingName, head: value, body: [] };
        pendingName = "";
        sections.push(current);
      } else if (key === "name") {
        pendingName = value;
      } else {
        fail("unknown directive #@ " + key);
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!current) fail("commands before the first #@ head directive");
    let command = line;
    let cond = 0;
    if (command.toLowerCase().startsWith("[c]")) {
      cond = 1;
      command = command.slice(3).trim();
    }
    current.body.push([command, cond]);
  }
  if (!sections.length) fail("no #@ head section found");
  return sections;
}

function cmdBuild(args) {
  if (!fs.existsSync(args.text)) fail("missing text file " + args.text);
  checkChoice(args.head, ["testfor", "execute", "repeat", "none"], "--head");
  checkChoice(args.format, ["old", "new", "netease"]);
  const text = readText(args.text);
  if (hasSliceDirectives(text)) return buildSlice(args, text);

  const commands = [];
  for (const rawLine of splitLines(text)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    let cond = 0;
    if (line.toLowerCase().startsWith("[c]")) {
      cond = 1;
      line = line.slice(3).trim();
    }
    commands.push([line, cond]);
  }
  if (!commands.length) fail("text file has no commands");

  const blocks = [];
  const z = 0;
  if (args.head === "testfor") {
    let headCmd = args.headCommand || "/testfor @a";
    if (!headCmd.trimStart().startsWith("/")) headCmd = "/" + headCmd;
    if (args.trigger) headCmd += args.trigger;
    const [first, second] = markerCommands(2, 1);
    blocks.push(new Block(0, 0, z, "repeating", 2, headCmd, 0));
    blocks.push(new Block(1, 0, z, "chain", 2, first, 1));
    blocks.push(new Block(2, 0, z, "chain", 1, second, 0));
  } else if (args.head === "execute") {
    let headCmd = args.headCommand || "/execute as @a at @s run ";
    if (!headCmd.trimStart().startsWith("/")) headCmd = "/" + headCmd;
    const [first, second] = markerCommands(2, 0);
    blocks.push(new Block(0, 0, z, "repeating", 2, headCmd, 0));
    blocks.push(new Block(1, 0, z, "chain", 2, first, 0));
    blocks.push(new Block(2, 0, z, "chain", 1, second, 0));
  }
  for (const [command, cond] of commands) {
    blocks.push(new Block(blocks.length, 0, z, "chain", 2, command, cond));
  }

  const ordered = blocks.map(block => block.copy());
  let item;
  if (args.head === "testfor") {
    item = new Chain("snake", ordered, { brokenKind: "testfor", matched: true });
  } else if (args.head === "execute") {
    item = new Chain("snake", ordered, { brokenKind: "execute", matched: true });
  } else if (args.head === "repeat") {
    item = new Chain("repeat", ordered);
  } else {
    item = new Chain("impulse", ordered);
  }
  const laid = relayoutChain(item, 0);
  item.blocks = laid;
  const origin = args.origin ? parseOrigin(args.origin) : [0, 0, 0];
  if (!syntaxGate(laid.map(b => b.cmd), args.force)) return 2;
  writeStructure(args.out, laid, structureSize(laid), {
    formatVersion: FORMAT_VERSION[args.format], origin,
  });
  const nonAir = laid.filter(b => !b.is_air_placeholder);
  print("wrote " + args.out + " (" + nonAir.length + " command blocks, " + args.format + " format)");
  return 0;
}

function buildSlice(args, text) {
  const sections = parseSliceSections(text);
  const chainList = [];
  sections.forEach((section, i) => {
    let head = section.head.trim();
    if (!head.startsWith("/")) head = "/" + head;
    const lower = head.replace(/^\//, "").toLowerCase();
    const blocks = [];
    let kind = null;
    if (lower.startsWith("testfor")) {
      const [first, second] = markerCommands(2, 1);
      blocks.push(new Block(0, 0, 0, "repeating", 2, head, 0));
      blocks.push(new Block(1, 0, 0, "chain", 2, first, 1));
      blocks.push(new Block(2, 0, 0, "chain", 1, second, 0));
      kind = "testfor";
    } else if (lower.startsWith("execute")) {
      const runAt = lower.indexOf(" run ");
      if (runAt > 0 && lower.slice(0, runAt).includes(" at @")) {
        fail("chain " + (i + 1) + ": an 'at @' before 'run' makes the line a normal command, not a broken head; use /execute as <target> run /setblock ~~~-1 ...");
      }
      const [, second] = markerCommands(2, 0);
      blocks.push(new Block(0, 0, 0, "repeating", 2, head, 0));
      blocks.push(new Block(1, 0, 0, "chain", 1, second, 0));
      kind = "execute";
    } else {
      blocks.push(new Block(0, 0, 0, "impulse", 2, head, 0));
    }
    for (const [command, cond] of section.body) {
      blocks.push(new Block(blocks.length, 0, 0, "chain", 2, command, cond));
    }
    chainList.push(new Chain(kind ? "snake" : "impulse", blocks, {
      brokenKind: kind, matched: Boolean(kind),
    }));
  });

  const allCommands = chainList.flatMap(item => item.blocks.map(b => b.cmd));
  if (!syntaxGate(allCommands, args.force)) return 2;
  reflowChains(chainList);
  const parts = buildLayouts(chainList);
  const origin = args.origin ? parseOrigin(args.origin) : [0, 0, 0];
  const target = path.resolve(args.out);
  const ext = path.extname(target) || ".mcstructure";
  const stem = path.basename(target, path.extname(target));
  const written = [];
  for (const part of parts) {
    const file = parts.length > 1
      ? path.join(path.dirname(target), stem + "-part" + part.part + "-" + FORMAT_SUFFIX[args.format] + ext)
      : target;
    written.push(writeStructure(file, part.blocks, part.size, {
      formatVersion: FORMAT_VERSION[args.format], origin,
      netease: args.format === "netease",
    }));
  }
  chainList.forEach((item, i) => {
    const name = sections[i].name || "#" + (i + 1);
    print("chain " + (i + 1) + " (" + name + "): " + item.blocks.length + " blocks, head " + sections[i].head.slice(0, 60));
  });
  for (const file of written) print("wrote " + file);
  return 0;
}

/* ---------------- layout ---------------- */

function cmdLayout(args) {
  checkChoice(args.format, ["old", "new", "netease", "both", "all"]);
  const structure = load(args.file);
  const chainList = extractChains(structure);
  if (!chainList.length) fail("no command chains found");
  reflowChains(chainList);
  const parts = buildLayouts(chainList);
  const origin = args.origin ? parseOrigin(args.origin) : structure.origin;
  const formats = { all: ["old", "new", "netease"], both: ["old", "new"] }[args.format] ?? [args.format];
  const written = [];
  for (const formatKey of formats) written.push(...writeParts(structure, parts, args.out, formatKey, origin));
  if (!args.quiet) {
    for (const part of parts) {
      print("part " + part.part + ": " + part.size.join(" x ") + ", " + part.chain_count +
        " chains, " + part.commandBlocks().length + " command blocks");
    }
  }
  for (const file of written) print("wrote " + file);
  return 0;
}

/* ---------------- edit ---------------- */

function cmdEdit(args) {
  if (args.format) checkChoice(args.format, ["old", "new", "netease"]);
  const structure = load(args.file);
  let changed = 0;
  for (const assignment of args.set ?? []) {
    if (!assignment.includes("=")) fail("--set expects X,Y,Z=COMMAND, got " + repr(assignment));
    const eq = assignment.indexOf("=");
    const coordText = assignment.slice(0, eq);
    const command = assignment.slice(eq + 1);
    const parts = coordText.split(",");
    if (parts.length !== 3 || parts.some(v => !/^-?\d+$/.test(v.trim()))) {
      fail("--set expects X,Y,Z=COMMAND, got " + repr(assignment));
    }
    const [x, y, z] = parts.map(v => Number(v));
    const block = structure.blocks.get(x + "," + y + "," + z);
    if (!block) fail("no command block at (" + x + "," + y + "," + z + ")");
    if (!syntaxGate([command], args.force, "edited command")) return 2;
    block.cmd = command;
    changed++;
  }
  const formatKey = args.format ?? (structure.format_version === 1 ? "old" : "new");
  const blocks = [...structure.blocks.values()];
  const [sx, sy, sz] = structure.size;
  const fits = blocks.every(b => b.x >= 0 && b.x < sx && b.y >= 0 && b.y < sy && b.z >= 0 && b.z < sz);
  writeStructure(args.out, blocks, fits ? structure.size : null, {
    formatVersion: FORMAT_VERSION[formatKey], origin: structure.origin,
    base: structure, netease: formatKey === "netease",
  });
  print("wrote " + args.out + " (" + changed + " commands changed, " + formatKey + " format)");
  return 0;
}

/* ---------------- group ---------------- */

function cmdGroup(args) {
  if (isTextFile(args.file)) {
    fail("group needs a .mcstructure; build the text first: mcbe.js build --text FILE --out out.mcstructure");
  }
  const structure = load(args.file);
  const rows = profiles(structure);
  const merges = mergeCandidates(rows);
  const objectiveGroups = objectiveFamilies(rows);
  const splits = splitCandidates(rows, args.splitAt);
  if (args.json) {
    emitJson({
      stats: steadyState(rows),
      chains: rows.map(row => row.as_dict()),
      merge: merges,
      objective_groups: objectiveGroups,
      split: splits,
      questions: questions(rows, merges, objectiveGroups, splits),
    });
    return 0;
  }
  const text = groupMarkdown(rows, args.splitAt);
  if (args.report) {
    writeText(args.report, text);
    print("wrote " + args.report);
  }
  print(text);
  return 0;
}

/* ---------------- test ---------------- */

function cmdTest(args) {
  checkChoice(args.format, ["old", "new", "netease"]);
  const spec = readJson(args.spec);
  if (args.plan) {
    print(planText(spec));
    return 0;
  }
  if (!args.out) fail("--out is required unless --plan is used");
  let blocks;
  try {
    blocks = buildBench(spec);
  } catch (error) {
    if (error instanceof Error) fail(error.message);
    throw error;
  }
  const item = new Chain("impulse", blocks);
  const laid = relayoutChain(item, 0);
  const size = structureSize(laid);
  const origin = args.origin ? parseOrigin(args.origin) : [0, 0, 0];
  if (!syntaxGate(laid.map(b => b.cmd), args.force, "test-bench commands")) return 2;
  writeStructure(args.out, laid, size, { formatVersion: FORMAT_VERSION[args.format], origin });
  print("wrote " + args.out + " (" + laid.length + " blocks, " + (spec.cases ?? []).length +
    " cases, " + size.join("x") + ", " + args.format + " format)");
  print("按一次按钮 = 一步；首次按下初始化，之后每次判定上一组并运行下一组。");
  return 0;
}

/* ---------------- verify ---------------- */

function cmdVerify(args) {
  const source = load(args.file);
  const chainList = extractChains(source);
  reflowChains(chainList);
  const parts = buildLayouts(chainList);
  const expected = chainList.reduce((total, item) => total + item.command_count, 0);
  const expectedCommands = chainList.flatMap(item =>
    item.blocks.filter(b => !b.is_air_placeholder).map(b => b.cmd)).sort();

  const actualCommands = [];
  let total = 0;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcbe-verify-"));
  try {
    for (const part of parts) {
      const [, data] = buildStructure(part.blocks, part.size, { formatVersion: 2 });
      const file = path.join(tmpDir, "part" + part.part + ".mcstructure");
      writeBytes(file, data);
      const reloaded = loadStructure(file);
      const reloadedChains = extractChains(reloaded);
      total += reloadedChains.reduce((sum, item) => sum + item.command_count, 0);
      for (const item of reloadedChains) {
        for (const block of item.blocks) if (!block.is_air_placeholder) actualCommands.push(block.cmd);
      }
      if (args.out) writeBytes(args.out, data);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (total !== expected) {
    print("MISMATCH: expected " + expected + " command blocks, re-read " + total);
    return 1;
  }
  if (JSON.stringify(actualCommands.slice().sort()) !== JSON.stringify(expectedCommands)) {
    const missing = expectedCommands.filter(cmd => !actualCommands.includes(cmd));
    const extra = actualCommands.filter(cmd => !expectedCommands.includes(cmd));
    print("MISMATCH: " + missing.length + " missing, " + extra.length + " extra commands");
    for (const cmd of missing.slice(0, 5)) print("  missing " + cmd.slice(0, 100));
    return 1;
  }
  print("OK: " + parts.length + " part(s), " + expected + " command blocks, all command texts preserved");
  return 0;
}

/* ---------------- ids ---------------- */

function cmdIds(args) {
  const table = categoriesTable();
  const labels = new Map(table.map(row => [row[0], row[1]]));
  if (args.list || (!args.category && !args.search)) {
    printTable(table, ["category", "name", "count", "file", "scope"]);
    print("");
    print(table.length + " categories, " + table.reduce((total, row) => total + row[2], 0) + " ids");
    return 0;
  }
  const categories = args.category ? [args.category] : [...labels.keys()];
  for (const name of categories) {
    if (!labels.has(name)) fail("unknown category " + repr(name));
  }
  const needle = args.search ?? "";
  let total = 0;
  for (const name of categories) {
    if (!needle) {
      const entries = loadIds(name);
      print("## " + labels.get(name) + "（" + name + "，" + entries.size + " 条）");
      for (const key of [...entries.keys()].sort()) print("  " + key);
      continue;
    }
    const rows = searchId(name, needle);
    if (!rows.length) continue;
    print("## " + labels.get(name) + "（" + name + "）");
    for (const entry of rows) print("  " + padEnd(entry.id, 44) + " " + entry.note);
    total += rows.length;
  }
  if (needle) print("\n" + total + " match(es) for " + repr(needle));
  return 0;
}

/* ---------------- selftest ---------------- */

function cmdSelftest(args) {
  const checks = [];
  const check = (name, condition, detail = "") => checks.push([name, Boolean(condition), detail]);

  const root = Tag.compound(new Map([
    ["name", Tag.string("test")],
    ["n", Tag.int(7)],
    ["list", Tag.listOf(INT, [Tag.int(1), Tag.int(2)])],
    ["arr", Tag.intArray([3, 4, 5])],
    ["b", Tag.byte(1)],
    ["l", Tag.long(-5)],
  ]));
  const blob = serializeNbt(root);
  const back = parseNbt(blob);
  check("nbt round trip", Buffer.from(serializeNbt(back)).equals(blob));
  check("nbt types", back.plain("n") === 7 && back.get("arr").type === INT_ARRAY);

  const blocks = [
    new Block(0, 0, 31, "repeating", 2, "/testfor @a", 0),
    new Block(0, 0, 30, "chain", 2, "/setblock ~~~-1 chain_command_block", 1),
    new Block(0, 0, 29, "chain", 1, "/setblock ~~~ chain_command_block", 0),
    new Block(0, 0, 28, "chain", 2, "/say one", 0),
    new Block(0, 0, 27, "chain", 2, "/say two", 0),
  ];
  const [, data] = buildStructure(blocks, [1, 1, STD_Z], { formatVersion: 2 });
  check("build wrote bytes", data.length > 100);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcbe-selftest-"));
  const tmp = path.join(tmpDir, "s.mcstructure");
  try {
    writeBytes(tmp, data);
    const loaded = loadStructure(tmp);
    check("load size", JSON.stringify(loaded.size) === JSON.stringify([1, 1, STD_Z]), JSON.stringify(loaded.size));
    check("load blocks", loaded.blocks.size === 5, String(loaded.blocks.size));
    const extracted = extractChains(loaded);
    check("one chain", extracted.length === 1, String(extracted.length));
    if (extracted.length) {
      const item = extracted[0];
      check("snake type", item.type === "snake", item.type);
      check("head kind", item.head_kind === "testfor", String(item.head_kind));
      check("snake length", item.blocks.length === 5, String(item.blocks.length));
      const cmds = item.blocks.map(b => b.cmd);
      check("commands preserved", JSON.stringify(cmds) === JSON.stringify(blocks.map(b => b.cmd)), JSON.stringify(cmds));
    }
    const [, data1] = buildStructure(blocks, [1, 1, STD_Z], { formatVersion: 1 });
    writeBytes(tmp, data1);
    const loaded1 = loadStructure(tmp);
    check("v1 format version", loaded1.format_version === 1, String(loaded1.format_version));
    check("v1 block count", loaded1.blocks.size === 5);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  check("rotate facing 3",
    rotateRelativeCoordinateTriples("/setblock ~~~-1 chain_command_block", 3) === "/setblock ~~~1 chain_command_block",
    rotateRelativeCoordinateTriples("/setblock ~~~-1 chain_command_block", 3));
  check("fill not marker", !isSetblockRelativeCommand("/fill ~ ~ ~ ~ ~ ~ stone"));
  check("execute at not head", !isExecuteRunRelativeCommand("/execute as @a at @s run setblock ~ ~ ~ stone"));
  check("execute run is head", isExecuteRunRelativeCommand("/execute as @a run setblock ~~~-1 stone"));

  checks.push(...ruleChecks());

  const hasError = cmd => checkCommand(cmd).some(issue => issue.severity === ERROR);
  check("syntax: compact coords", !hasError("/setblock ~~~-1 chain_command_block"));
  check("syntax: split coords", !hasError("/tp @s ~~ 0 facing 0 ~~"));
  check("syntax: matches range", !hasError("/execute if score @s x matches 1.. run say hi"));
  check("syntax: unknown command", hasError("/setblok ~ ~ ~ stone"));
  check("syntax: execute needs run", hasError("/execute as @a say hi"));
  check("syntax: java selector", hasError("/kill @e[nbt={}]"));
  check("syntax: bad op", hasError("/scoreboard players operation @a x ** @b y"));
  check("syntax: scoreboard objectives require dummy", !hasError("/scoreboard objectives add x dummy"));
  check("syntax: Java scoreboard criteria rejected", hasError("/scoreboard objectives add x trigger"));
  check("syntax: scoreboard optional display name", !hasError("/scoreboard objectives add vip dummy \"VIP\""));

  check("ids: effect speed", hasId("effect", "speed"));
  check("ids: gamerule alias", hasId("gamerule", "doDaylightCycle"));
  check("ids: suggest zombie", suggestId("entity", "zombi").includes("zombie"), JSON.stringify(suggestId("entity", "zombi")));
  check("ids: particle Chinese search", searchId("particle", "萤火虫").some(e => e.id === "firefly_particle"));
  check("ids: animation Chinese search", searchId("animation", "监守者远程攻击").some(e => e.id === "animation.warden.sonic_boom"));
  check("ids: unsupported criteria category removed",
    !categoryCounts().has("criteria") && !fs.existsSync(path.join(DATA_DIR, "criteria.txt")));
  check("ids: resource client entity Chinese lookup", searchId("client_entity", "悦灵").some(e => e.id === "allay"));
  check("ids: new particle Chinese lookup", searchId("particle", "停止生长").some(e => e.id === "pause_mob_growth"));
  check("ids: animation metadata preserved",
    (loadIds("animation").get("animation.warden.sonic_boom") ?? "").includes("循环=否") &&
    (loadIds("animation").get("animation.warden.sonic_boom") ?? "").includes("动画长度=3"));
  check("ids: bad effect is error", hasError("/effect @a sped 1"));
  check("ids: bad entity is warning", checkCommand("/summon zombi").some(issue => issue.severity === WARN));
  check("ids: selector type checked", checkCommand("/kill @e[type=zombi]").some(issue => issue.code === "unknown-entity"));

  const auditOf = commands => {
    const structure = new Structure([1, 1, 32], { formatVersion: 2 });
    const item = new Chain("impulse", commands.map((cmd, i) => new Block(i, 0, 0, "chain", 2, cmd, 0)));
    return auditStructure(structure, [item]).map(finding => finding.code);
  };
  let codes = auditOf(["/scoreboard objectives add x dummy", "/scoreboard players set @a x 1"]);
  check("audit: clean set", !codes.includes("objective-missing") && !codes.includes("constant-missing"), JSON.stringify(codes));
  check("audit: objective missing", auditOf(["/scoreboard players set @a nope 1"]).includes("objective-missing"));
  check("audit: constant missing", auditOf(["/scoreboard players add @a y 0", "/scoreboard players operation @a y = z settings"]).includes("constant-missing"));
  check("audit: tag leak", auditOf(["/tag @a add lone"]).includes("tag-leak"));

  if (args.docs) {
    const result = runDoccheck(process.cwd());
    check("docs: command examples", result.errors.length === 0,
      result.errors.length + " error(s) in " + result.commands + " commands");
  }

  const width = Math.max(...checks.map(([name]) => name.length));
  let failed = 0;
  for (const [name, ok, detail] of checks) {
    print(padEnd(ok ? "PASS" : "FAIL", 5) + "  " + padEnd(name, width) + "  " + detail);
    if (!ok) failed++;
  }
  print("");
  print((checks.length - failed) + "/" + checks.length + " checks passed");
  return failed ? 1 : 0;
}

function ruleChecks() {
  const checks = [];
  const m1 = "/setblock ~~~-1 chain_command_block [\"conditional_bit\"=false,\"facing_direction\"=2]";
  const m2 = "/setblock ~~~ chain_command_block [\"conditional_bit\"=false,\"facing_direction\"=1]";

  const scenario = (blocks, size = [1, 1, STD_Z]) => {
    const structure = new Structure(size, { formatVersion: 2 });
    for (const block of blocks) structure.blocks.set(block.key, block);
    return extractChains(structure);
  };

  let chains = scenario([
    new Block(0, 0, 31, "repeating", 2, "/testfor @a", 0),
    new Block(0, 0, 30, "chain", 2, m1, 1),
    new Block(0, 0, 29, "chain", 2, "/say gap", 0),
    new Block(0, 0, 28, "chain", 1, m2, 0),
    new Block(0, 0, 27, "chain", 2, "/say body", 0),
  ]);
  let ok = chains.length === 1 && JSON.stringify(chains[0].broken_groups) === JSON.stringify(["testfor-gap"]) &&
    chains[0].blocks.some(b => b.is_auxiliary) && chains[0].blocks.length === 5;
  checks.push(["rule: testfor-gap", ok, JSON.stringify(chains.map(c => c.broken_groups))]);

  chains = scenario([
    new Block(0, 0, 31, "repeating", 2, "/execute as @a run " + m1, 0),
    new Block(0, 0, 30, "chain", 1, m2, 0),
    new Block(0, 0, 29, "chain", 2, "/say body", 0),
  ]);
  ok = chains.length === 1 && chains[0].head_kind === "execute" && chains[0].blocks.length === 3;
  checks.push(["rule: execute-direct", ok, JSON.stringify(chains.map(c => c.head_kind))]);

  chains = scenario([
    new Block(0, 0, 31, "repeating", 2, "/fill ~~~ ~ ~ ~2 stone", 0),
    new Block(0, 0, 30, "chain", 2, "/say next", 0),
  ]);
  checks.push(["rule: fill is not a marker", chains[0].type !== "snake", chains[0].type]);

  chains = scenario([
    new Block(1, 0, 31, "chain", 2, "/say a", 0),
    new Block(1, 0, 30, "chain", 5, "/say b", 0),
    new Block(2, 0, 30, "chain", 3, "/say c", 0),
    new Block(2, 0, 31, "chain", 4, "/say d", 0),
  ], [3, 1, STD_Z]);
  ok = chains.length === 1 && chains[0].blocks.length === 4 && chains[0].self_closed;
  checks.push(["rule: 4-block self-closed", ok, JSON.stringify(chains.map(c => [c.type, c.blocks.length, c.self_closed]))]);

  chains = scenario([
    new Block(0, 0, 31, "repeating", 2, "/testfor @a", 0),
    new Block(0, 0, 30, "chain", 2, "/say 1", 0),
    new Block(0, 0, 29, "repeating", 2, "/say 2", 0),
    new Block(0, 0, 28, "chain", 2, "/say 3", 0),
  ]);
  ok = chains.length === 2 && chains.some(c => c.blocks.length === 2);
  checks.push(["rule: second repeating splits", ok, JSON.stringify(chains.map(c => c.blocks.length))]);

  let longChain = [new Block(0, 0, 31, "chain", 2, "/say head", 0)];
  for (let i = 1; i < 73; i++) longChain.push(new Block(0, 0, 31 - i, "chain", 2, "/say " + i, 0));
  const item = new Chain("impulse", longChain);
  const laid = relayoutChain(item, 0);
  const maxY = Math.max(...laid.map(b => b.y));
  const maxZ = Math.max(...laid.map(b => b.z));
  checks.push(["rule: 73 blocks stack on Y", maxY === 2 && maxZ === 31, "y<=" + maxY + " z<=" + maxZ]);
  return checks;
}

/* ---------------- 参数解析 ---------------- */

const SPECS = {
  inspect: {
    summary: "结构概要、链列表、链明细或命令文本",
    usage: "inspect FILE [--chain N] [--json] [--text]",
    options: { json: "bool", chain: "int", text: "bool" },
    positional: ["file"],
    required: ["file"],
    run: cmdInspect,
  },
  check: {
    summary: "四组检查：语法 / 链 / 风格 / 系统",
    usage: "check FILE [--only syntax|chain|style|system] [--json] [--strict] [--report PATH] [--verbose] [--fix] [--out FILE] [--max-items N]",
    options: {
      json: "bool", strict: "bool", verbose: "bool", fix: "bool",
      report: "value", out: "value", only: "value", maxItems: "int",
    },
    defaults: { maxItems: 12 },
    positional: ["file"],
    required: ["file"],
    run: cmdCheck,
  },
  build: {
    summary: "从命令文本生成结构（含 #@ head 时按多链生成）",
    usage: "build --text FILE --out FILE [--head testfor|execute|repeat|none] [--head-command CMD] [--trigger SUFFIX] [--format old|new|netease] [--origin X Y Z] [--force]",
    options: {
      text: "value", out: "value", head: "value", headCommand: "value", trigger: "value",
      format: "value", origin: "list", force: "bool",
    },
    defaults: { head: "none", format: "new", headCommand: "", trigger: "" },
    required: ["text", "out"],
    run: cmdBuild,
  },
  layout: {
    summary: "重排命令链并导出结构",
    usage: "layout FILE --out PATH [--format old|new|netease|both|all] [--origin X Y Z] [--quiet]",
    options: { out: "value", format: "value", origin: "list", quiet: "bool" },
    defaults: { format: "new" },
    positional: ["file"],
    required: ["file", "out"],
    run: cmdLayout,
  },
  edit: {
    summary: "按坐标替换命令",
    usage: "edit FILE --out FILE --set X,Y,Z=COMMAND [--format old|new|netease] [--force]",
    options: { out: "value", set: "list", format: "value", force: "bool" },
    positional: ["file"],
    required: ["file", "out"],
    run: cmdEdit,
  },
  group: {
    summary: "断链分组与拆分建议",
    usage: "group FILE [--split-at N] [--report PATH] [--json]",
    options: { splitAt: "int", report: "value", json: "bool" },
    defaults: { splitAt: 96 },
    positional: ["file"],
    required: ["file"],
    run: cmdGroup,
  },
  test: {
    summary: "生成单脉冲测试台",
    usage: "test --spec JSON [--out FILE] [--plan] [--format old|new|netease] [--origin X Y Z] [--force]",
    options: { spec: "value", out: "value", plan: "bool", format: "value", origin: "list", force: "bool" },
    defaults: { format: "new" },
    required: ["spec"],
    run: cmdTest,
  },
  verify: {
    summary: "导出、回读并逐条比较命令文本",
    usage: "verify FILE [--out PATH]",
    options: { out: "value" },
    positional: ["file"],
    required: ["file"],
    run: cmdVerify,
  },
  ids: {
    summary: "查询内置原版 ID 清单",
    usage: "ids [--list] [--category NAME] [--search TEXT]",
    options: { list: "bool", category: "value", search: "value" },
    run: cmdIds,
  },
  selftest: {
    summary: "运行内置回归检查",
    usage: "selftest [--docs]",
    options: { docs: "bool" },
    run: cmdSelftest,
  },
};

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv, spec) {
  const out = { ...(spec.defaults ?? {}) };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { out.help = true; continue; }
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    let name = arg.slice(2);
    let value = null;
    const eq = name.indexOf("=");
    if (eq >= 0) { value = name.slice(eq + 1); name = name.slice(0, eq); }
    const key = camel(name);
    const kind = spec.options?.[key];
    if (!kind) fail("未知选项 --" + name + "；" + spec.usage);
    if (kind === "bool") {
      if (value !== null) fail("--" + name + " 不接受取值");
      out[key] = true;
    } else if (kind === "list") {
      const values = value !== null ? [value] : [];
      while (value === null && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        values.push(argv[++i]);
      }
      if (!out[key]) out[key] = [];
      out[key].push(...values);
    } else if (kind === "int") {
      const text = value !== null ? value : argv[++i];
      if (text === undefined || !/^-?\d+$/.test(text)) fail("--" + name + " 需要整数");
      out[key] = Number(text);
    } else {
      const text = value !== null ? value : argv[++i];
      if (text === undefined) fail("--" + name + " 缺少取值");
      out[key] = text;
    }
  }
  (spec.positional ?? []).forEach((name, i) => { if (i < positional.length) out[name] = positional[i]; });
  if (positional.length > (spec.positional ?? []).length) {
    fail("多余的参数 " + positional.slice((spec.positional ?? []).length).join(" ") + "；" + spec.usage);
  }
  return out;
}

function printHelp() {
  print("BlockFlow — Minecraft 基岩版命令链与 .mcstructure 工具");
  print("");
  print("用法: node scripts/mcbe.js <command> [options]");
  print("");
  for (const [name, spec] of Object.entries(SPECS)) {
    print("  " + padEnd(name, 10) + spec.summary);
  }
  print("");
  print("每条命令加 --help 查看详细参数。");
}

function printUsage(spec, name) {
  print(name + " — " + spec.summary);
  print("");
  print("用法: node scripts/mcbe.js " + spec.usage);
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") { printHelp(); return 0; }
  const spec = SPECS[command];
  if (!spec) {
    printHelp();
    fail("未知命令 " + repr(command));
  }
  const args = parseArgs(rest, spec);
  if (args.help) { printUsage(spec, command); return 0; }
  for (const name of spec.required ?? []) {
    if (args[name] === undefined || args[name] === "") fail("缺少参数；" + spec.usage);
  }
  return spec.run(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const code = main();
    if (typeof code === "number") process.exitCode = code;
  } catch (error) {
    if (error instanceof SystemExit) {
      printErr(error.message);
      process.exitCode = error.code;
    } else if (error instanceof StructureError || error instanceof LayoutError) {
      printErr("error: " + error.message);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
