"use strict";

const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env"),
  quiet: true,
});

const categories = {
  DATABASE_HOST_NOT_RESOLVED: "DNS",
  DATABASE_HOST_NOT_FOUND: "DNS",
  DATABASE_CONNECTION_REFUSED: "REDE",
  DATABASE_CONNECTION_RESET: "REDE",
  DATABASE_CONNECTION_TIMEOUT: "TIMEOUT",
  DATABASE_ACCESS_DENIED: "AUTENTICAÇÃO",
  DATABASE_NOT_FOUND: "BANCO INEXISTENTE",
};

async function main() {
  let database;
  try {
    const env = require("../config/env");
    console.log(JSON.stringify({
      DB_HOST: env.DB_HOST,
      DB_PORT: env.DB_PORT,
      DB_NAME: env.DB_NAME,
    }));
    database = require("../config/database");
    // Reutiliza a configuração real (inclusive TLS); executa somente SELECT 1.
    await database.checkConnection();
    console.log("Conexão OK: SELECT 1 concluído.");
  } catch (error) {
    const category = categories[error?.details?.reason] || "DESCONHECIDO";
    // Não imprime o erro original: ele pode conter credenciais ou outros segredos.
    console.error(`Falha na verificação do banco: ${category}.`);
    process.exitCode = 1;
  } finally {
    if (database) {
      try {
        await database.closePool();
      } catch {
        console.error("Falha ao encerrar a conexão: DESCONHECIDO.");
        process.exitCode = 1;
      }
    }
  }
}

main();
