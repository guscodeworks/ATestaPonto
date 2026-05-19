require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const NODE_ENV = (process.env.NODE_ENV || 'development').trim().toLowerCase();
const IS_PRODUCTION = NODE_ENV === 'production';
const REQUIRED_ENV = IS_PRODUCTION
  ? ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
  : ['DB_HOST', 'DB_USER', 'DB_NAME'];

function resolveDbPassword() {
  const dbPassword = process.env.DB_PASSWORD;
  if (typeof dbPassword === 'string' && dbPassword.trim().length > 0) {
    return dbPassword;
  }

  const legacyDbPassword = process.env.DB_PASS;
  if (typeof legacyDbPassword === 'string' && legacyDbPassword.trim().length > 0) {
    return legacyDbPassword;
  }

  return '';
}

function getMissingEnvVars() {
  return REQUIRED_ENV.filter((key) => {
    const value = key === 'DB_PASSWORD' ? resolveDbPassword() : process.env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

function parsePort(value) {
  if (!value) {
    return 3306;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error('DB_PORT invalido. Use um numero entre 1 e 65535.');
  }

  return parsed;
}

function getCliArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) {
    return '';
  }

  return arg.slice(prefix.length).trim();
}

function resolveSqlFile(fileArg) {
  if (!fileArg) {
    throw new Error('Informe o arquivo SQL com --file=caminho/do/arquivo.sql');
  }

  const root = path.resolve(__dirname, '../..');
  const absolutePath = path.resolve(root, fileArg);
  const relativePath = path.relative(root, absolutePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('O arquivo SQL precisa estar dentro do projeto.');
  }

  if (!absolutePath.toLowerCase().endsWith('.sql')) {
    throw new Error('O arquivo precisa ter extensao .sql');
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Arquivo SQL nao encontrado: ${fileArg}`);
  }

  return absolutePath;
}

async function main() {
  let connection;

  try {
    const missingVars = getMissingEnvVars();
    if (missingVars.length > 0) {
      console.error(`[runSqlFile] Variaveis obrigatorias ausentes: ${missingVars.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const sqlFilePath = resolveSqlFile(getCliArg('file'));
    const sql = fs.readFileSync(sqlFilePath, 'utf8').replace(/^\uFEFF/, '').trim();

    if (!sql) {
      console.error('[runSqlFile] Arquivo SQL esta vazio.');
      process.exitCode = 1;
      return;
    }

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parsePort(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: resolveDbPassword(),
      database: process.env.DB_NAME,
      multipleStatements: true,
      charset: 'utf8mb4'
    });

    await connection.query(sql);
    console.log(`[runSqlFile] SQL executado com sucesso: ${path.relative(process.cwd(), sqlFilePath)}`);
  } catch (error) {
    console.error('[runSqlFile] Falha ao executar SQL.');
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[runSqlFile] Detalhe tecnico: ${error.message}`);
    }
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
