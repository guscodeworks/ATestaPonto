require('dotenv').config();

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const NODE_ENV = (process.env.NODE_ENV || 'development').trim().toLowerCase();
const IS_PRODUCTION = NODE_ENV === 'production';
const REQUIRED_ENV = IS_PRODUCTION
  ? ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
  : ['DB_HOST', 'DB_USER', 'DB_NAME'];
const DEFAULT_BCRYPT_ROUNDS = 12;

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

function parseBcryptRounds(value) {
  if (!value) {
    return DEFAULT_BCRYPT_ROUNDS;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 15) {
    throw new Error('BCRYPT_SALT_ROUNDS invalido. Use um numero entre 10 e 15.');
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function printUsage() {
  console.log('Uso: node src/scripts/createAdmin.js --name=Nome --email=admin@dominio.com --password=SenhaForte');
}

async function main() {
  let connection;

  try {
    const missingVars = getMissingEnvVars();
    if (missingVars.length > 0) {
      console.error(`[createAdmin] Variaveis obrigatorias ausentes: ${missingVars.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const name = getCliArg('name');
    const email = getCliArg('email').toLowerCase();
    const password = getCliArg('password');

    if (!name || !email || !password) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    if (name.length < 3 || name.length > 120) {
      console.error('[createAdmin] Nome invalido. Use entre 3 e 120 caracteres.');
      process.exitCode = 1;
      return;
    }

    if (!isValidEmail(email) || email.length > 150) {
      console.error('[createAdmin] Email invalido.');
      process.exitCode = 1;
      return;
    }

    if (password.length < 12 || password.length > 72) {
      console.error('[createAdmin] Senha invalida. Use entre 12 e 72 caracteres.');
      process.exitCode = 1;
      return;
    }

    const saltRounds = parseBcryptRounds(process.env.BCRYPT_SALT_ROUNDS);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parsePort(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: resolveDbPassword(),
      database: process.env.DB_NAME,
      charset: 'utf8mb4'
    });

    await connection.execute(
      'INSERT INTO admins (nome, email, senha_hash, ativo) VALUES (?, ?, ?, 1)',
      [name, email, passwordHash]
    );

    console.log('[createAdmin] Admin criado com sucesso.');
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      console.error('[createAdmin] Ja existe um admin com este email.');
    } else if (error && error.code === 'ER_NO_SUCH_TABLE') {
      console.error('[createAdmin] Tabela admins nao encontrada. Execute npm run db:init antes.');
    } else {
      console.error('[createAdmin] Falha ao criar admin.');
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[createAdmin] Detalhe tecnico: ${error.message}`);
      }
    }

    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
