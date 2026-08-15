"use strict";

const session = require("express-session");
const env = require("../config/env");
const { RedisSessionStore } = require("../config/redisSessionStore");

const options = {
  name: "ponto_recovery",
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
