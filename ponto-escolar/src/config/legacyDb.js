'use strict';

// Backward-compatible adapter for older imports.
const database = require('./database');

async function initializeDatabase() {
  await database.checkConnection();
}

module.exports = {
  ...database,
  initializeDatabase
};
