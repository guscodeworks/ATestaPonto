"use strict";

const session = require("express-session");
const env = require("../config/env");
const { RedisSessionStore } = require("../config/redisSessionStore");

// Esta sessão não autentica o funcionário: ela só conserva, por pouco tempo,
// o token do QR já validado entre a entrega da página e o POST de login.
const options = {
  name: "ponto_qr_acesso",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.IS_PRODUCTION,
    maxAge: 15 * 60 * 1000,
  },
};

if (env.REDIS_ENABLED) {
  options.store = new RedisSessionStore();
}

module.exports = session(options);
