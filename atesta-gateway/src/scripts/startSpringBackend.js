"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "../..");
const springRoot = path.resolve(projectRoot, "..", "backend-spring");
const springEnv = { ...process.env };
// Precedência: ambiente externo > .env do Spring > .env do Node (valores compartilhados).
require("dotenv").config({
  path: [path.join(springRoot, ".env"), path.join(projectRoot, ".env")],
  processEnv: springEnv,
  quiet: true,
});
springEnv.BRASILAPI_BASE_URL ||= "https://brasilapi.com.br";

if (Buffer.byteLength(springEnv.INTERNAL_API_SHARED_KEY || "", "utf8") < 32) {
  console.error("Configure INTERNAL_API_SHARED_KEY no ambiente ou .env com pelo menos 32 bytes.");
  process.exit(1);
}

// JDK e Maven sao configurados explicitamente, sem inferir SO ou ambiente Docker.
const javaHome = springEnv.JAVA_HOME;
const mavenHome = springEnv.MAVEN_HOME;
if (!javaHome || !mavenHome) {
  console.error("Configure JAVA_HOME (JDK 21) e MAVEN_HOME (Maven 3) para iniciar o Spring.");
  process.exit(1);
}
const javaExecutable = ["java", "java.exe"]
  .map(name => path.join(javaHome, "bin", name))
  .find(file => fs.existsSync(file));
const compilerExists = ["javac", "javac.exe"]
  .some(name => fs.existsSync(path.join(javaHome, "bin", name)));
const version = javaExecutable && spawnSync(javaExecutable, ["-version"], {
  encoding: "utf8", timeout: 5000,
});
if (!compilerExists || !version || version.status !== 0
    || !/version "21(?:[.\"])/.test(version.stderr + version.stdout)) {
  console.error("JAVA_HOME deve apontar para um JDK 21 valido.");
  process.exit(1);
}
const bootDirectory = path.join(mavenHome, "boot");
const launcherJars = fs.existsSync(bootDirectory)
  ? fs.readdirSync(bootDirectory).filter(name => /^plexus-classworlds-.*\.jar$/.test(name)) : [];
const mavenConfig = path.join(mavenHome, "bin", "m2.conf");
if (launcherJars.length !== 1 || !fs.existsSync(mavenConfig)) {
  console.error("MAVEN_HOME deve apontar para uma distribuicao Maven 3 valida.");
  process.exit(1);
}
async function startSpring() {
  const port = Number(springEnv.SERVER_PORT || 8081);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("SERVER_PORT deve ser uma porta valida entre 1 e 65535.");
    process.exitCode = 1;
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen({ port, host: springEnv.SERVER_ADDRESS }, () => probe.close(resolve));
    });
  } catch (error) {
    console.error(error.code === "EADDRINUSE"
      ? `Porta ${port} ocupada. Libere a porta antes de executar npm run dev:spring; nenhum processo foi encerrado.`
      : `Nao foi possivel verificar a porta ${port} (${error.code || "erro de rede"}).`);
    process.exitCode = 1;
    return;
  }

  const child = spawn(javaExecutable, [
    `-Dmaven.home=${mavenHome}`,
    `-Dmaven.multiModuleProjectDirectory=${springRoot}`,
    `-Dclassworlds.conf=${mavenConfig}`,
    "-classpath", path.join(bootDirectory, launcherJars[0]),
    "org.codehaus.plexus.classworlds.launcher.Launcher",
    "spring-boot:run",
  ], { cwd: springRoot, env: springEnv, stdio: "inherit", shell: false });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (child.pid && !child.killed) child.kill(signal);
    });
  }

  child.on("error", () => {
    console.error("Não foi possível iniciar o Maven do backend-spring.");
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });

}

startSpring().catch(() => {
  console.error("Nao foi possivel iniciar o backend-spring.");
  process.exitCode = 1;
});
