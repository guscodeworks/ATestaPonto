'use strict';

const app = require('./src/app');
const env = require('./src/config/env');
const { checkConnection } = require('./src/config/database');

async function bootstrap() {
  try {
    await checkConnection();
    app.listen(env.PORT, () => {
      console.log(`Servidor seguro de ponto iniciado na porta ${env.PORT}.`);
    });
  } catch (error) {
    console.error('Falha ao inicializar servidor:', error.message);
    process.exit(1);
  }
}

bootstrap();
