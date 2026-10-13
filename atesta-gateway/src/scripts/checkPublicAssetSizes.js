"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const publicRoot = path.join(projectRoot, "public");
const maxBytes = 50 * 1024;
const assets = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolutePath);
    else if (/\.(css|js)$/i.test(entry.name)) assets.push(absolutePath);
  }
}

collect(publicRoot);
assets.sort();

let aboveLimit = 0;
console.log("========================================");
console.log("ATestaPonto - CSS/JS SIZE CHECK");
console.log("========================================");

for (const asset of assets) {
  const bytes = fs.statSync(asset).size;
  const status = bytes > maxBytes ? "ERRO" : "OK";
  if (status === "ERRO") aboveLimit += 1;
  const relativePath = path.relative(projectRoot, asset).split(path.sep).join("/");
  console.log(`${relativePath.padEnd(58)} ${(bytes / 1024).toFixed(2).padStart(7)} KB  ${status}`);
}

console.log("========================================");
console.log(`Arquivos analisados: ${assets.length}`);
console.log(`Arquivos acima de 50 KB: ${aboveLimit}`);
console.log(aboveLimit ? "STATUS: REPROVADO" : "STATUS: APROVADO");

process.exitCode = aboveLimit ? 1 : 0;
