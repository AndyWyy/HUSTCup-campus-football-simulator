import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PREFIX = "全成就玩家登记";
const SEPARATORS = ["：", ":"];
const PLACEHOLDER = "- 暂无登记玩家";
const LIST_FILE = process.env.LIST_FILE || path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "FULL_ACHIEVERS.md",
);

const title = (process.env.ISSUE_TITLE || "").normalize("NFC");

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
}

function sanitizeName(value) {
  let name = value.normalize("NFC");
  name = name.replace(/[\u0000-\u001f\u007f]/g, " ");
  name = name.replace(/[^\p{L}\p{N} _.\-@]/gu, "");
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/^[\s.\-_]+|[\s.\-_]+$/g, "").trim();
  name = name.slice(0, 20).trim();
  return name || "匿名玩家";
}

function keyOf(name) {
  return sanitizeName(name).normalize("NFC").replace(/\s+/g, " ").toLocaleLowerCase();
}

function extractName() {
  for (const separator of SEPARATORS) {
    const prefix = `${PREFIX}${separator}`;
    if (title.startsWith(prefix)) {
      return title.slice(prefix.length).trim();
    }
  }
  return "";
}

function run() {
  if (!title.startsWith(PREFIX)) {
    setOutput("status", "invalid");
    console.log("Not a full-achievement registration title.");
    return;
  }

  const rawName = extractName();
  const name = sanitizeName(rawName);
  const current = fs.existsSync(LIST_FILE)
    ? fs.readFileSync(LIST_FILE, "utf8").replace(/\r\n/g, "\n")
    : "# 全成就名单\n\n这里收录成功解锁全部成就并完成登记的玩家。\n";

  let lines = current.split("\n");
  const entries = lines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line && line !== PLACEHOLDER.slice(2).trim());

  if (entries.some((entry) => keyOf(entry) === keyOf(name))) {
    setOutput("status", "duplicate");
    console.log("Registration already exists.");
    return;
  }

  lines = lines.filter((line) => line.trim() !== PLACEHOLDER.trim());
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }
  lines.push(`- ${name}`, "");

  fs.writeFileSync(LIST_FILE, lines.join("\n"), "utf8");
  setOutput("status", "added");
  console.log(`Registered: ${name}`);
}

run();
