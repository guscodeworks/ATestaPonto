"use strict";

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const env = require("./config/env");
const { checkConnection } = require("./config/database");
const { getRedisClient } = require("./config/redis");
const { RedisSessionStore } = require("./config/redisSessionStore");
const govbrAuthRoutes = require("./routes/govbrAuth.routes");
const apiRoutes = require("./routes");
const { createPagesRouter } = require("./routes/pages.routes");
const punchRoutes = require("./routes/punchRoutes");
const { notFoundMiddleware } = require("./middlewares/notFoundMiddleware");
const { errorMiddleware } = require("./middlewares/errorMiddleware");

const app = express();
const viewsRoot = path.resolve(__dirname, "../views");
const publicRoot = path.join(__dirname, "../public");
const assetsRoot = path.join(publicRoot, "assets");
const staticOptions = {
  maxAge: "1h",
};
// Views HTML nunca devem ser cacheadas pelo navegador, pois seu conteudo
// depende do estado de sessao (admin logado, etc) no momento da requisicao.
const noCacheHtmlHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

// Sem Origin (ex: chamadas server-to-server, curl) sempre passa; com Origin,
// so libera "*" fora de producao (ambiente de dev/teste), nunca em producao.
function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  if (env.CORS_ORIGINS.includes("*")) {
    return !env.IS_PRODUCTION;
  }
  return env.CORS_ORIGINS.includes(origin);
}

app.disable("x-powered-by");
// Necessario para que req.ip e "secure" (cookie) reflitam corretamente o
// protocolo/IP originais quando a aplicacao roda atras de um proxy reverso.
app.set("trust proxy", 1);

app.use(
  helmet({
    // Assets estaticos (imagens, fontes, etc) precisam ser acessiveis mesmo
    // se consumidos de uma origem diferente (ex: app servido por IP na LAN).
    crossOriginResourcePolicy: { policy: "cross-origin" }, // ← seguro para LAN/IP
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Aplicacao pode ser acessada via HTTP puro em rede local (sem TLS),
        // entao o upgrade automatico para HTTPS quebraria o acesso nesse cenario.
        "upgrade-insecure-requests": null, // ← remove o upgrade forçado de HTTP→HTTPS
      },
    },
  })
);

function getRequestHost(req) {
  return String(req.headers["x-forwarded-host"] || req.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

// Requisicoes vindas do mesmo host (ex: front-end servido pela propria
// aplicacao) sao sempre permitidas, mesmo sem estarem na allowlist de
// CORS_ORIGINS — evita a necessidade de configurar a propria origem do app
// na lista de origens externas permitidas.
function isSameHostOrigin(req, origin) {
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const requestHost = getRequestHost(req);
    return (
      requestHost.length > 0 && originUrl.host.toLowerCase() === requestHost
    );
  } catch (_error) {
    return false;
  }
}

function isAllowedRequestOrigin(req, origin) {
  if (!origin) {
    return true;
  }
  if (isSameHostOrigin(req, origin)) {
    return true;
  }
  return isAllowedOrigin(origin);
}

const corsBaseOptions = {
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;

    if (isAllowedRequestOrigin(req, origin)) {
      return callback(null, {
        ...corsBaseOptions,
        origin: true,
      });
    }

    const error = new Error("Origem nao permitida por CORS");
    error.status = 403;
    error.code = "CORS_ORIGIN_BLOCKED";
    return callback(error);
  })
);

app.use(express.static(publicRoot, staticOptions));
app.use("/assets", express.static(assetsRoot, staticOptions));

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
const sessionOptions = {
  secret: env.SESSION_SECRET,
  resave: false,
  rolling: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    // Cookie so exige HTTPS em producao, pois em dev/LAN o acesso pode ser
    // via HTTP puro (ver observacao do CSP acima).
    secure: env.IS_PRODUCTION,
    maxAge: env.ADMIN_SESSION_TTL_MS,
  },
};

if (env.REDIS_ENABLED) {
  sessionOptions.store = new RedisSessionStore();
}

// Uma unica instancia atende somente os fluxos administrativos. Rotas publicas,
// de funcionario, health check e respostas 404 nao precisam carregar ou renovar
// a sessao Gov.br no Redis.
const adminSessionMiddleware = session(sessionOptions);

async function checkRedisConnection() {
  if (!env.REDIS_ENABLED) {
    return "disabled";
  }

  const response = await getRedisClient().ping();
  if (response !== "PONG") {
    throw new Error("Unexpected Redis health check response.");
  }

  return "connected";
}

app.get("/health", async (_req, res) => {
  const [databaseResult, redisResult] = await Promise.allSettled([
    checkConnection(),
    checkRedisConnection(),
  ]);
  const databaseStatus =
    databaseResult.status === "fulfilled" ? "connected" : "unavailable";
  const redisStatus =
    redisResult.status === "fulfilled" ? redisResult.value : "unavailable";

  if (databaseStatus === "unavailable" || redisStatus === "unavailable") {
    const databaseUnavailable = databaseStatus === "unavailable";

    return res.status(503).json({
      success: false,
      data: {
        status: "unhealthy",
        database: databaseStatus,
        redis: redisStatus,
      },
      error: {
        code: databaseUnavailable
          ? "DATABASE_UNAVAILABLE"
          : "REDIS_UNAVAILABLE",
        message: databaseUnavailable
          ? "Banco de dados indisponivel."
          : "Redis indisponivel.",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      status: "ok",
      database: databaseStatus,
      redis: redisStatus,
    },
  });
});

app.use("/auth/govbr", adminSessionMiddleware, govbrAuthRoutes);

function sendView(res, relativePath) {
  res.set(noCacheHtmlHeaders);
  res.sendFile(path.join(viewsRoot, relativePath));
}

app.use("/admin", adminSessionMiddleware);
app.use(createPagesRouter({ sendView }));

app.use("/ponto", punchRoutes);
app.use("/api/admin", adminSessionMiddleware);
app.use("/api", apiRoutes);
app.use(notFoundMiddleware({ viewsRoot, noCacheHtmlHeaders }));
app.use(errorMiddleware);

module.exports = app;
