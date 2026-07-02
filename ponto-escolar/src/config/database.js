const mysql = require("mysql2/promise");
const env = require("./env");
const { normalizeError } = require("../utils/errors");

// timezone 'Z': força o driver a tratar/converter datas em UTC, evitando
// que o fuso horário do processo Node interfira na leitura/escrita de
// campos DATETIME/TIMESTAMP.
// decimalNumbers: retorna colunas DECIMAL/NEWDECIMAL como number em vez de
// string, poupando conversões manuais no restante da aplicação.
const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  timezone: "Z",
  decimalNumbers: true,
});

function assertSqlAndParams(sql, params) {
  if (typeof sql !== "string" || sql.trim() === "") {
    throw new TypeError("SQL must be a non-empty string");
  }
  if (!Array.isArray(params)) {
    throw new TypeError("SQL params must be an array");
  }
}

async function execute(sql, params = []) {
  assertSqlAndParams(sql, params);
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    // Erros do driver são normalizados para um formato único de erro da
    // aplicação, evitando vazar detalhes específicos do mysql2 para as
    // camadas superiores.
    throw normalizeError(error);
  }
}

async function executeOne(sql, params = []) {
  const rows = await execute(sql, params);
  // Retorna sempre um objeto: o primeiro registro encontrado, ou um
  // objeto vazio caso a consulta não retorne linhas — evita que quem
  // chamar precise checar undefined separadamente.
  return Array.isArray(rows) ? rows[0] || {} : rows;
}

async function withTransaction(callback) {
  if (typeof callback !== "function") {
    throw new TypeError("Transaction callback must be a function");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Objeto `tx` espelha a API de execute/executeOne do módulo, mas
    // vinculado à mesma conexão da transação, garantindo que todas as
    // queries do callback façam parte da mesma transação.
    const tx = {
      execute: async (sql, params = []) => {
        assertSqlAndParams(sql, params);
        const [rows] = await connection.execute(sql, params);
        return rows;
      },
      executeOne: async (sql, params = []) => {
        const rows = await tx.execute(sql, params);
        return Array.isArray(rows) ? rows[0] || {} : rows;
      },
    };

    const result = await callback(tx, connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_rollbackError) {
      // Ignore rollback errors to preserve original failure.
    }
    throw normalizeError(error);
  } finally {
    // Libera a conexão de volta ao pool independentemente do resultado
    // (sucesso, erro na query, ou falha no rollback).
    connection.release();
  }
}

async function checkConnection() {
  await execute("SELECT 1");
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  execute,
  executeOne,
  withTransaction,
  checkConnection,
  closePool,
};