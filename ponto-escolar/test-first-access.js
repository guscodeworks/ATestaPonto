"use strict";

const http = require("node:http");
const mysql = require("mysql2/promise");

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const TEST_CPF = "58297026817";
const TEMP_PASSWORD = "Temp@123456";
const NEW_PASSWORD = "NovaSenha@123456";

// Conexão direta com o banco - funciona do host (localhost:3307) ou do container (banco:3306)
const dbConfig = {
  host: process.env.TEST_DB_HOST || "localhost",
  port: parseInt(process.env.TEST_DB_PORT || "3307"),
  user: process.env.TEST_DB_USER || "root",
  password: process.env.TEST_DB_PASSWORD || "senha_root_123",
  database: process.env.TEST_DB_NAME || "ponto_escolar",
};

let connection;
let firstAccessToken = null;
let normalJwtToken = null;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = JSON.stringify(options.body || {});

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: options.method || "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...(options.headers || {}),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function cleanup() {
  if (connection) await connection.end();
  console.log("\n🧹 Conexão fechada.");
}

async function testLogin() {
  console.log("--- Passo 1: Login com senha temporária ---");
  const res = await request("/api/pontos/login", {
    method: "POST",
    body: { identificador: TEST_CPF, senha: TEMP_PASSWORD },
  });

  if (res.status !== 200) {
    console.error(`❌ Login falhou: status=${res.status}, data=${JSON.stringify(res.data)}`);
    process.exit(1);
  }

  const data = res.data.data || res.data;
  if (!data.token_primeiro_acesso) {
    console.error(`❌ Resposta não contém token_primeiro_acesso: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (data.primeiro_acesso !== true) {
    console.error(`❌ primeiro_acesso deveria ser true: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (data.token) {
    console.error(`❌ JWT normal não deveria ser emitido no primeiro acesso: ${JSON.stringify(data)}`);
    process.exit(1);
  }

  firstAccessToken = data.token_primeiro_acesso;
  console.log(`✅ Login com primeiro acesso bem-sucedido`);
  console.log(`   token_primeiro_acesso recebido: ${firstAccessToken.substring(0, 30)}...`);
  console.log(`   primeiro_acesso: ${data.primeiro_acesso}\n`);
}

async function testProtectedRouteWithFirstAccessToken() {
  console.log("--- Passo 2: Tentar acessar rota protegida com token de primeiro acesso ---");
  const res = await request("/api/pontos/registrar", {
    method: "POST",
    headers: { Authorization: `Bearer ${firstAccessToken}` },
    body: {},
  });

  if (res.status === 401 || res.status === 403) {
    console.log(`✅ Token de primeiro acesso corretamente rejeitado em rota protegida (status=${res.status})\n`);
  } else {
    console.error(`❌ Token de primeiro acesso deveria ser rejeitado: status=${res.status}`);
    process.exit(1);
  }
}

async function testChangePassword() {
  console.log("--- Passo 3: Trocar senha obrigatória ---");
  const res = await request("/api/pontos/primeiro-acesso/trocar-senha", {
    method: "POST",
    headers: { Authorization: `Bearer ${firstAccessToken}` },
    body: { novaSenha: NEW_PASSWORD },
  });

  if (res.status !== 200) {
    console.error(`❌ Troca de senha falhou: status=${res.status}, data=${JSON.stringify(res.data)}`);
    process.exit(1);
  }

  const data = res.data.data || res.data;
  if (data.primeiro_acesso !== false) {
    console.error(`❌ primeiro_acesso deveria ser false após troca: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (data.token) {
    console.error(`❌ Troca de senha não deveria emitir JWT normal: ${JSON.stringify(data)}`);
    process.exit(1);
  }

  console.log(`✅ Troca de senha bem-sucedida`);
  console.log(`   primeiro_acesso: ${data.primeiro_acesso}`);
  console.log(`   mensagem: ${data.message}\n`);
}

async function testNormalLogin() {
  console.log("--- Passo 4: Login com nova senha (deve emitir JWT normal) ---");
  const res = await request("/api/pontos/login", {
    method: "POST",
    body: { identificador: TEST_CPF, senha: NEW_PASSWORD },
  });

  if (res.status !== 200) {
    console.error(`❌ Login com nova senha falhou: status=${res.status}, data=${JSON.stringify(res.data)}`);
    process.exit(1);
  }

  const data = res.data.data || res.data;
  if (!data.token) {
    console.error(`❌ JWT normal não foi emitido: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (data.primeiro_acesso !== false) {
    console.error(`❌ primeiro_acesso deveria ser false: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  if (data.token_primeiro_acesso) {
    console.error(`❌ token_primeiro_acesso não deveria existir após troca: ${JSON.stringify(data)}`);
    process.exit(1);
  }

  normalJwtToken = data.token;
  console.log(`✅ Login normal bem-sucedido`);
  console.log(`   JWT recebido: ${data.token.substring(0, 30)}...`);
  console.log(`   primeiro_acesso: ${data.primeiro_acesso}`);
  console.log(`   role: ${data.role || "N/A"}\n`);
}

async function testProtectedRouteWithNormalToken() {
  console.log("--- Passo 5: Acessar rota protegida com JWT normal ---");
  const res = await request("/api/pontos/registrar", {
    method: "POST",
    headers: { Authorization: `Bearer ${normalJwtToken}` },
    body: {},
  });

  if (res.status === 200 || res.status === 400 || res.status === 422) {
    console.log(`✅ JWT normal aceito em rota protegida (status=${res.status})\n`);
  } else {
    console.error(`❌ JWT normal deveria ser aceito: status=${res.status}`);
    process.exit(1);
  }
}

async function testReuseFirstAccessToken() {
  console.log("--- Passo 6: Tentar reutilizar token de primeiro acesso ---");
  const res = await request("/api/pontos/primeiro-acesso/trocar-senha", {
    method: "POST",
    headers: { Authorization: `Bearer ${firstAccessToken}` },
    body: { novaSenha: "OutraSenha@123456" },
  });

  if (res.status === 401 || res.status === 409) {
    console.log(`✅ Token reutilizado corretamente rejeitado (status=${res.status})\n`);
  } else {
    console.error(`❌ Token reutilizado deveria ser rejeitado: status=${res.status}`);
    process.exit(1);
  }
}

async function main() {
  console.log("========================================");
  console.log("  TESTE DE PRIMEIRO ACESSO - SENHA");
  console.log("========================================");
  console.log(`  Servidor: ${BASE_URL}`);
  console.log(`  CPF teste: ${TEST_CPF}`);
  console.log("========================================\n");

  connection = await mysql.createConnection(dbConfig);

  console.log("✅ Conectado ao banco de dados");

  try {
    await testLogin();
    await testProtectedRouteWithFirstAccessToken();
    await testChangePassword();
    await testNormalLogin();
    await testProtectedRouteWithNormalToken();
    await testReuseFirstAccessToken();

    console.log("========================================");
    console.log("  ✅ TODOS OS TESTES PASSARAM");
    console.log("========================================");
  } catch (error) {
    console.error("\n❌ ERRO:", error.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main();
