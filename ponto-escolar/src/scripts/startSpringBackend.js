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
const springRoot = path.resolve(projectRoot, "..", "backend-spring");
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
