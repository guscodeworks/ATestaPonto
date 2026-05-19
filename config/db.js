'use strict'; 

const database = require('../src/config/database');

async function initializeDatabase() {
  await database.checkConnection();
}

module.exports = {
  ...database,
  initializeDatabase
};