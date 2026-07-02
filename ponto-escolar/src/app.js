"use strict";

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const env = require("./config/env");
const govbrAuthRoutes = require("./routes/govbrAuth.routes");
const apiRoutes = require("./routes");
const { createPagesRouter } = require("./routes/pages.routes");
const punchRoutes = require("./routes/punchRoutes");
const { globalLimiter } = require("./middlewares/rateLimiters");
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
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // Cookie so exige HTTPS em producao, pois em dev/LAN o acesso pode ser
      // via HTTP puro (ver observacao do CSP acima).
      secure: env.IS_PRODUCTION,
    },
  })
);
app.use(globalLimiter);

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, data: { status: "ok" } });
});

// Preserva querystring (ex: ?code=...&state=...) ao redirecionar URLs antigas
// de callback OAuth para a rota atual, essencial para nao perder os parametros
// que o Gov.br envia de volta no callback.
function redirectPreservingQuery(targetPath) {
  return (req, res) => {
    const queryStartIndex = req.originalUrl.indexOf("?");
    const queryString =
      queryStartIndex >= 0 ? req.originalUrl.slice(queryStartIndex) : "";
    return res.redirect(`${targetPath}${queryString}`);
  };
}

// Rotas legadas de autenticacao de admin (antes de migrar para /auth/govbr/*),
// mantidas para nao quebrar links/integracoes antigas.
app.get("/admin/auth", (_req, res) => res.redirect("/auth/govbr/login"));
app.get("/admin/auth/start", (_req, res) => res.redirect("/auth/govbr/login"));
app.get("/admin/auth/login", (_req, res) => res.redirect("/auth/govbr/login"));
app.get(
  "/admin/auth/callback",
  redirectPreservingQuery("/auth/govbr/callback")
);
app.get("/admin/auth/logout", (_req, res) =>
  res.redirect("/auth/govbr/logout")
);
// Redirect 307 preserva o metodo POST original (diferente do 302/301 padrao,
// que forcaria GET), caso algum cliente antigo faca logout via POST.
app.post("/admin/auth/logout", (_req, res) =>
  res.redirect(307, "/auth/govbr/logout")
);
app.use("/auth/govbr", govbrAuthRoutes);

function sendView(res, relativePath) {
  res.set(noCacheHtmlHeaders);
  res.sendFile(path.join(viewsRoot, relativePath));
}

app.use(createPagesRouter({ sendView }));

app.use("/ponto", punchRoutes);
app.use("/api", apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;