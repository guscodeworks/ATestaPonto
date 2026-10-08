require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const { IS_PRODUCTION, getMissingEnvVars, resolveDbPassword, parsePort } = require('./sqlScriptConfig');

function getCliArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) {
    return '';
  }

  return arg.slice(prefix.length).trim();
}

// Restringe o arquivo SQL a ficar dentro do diretório do projeto (impedindo
// path traversal como "--file=../../etc/algo.sql") e exige extensão .sql,
// já que este script permite executar qualquer arquivo informado via CLI.
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

// Script utilitário de linha de comando para rodar manualmente um arquivo .sql
// arbitrário (ex: migrações avulsas ou scripts de correção) contra o banco
// configurado no ambiente, fora do fluxo de inicialização padrão (initDatabase.js).
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
    // Remove o BOM (caractere invisível que alguns editores/downloads adicionam
    // no início do arquivo), que quebraria a execução do SQL se não fosse tratado.
    const source = fs.readFileSync(sqlFilePath, 'utf8');
    const sql = source.replace(/^\uFEFF/, '').trim();

    if (!sql) {
      console.error('[runSqlFile] Arquivo SQL esta vazio.');
      process.exitCode = 1;
      return;
    }

    console.log(`[runSqlFile] Destino: host=${JSON.stringify(process.env.DB_HOST)} banco=${JSON.stringify(process.env.DB_NAME)}`);
    if (IS_PRODUCTION && !process.argv.slice(2).includes('--confirm-production')) {
      console.error('[runSqlFile] Execucao cancelada: producao exige confirmacao explicita com --confirm-production. Confira o destino antes de executar novamente. Nenhum SQL foi executado.');
      process.exitCode = 1;
      return;
    }

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parsePort(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: resolveDbPassword(),
      database: process.env.DB_NAME,
      // multipleStatements habilitado pois o arquivo pode conter vários
      // comandos SQL separados por ";".
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
