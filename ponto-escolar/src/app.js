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
const { validateQrCode } = require("./services/qrCodeService");
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
const noCacheHtmlHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

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
app.set("trust proxy", env.IS_PRODUCTION ? 1 : false);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // ← seguro para LAN/IP
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "upgrade-insecure-requests": null, // ← remove o upgrade forçado de HTTP→HTTPS
      },
    },
  })
);

function getRequestHost(req) {
  const host = env.IS_PRODUCTION
    ? req.headers["x-forwarded-host"] || req.get("host")
    : req.get("host");

  return String(host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

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
    name: 'ponto_escolar_sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.IS_PRODUCTION
    }
  })
);
app.use(globalLimiter);

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, data: { status: "ok" } });
});

function redirectPreservingQuery(targetPath) {
  return (req, res) => {
    const queryStartIndex = req.originalUrl.indexOf("?");
    const queryString =
      queryStartIndex >= 0 ? req.originalUrl.slice(queryStartIndex) : "";
    return res.redirect(`${targetPath}${queryString}`);
  };
}

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
app.post("/admin/auth/logout", (_req, res) =>
  res.redirect(307, "/auth/govbr/logout")
);
app.use("/auth/govbr", govbrAuthRoutes);

function sendView(res, relativePath) {
  res.set(noCacheHtmlHeaders);
  res.sendFile(path.join(viewsRoot, relativePath));
}

app.use(
  createPagesRouter({
    sendView,
    validateQrCode,
    schoolUnitCode: env.SCHOOL_UNIT_CODE,
    noCacheHtmlHeaders,
  })
);

app.use("/ponto", punchRoutes);
app.use("/api", apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
