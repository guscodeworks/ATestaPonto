"use strict";

// Backward-compatible adapter for older imports.
// Reexporta tudo de ./database, adicionando apenas initializeDatabase()
// para código legado que ainda depende desse nome de função em vez de
// checkConnection() (definido no módulo original).
const database = require("./database");

async function initializeDatabase() {
  await database.checkConnection();
}

module.exports = {
  ...database,
  initializeDatabase,
};