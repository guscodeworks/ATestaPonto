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

function isSafeDatabaseName(name) {
  return /^[A-Za-z0-9_]+$/.test(name);
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

function resolveSchemaPath() {
  const candidates = [
    path.resolve(__dirname, '../../database/schema/ponto.sql'),
    path.resolve(__dirname, '../../ponto (2).sql'),
    path.resolve(__dirname, '../../ponto.sql')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function main() {
  let connection;

  try {
    const missingVars = getMissingEnvVars();
    if (missingVars.length > 0) {
      console.error(`[initDatabase] Variaveis obrigatorias ausentes: ${missingVars.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const databaseName = process.env.DB_NAME.trim();
    if (!isSafeDatabaseName(databaseName)) {
      console.error('[initDatabase] DB_NAME invalido. Use apenas letras, numeros e underscore.');
      process.exitCode = 1;
      return;
    }

    const sqlFilePath = resolveSchemaPath();
    if (!sqlFilePath) {
      console.error('[initDatabase] Nenhum arquivo de schema SQL encontrado (database/schema/ponto.sql, ponto (2).sql ou ponto.sql).');
      process.exitCode = 1;
      return;
    }

    const schemaSql = fs.readFileSync(sqlFilePath, 'utf8').replace(/^\uFEFF/, '').trim();
    if (!schemaSql) {
      console.error(`[initDatabase] Arquivo SQL vazio: ${path.relative(process.cwd(), sqlFilePath)}`);
      process.exitCode = 1;
      return;
    }

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parsePort(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: resolveDbPassword(),
      multipleStatements: true,
      charset: 'utf8mb4'
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${databaseName}\``);
    await connection.query(schemaSql);

    console.log('[initDatabase] Banco inicializado com sucesso.');
  } catch (error) {
    console.error('[initDatabase] Falha ao inicializar banco.');
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[initDatabase] Detalhe tecnico: ${error.message}`);
    }
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
