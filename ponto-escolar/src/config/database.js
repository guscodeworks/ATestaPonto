const mysql = require("mysql2/promise");
const env = require("./env");
const { DatabaseError, normalizeError } = require("../utils/errors");

// timezone 'Z': força o driver a tratar/converter datas em UTC, evitando
// que o fuso horário do processo Node interfira na leitura/escrita de
// campos DATETIME/TIMESTAMP.
// decimalNumbers: retorna colunas DECIMAL/NEWDECIMAL como number em vez de
// string, poupando conversões manuais no restante da aplicação.
function getSslConfig() {
  if (!env.DB_SSL_ENABLED) {
    return undefined;
  }

  const ca = Buffer.from(env.DB_SSL_CA_BASE64, "base64").toString("utf8");
  if (!ca.trim()) {
    throw new Error(
      "Invalid environment configuration: DB_SSL_CA_BASE64 must contain a valid Base64 certificate"
    );
  }

  return {
    ca,
    rejectUnauthorized: true,
  };
}

const poolOptions = {
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
};

const ssl = getSslConfig();
if (ssl) {
  poolOptions.ssl = ssl;
}

const pool = mysql.createPool(poolOptions);

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
  // Retorna null quando nao ha linha para que verificacoes de existencia
  // funcionem de forma consistente em services e models.
  return Array.isArray(rows) ? rows[0] || null : rows;
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
        return Array.isArray(rows) ? rows[0] || null : rows;
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
  try {
    await pool.execute("SELECT 1");
  } catch (error) {
    const code = String(error?.code || "");

    if (code === "EAI_AGAIN" || code === "ETIMEDOUT" || code === "ECONNRESET") {
      throw new DatabaseError(
        "Falha temporaria ao conectar ao banco de dados.",
        { transient: true, reason: "TEMPORARY_CONNECTION_FAILURE" }
      );
    }

    if (code === "ENOTFOUND") {
      throw new DatabaseError(
        "Nao foi possivel resolver o endereco do banco de dados.",
        { transient: false, reason: "DATABASE_HOST_NOT_FOUND" }
      );
    }

    if (code === "ECONNREFUSED") {
      throw new DatabaseError(
        "A conexao com o banco de dados foi recusada.",
        { transient: false, reason: "DATABASE_CONNECTION_REFUSED" }
      );
    }

    if (code === "ER_ACCESS_DENIED_ERROR") {
      throw new DatabaseError(
        "As credenciais do banco de dados foram recusadas.",
        { transient: false, reason: "DATABASE_ACCESS_DENIED" }
      );
    }

    throw new DatabaseError(
      "Nao foi possivel validar a conexao com o banco de dados.",
      { transient: false, reason: "DATABASE_CONNECTION_FAILED" }
    );
  }
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
