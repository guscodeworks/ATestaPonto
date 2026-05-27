'use strict';

const app = require('./src/app');
const env = require('./src/config/env');
const { checkConnection } = require('./src/config/database');

async function startServer() {
  try {
    await checkConnection();
    app.listen(env.PORT, () => {
      console.log(`Servidor iniciado na porta ${env.PORT}.`);
    });
  } catch (error) {
    console.error('Falha ao inicializar servidor:', error.message);
    process.exit(1);
  }
}

startServer();