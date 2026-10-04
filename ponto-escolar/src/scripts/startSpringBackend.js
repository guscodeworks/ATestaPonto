"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "../..");
require("dotenv").config({ path: path.join(projectRoot, ".env"), quiet: true });

if (Buffer.byteLength(process.env.INTERNAL_API_SHARED_KEY || "", "utf8") < 32) {
  console.error("Configure INTERNAL_API_SHARED_KEY no .env com pelo menos 32 bytes.");
  process.exit(1);
}

const springEnv = {
  ...process.env,
  BRASILAPI_BASE_URL: process.env.BRASILAPI_BASE_URL || "https://brasilapi.com.br",
};
// O Spring deste comando roda no host; mysql-dev publica sua porta em localhost.
if (springEnv.DB_HOST === "mysql-dev") {
  springEnv.DB_HOST = "127.0.0.1";
}
const windows = process.platform === "win32";
const javaExecutable = windows ? "java.exe" : "java";
const compilerExecutable = windows ? "javac.exe" : "javac";

function isJava21Jdk(home) {
  if (!home || !fs.existsSync(path.join(home, "bin", compilerExecutable))) return false;
  const result = spawnSync(path.join(home, "bin", javaExecutable), ["-version"], {
    encoding: "utf8",
    timeout: 5000,
  });
  return result.status === 0 && /version "21(?:[."])/.test(result.stderr + result.stdout);
}

const candidates = [springEnv.JAVA_HOME];
for (const root of ["/usr/lib/jvm", "/opt/java", "/Library/Java/JavaVirtualMachines"]) {
  if (!fs.existsSync(root)) continue;
  for (const entry of fs.readdirSync(root)) {
    candidates.push(path.join(root, entry), path.join(root, entry, "Contents", "Home"));
  }
}
const javaHome = candidates.find(isJava21Jdk);
if (!javaHome) {
  console.error("JDK 21 não encontrado. Configure JAVA_HOME para um JDK 21 válido.");
  if (fs.existsSync("/.dockerenv")) {
    console.error("O container node-dev não inclui Java. Execute npm run dev:spring em um terminal do host, fora do container.");
  }
  process.exit(1);
}
springEnv.JAVA_HOME = javaHome;

const child = spawn(windows ? "mvnw.cmd" : "./mvnw", ["spring-boot:run"], {
  cwd: path.resolve(projectRoot, "../backend-spring"),
  env: springEnv,
  stdio: "inherit",
  detached: !windows,
  shell: windows,
});

// Encerra também o processo Java iniciado pelo Maven ao pressionar Ctrl+C.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.pid) return;
    try {
      if (windows) child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") console.error("Não foi possível encerrar o Spring.");
    }
  });
}

child.on("error", () => {
  console.error("Não foi possível iniciar o Maven Wrapper do backend-spring.");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
