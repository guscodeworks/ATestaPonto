"use strict";

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
// Único diretório autorizado a falar diretamente com o banco (SQL/execute*),
// concentrando o acesso a dados na camada de models.
const allowedDbAccessDirs = new Set(["models"]);
// Camadas consideradas parte da arquitetura em runtime; usadas para ignorar
// scripts, testes, configs etc. que não precisam seguir as regras de fronteira.
const runtimeLayerDirs = new Set([
  "controllers",
  "middlewares",
  "models",
  "routes",
  "services",
]);
// Módulos que encapsulam a conexão real com o banco; só podem ser importados
// pela camada de models (ver regra abaixo).
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

// Extrai o nome da camada a partir do caminho relativo (ex: "src/controllers/x.js" -> "controllers").
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

// Remove comentários antes das checagens de conteúdo (SQL literal, uso de execute etc.)
// para evitar falsos positivos vindos de código comentado/exemplos em comentários.
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

// Resolve o require relativo para um caminho absoluto no projeto, testando as
// variações possíveis de resolução do Node (arquivo direto, .js, index.js).
// Requires de pacotes (não iniciados com ".") são ignorados, pois as regras de
// fronteira só se aplicam a módulos internos do próprio projeto.
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
  // Se nenhum candidato existir de fato, assume ".js" como melhor palpite,
  // para que a violação ainda seja reportada com um caminho legível.
  return resolved ? getRelative(resolved) : getRelative(`${basePath}.js`);
}

function addViolation(violations, file, rule, detail) {
  violations.push({
    file: getRelative(file),
    rule,
    detail,
  });
}

// Heurística para detectar SQL "cru" embutido no código: procura um comando SQL
// seguido, a até 120 caracteres de distância, de uma cláusula típica (FROM/INTO/etc).
// Não é um parser real de SQL — é propositalmente tolerante para pegar a maioria
// dos casos práticos sem falso-negativos.
function hasSqlLiteral(content) {
  const sqlPattern =
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b[\s\S]{0,120}\b(FROM|INTO|TABLE|SET|VALUES|WHERE)\b/i;
  return sqlPattern.test(stripComments(content));
}

// Detecta uso direto de helpers de execução de query (execute/executeOne/executeMany)
// ou do pool de conexões, que deveriam existir apenas dentro da camada de models.
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

// Valida, para um único arquivo, todas as regras de dependência entre camadas
// (Clean Architecture / MVC) definidas para este projeto.
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

  // Regra: controllers/middlewares/routes não podem acessar models diretamente,
  // devem sempre passar pela camada de services (limite de responsabilidade).
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

  // Regra: apenas models podem importar os adaptadores de banco de dados,
  // centralizando toda a configuração/conexão de acesso a dados em um único ponto.
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

  // Regra: models não podem depender de services, para preservar o fluxo
  // unidirecional de dependências (routes/controllers -> services -> models),
  // evitando dependência circular entre camadas.
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

// Ponto de entrada do script: percorre todos os arquivos .js do projeto,
// valida as regras de fronteira entre camadas e sinaliza falha (exit code 1)
// para uso em CI/lint, sem interromper a execução no meio da varredura.
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