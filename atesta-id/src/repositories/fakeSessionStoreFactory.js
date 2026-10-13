'use strict';

const { env } = require('../config/env');
const { MemoryFakeSessionStore } = require('./memoryFakeSessionStore');
const { RedisFakeSessionStore } = require('./redisFakeSessionStore');

function createFakeSessionStore() {
  if (env.redisEnabled) {
    return new RedisFakeSessionStore();
  }

  return new MemoryFakeSessionStore();
}

module.exports = { createFakeSessionStore };
