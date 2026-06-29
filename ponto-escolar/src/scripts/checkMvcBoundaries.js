"use strict";

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const allowedDbAccessDirs = new Set(["models"]);
const runtimeLayerDirs = new Set([
  "controllers",
  "middlewares",
  "models",
  "routes",
  "services",
]);
const dbConfigFiles = new Set([
  "src/config/database.js",
  "src/config/legacyDb.js",
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function getRelative(filePath) {
  return toPosix(path.relative(path.resolve(rootDir, ".."), filePath));
}

function getLayer(filePath) {
  const relative = getRelative(filePath);
  const parts = relative.split("/");
  return parts[1] || "";
}

function isJavaScriptFile(filePath) {
  return filePath.endsWith(".js");
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(entryPath);
    }
    return isJavaScriptFile(entryPath) ? [entryPath] : [];
  });
}

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function collectRequires(content) {
  const requires = [];
  const requirePattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  let match;

  while ((match = requirePattern.exec(content)) !== null) {
    requires.push(match[1]);
  }

  return requires;
}

function resolveRequire(fromFile, requiredPath) {
  if (!requiredPath.startsWith(".")) {
    return "";
  }

  const basePath = path.resolve(path.dirname(fromFile), requiredPath);
  const candidates = [
    basePath,
    `${basePath}.js`,
    path.join(basePath, "index.js"),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved ? getRelative(resolved) : getRelative(`${basePath}.js`);
}

function addViolation(violations, file, rule, detail) {
  violations.push({
    file: getRelative(file),
    rule,
    detail,
  });
}

function hasSqlLiteral(content) {
  const sqlPattern =
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b[\s\S]{0,120}\b(FROM|INTO|TABLE|SET|VALUES|WHERE)\b/i;
  return sqlPattern.test(stripComments(content));
}

function hasDirectExecuteUsage(content) {
  const source = stripComments(content);
  return (
    /\bexecuteOne\s*\(/.test(source) ||
    /\bexecuteMany\s*\(/.test(source) ||
    /\bpool\s*\./.test(source) ||
    /\.execute\s*\(/.test(source) ||
    /\.executeOne\s*\(/.test(source) ||
    /\.executeMany\s*\(/.test(source)
  );
}

function checkFile(file, violations) {
  const layer = getLayer(file);
  if (!runtimeLayerDirs.has(layer)) {
    return;
  }

  const content = fs.readFileSync(file, "utf8");
  const requires = collectRequires(content);
  const resolvedRequires = requires.map((requiredPath) =>
    resolveRequire(file, requiredPath)
  );

  if (
    ["controllers", "middlewares", "routes"].includes(layer) &&
    resolvedRequires.some((requiredPath) => requiredPath.startsWith("src/models/"))
  ) {
    addViolation(
      violations,
      file,
      "Controllers, middlewares and routes must not import models directly",
      "Use a service boundary instead."
    );
  }

  if (
    ["controllers", "middlewares", "routes", "services"].includes(layer) &&
    resolvedRequires.some((requiredPath) => dbConfigFiles.has(requiredPath))
  ) {
    addViolation(
      violations,
      file,
      "Only models may import database adapters",
      "Move database access behind a model."
    );
  }

  if (
    layer === "models" &&
    resolvedRequires.some((requiredPath) => requiredPath.startsWith("src/services/"))
  ) {
    addViolation(
      violations,
      file,
      "Models must not import services",
      "Keep dependency direction routes/controllers -> services -> models."
    );
  }

  if (!allowedDbAccessDirs.has(layer) && hasSqlLiteral(content)) {
    addViolation(
      violations,
      file,
      "SQL literals are only allowed in models",
      "Move SQL into src/models."
    );
  }

  if (!allowedDbAccessDirs.has(layer) && hasDirectExecuteUsage(content)) {
    addViolation(
      violations,
      file,
      "Direct database execute helpers are only allowed in models",
      "Use a model function instead of execute/executeOne/executeMany/pool."
    );
  }
}

function main() {
  const violations = [];
  const files = walk(rootDir);

  files.forEach((file) => checkFile(file, violations));

  if (violations.length === 0) {
    console.log("MVC boundary check passed.");
    return;
  }

  console.error("MVC boundary check failed:");
  violations.forEach((violation) => {
    console.error(`- ${violation.file}`);
    console.error(`  rule: ${violation.rule}`);
    console.error(`  detail: ${violation.detail}`);
  });
  process.exitCode = 1;
}

main();
