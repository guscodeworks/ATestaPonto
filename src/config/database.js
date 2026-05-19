const mysql = require('mysql2/promise');
const env = require('./env');
const { normalizeError } = require('../utils/errors');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  timezone: 'Z',
  decimalNumbers: true
});

function assertSqlAndParams(sql, params) {
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new TypeError('SQL must be a non-empty string');
  }
  if (!Array.isArray(params)) {
    throw new TypeError('SQL params must be an array');
  }
}

async function execute(sql, params = []) {
  assertSqlAndParams(sql, params);
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    throw normalizeError(error);
  }
}

async function executeOne(sql, params = []) {
  const rows = await execute(sql, params);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function withTransaction(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('Transaction callback must be a function');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const tx = {
      execute: async (sql, params = []) => {
        assertSqlAndParams(sql, params);
        const [rows] = await connection.execute(sql, params);
        return rows;
      },
      executeOne: async (sql, params = []) => {
        const rows = await tx.execute(sql, params);
        return Array.isArray(rows) ? rows[0] || null : rows;
      }
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
    connection.release();
  }
}

async function checkConnection() {
  await execute('SELECT 1');
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
  closePool
};
