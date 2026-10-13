require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const { getMissingEnvVars, resolveDbPassword, parsePort } = require('./sqlScriptConfig');

// Restringe o nome do banco a caracteres seguros, pois ele é interpolado
// diretamente na query (CREATE DATABASE / USE) sem parametrização — não é
// possível usar placeholders (?) para nomes de banco/tabela no MySQL.
function isSafeDatabaseName(name) {
  return /^[A-Za-z0-9_]+$/.test(name);
}

// Somente o baseline canônico pode inicializar um banco novo. Os antigos
// ponto.sql e "ponto (2).sql" não representam mais a estrutura da aplicação.
function resolveSchemaPath() {
  const schemaPath = path.resolve(__dirname, '../../database/schema/ponto.sql');
  return fs.existsSync(schemaPath) ? schemaPath : null;
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
      console.error('[initDatabase] Baseline canonico nao encontrado: database/schema/ponto.sql.');
      process.exitCode = 1;
      return;
    }

    // Remove o BOM (caractere invisível que alguns editores/downloads adicionam
    // no início do arquivo), que quebraria a execução do SQL se não fosse tratado.
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
      // multipleStatements habilitado pois o schema.sql normalmente contém
      // vários comandos SQL separados por ";" em um único arquivo.
      multipleStatements: true,
      charset: 'utf8mb4'
    });

    // Cria o banco caso ainda não exista, evitando falha em uma primeira
    // execução do script em um ambiente totalmente novo.
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${databaseName}\``);
    // O baseline exige um banco vazio, inclusive apos uma inicializacao parcial.
    const [existingTables] = await connection.query(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? LIMIT 1',
      [databaseName]
    );
    if (existingTables.length > 0) {
      console.error('[initDatabase] Inicializacao interrompida: o banco de destino ja contem tabelas ou views. O baseline exige um banco vazio e nao foi executado. Para atualizar a estrutura, use as migrations apropriadas.');
      process.exitCode = 1;
      return;
    }
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
