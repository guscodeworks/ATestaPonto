"use strict";

const app = require("./src/app.js");
const env = require("./src/config/env.js");
const { checkConnection } = require("./src/config/database");

const DATABASE_STARTUP_ATTEMPTS = 3;
const DATABASE_RETRY_DELAY_MS = 500;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDatabaseAtStartup() {
  for (let attempt = 1; attempt <= DATABASE_STARTUP_ATTEMPTS; attempt += 1) {
    try {
      await checkConnection();
      return;
    } catch (error) {
      const canRetry =
        error?.details?.transient === true &&
        attempt < DATABASE_STARTUP_ATTEMPTS;

      if (!canRetry) {
        throw error;
      }

      console.warn(
        `Banco temporariamente indisponivel. Nova tentativa ${attempt + 1} de ${DATABASE_STARTUP_ATTEMPTS}.`
      );
      await wait(DATABASE_RETRY_DELAY_MS * attempt);
    }
  }
}

async function startServer() {
  try {
    await checkDatabaseAtStartup();
    app.listen(env.PORT, env.HOST, () => {
      console.log(`Servidor iniciado na porta ${env.PORT}.`);
    });
  } catch (error) {
    console.error("Falha ao inicializar servidor:", error.message);
    process.exit(1);
  }
}

startServer();
