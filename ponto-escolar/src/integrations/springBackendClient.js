"use strict";

const { createHash, createHmac, randomUUID } = require("node:crypto");
const env = require("../config/env");

// Retorna Response: o chamador trata o status/JSON conforme seu domínio.
// O mesmo Buffer é usado na assinatura e no envio, sem serialização posterior.
async function requestSpring(path, { method = "GET", body } = {}) {
  if (Buffer.byteLength(env.INTERNAL_API_SHARED_KEY, "utf8") < 32) {
    throw new Error("INTERNAL_API_SHARED_KEY deve ter ao menos 32 bytes UTF-8");
  }
  const baseUrl = new URL(env.SPRING_BACKEND_URL);
  if (!["http:", "https:"].includes(baseUrl.protocol)
    || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash
    || baseUrl.pathname !== "/") {
    throw new Error("SPRING_BACKEND_URL deve conter somente a origem do Spring");
  }
  if (typeof path !== "string" || !path.startsWith("/internal/")) {
    throw new Error("O cliente Spring aceita somente caminhos /internal/**");
  }
  const url = new URL(path, baseUrl);
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith("/internal/") || url.hash) {
    throw new Error("Caminho interno Spring invalido");
  }
  const httpMethod = method.toUpperCase();
  if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(httpMethod)) {
    throw new Error("Metodo HTTP invalido");
  }
  if (["GET", "HEAD"].includes(httpMethod) && body !== undefined) {
    throw new Error("GET e HEAD nao aceitam body neste cliente");
  }

  const bodyBytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), "utf8");
  if (bodyBytes.length > 100 * 1024) {
    throw new Error("Body interno excede 100 KiB");
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestId = randomUUID();
  const bodyHash = createHash("sha256").update(bodyBytes).digest("hex");
  const canonical = [httpMethod, url.pathname + url.search, timestamp, requestId, bodyHash].join("\n");
  const signature = createHmac("sha256", env.INTERNAL_API_SHARED_KEY)
    .update(canonical, "utf8").digest("hex");

  return fetch(url, {
    method: httpMethod,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      "X-Internal-Timestamp": timestamp,
      "X-Internal-Request-Id": requestId,
      "X-Internal-Signature": signature,
    },
    body: body === undefined ? undefined : bodyBytes,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
}

module.exports = { requestSpring };
