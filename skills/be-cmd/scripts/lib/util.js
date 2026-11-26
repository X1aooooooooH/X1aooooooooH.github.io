import fs from "node:fs";
import path from "node:path";

/** 命令用法错误：由 CLI 入口捕获，打印到 stderr 并以 2 退出。 */
export class SystemExit extends Error {
  constructor(message = "", code = 2) {
    super(String(message));
    this.code = code;
  }
}

export function fail(message, code = 2) {
  throw new SystemExit(message, code);
}

/** 读取 UTF-8 文本并去掉 BOM（对应旧代码的 utf-8-sig）。 */
export function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

export function readJson(file) {
  return JSON.parse(readText(file));
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, String(text), "utf8");
}

export function writeBytes(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.from(data));
}

/** 与 Python str.splitlines() 一致：末尾换行不产生空行。 */
export function splitLines(text) {
  if (!text) return [];
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function padEnd(value, width, fill = " ") {
  return String(value).padEnd(width, fill);
}

export function padStart(value, width, fill = " ") {
  return String(value).padStart(width, fill);
}

export function emitJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/** 固定列宽表格：列宽按字符数（不区分全角）计算，与旧输出保持一致。 */
export function printTable(rows, headers) {
  const widths = headers.map(header => String(header).length);
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i], String(cell).length);
    });
  }
  const line = cells => cells.map((cell, i) => padEnd(cell, widths[i])).join("  ");
  process.stdout.write(line(headers) + "\n");
  process.stdout.write(widths.map(width => "-".repeat(width)).join("  ") + "\n");
  for (const row of rows) process.stdout.write(line(row) + "\n");
}

export function print(...parts) {
  process.stdout.write(parts.join("") + "\n");
}

export function printErr(...parts) {
  process.stderr.write(parts.join("") + "\n");
}

/** 与 Python repr 一致的字符串表示：单引号 + 反斜杠/单引号转义。 */
export function repr(value) {
  if (typeof value === "string") return "'" + value.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'";
  return String(value);
}

/** 读取 .txt / .mcstructure 里的命令文本（供 syntax/style 共用）。 */
export function isTextFile(file) {
  return path.extname(String(file)).toLowerCase() === ".txt";
}
