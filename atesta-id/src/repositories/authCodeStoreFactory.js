'use strict';

const { env } = require('../config/env');
const { MemoryAuthCodeStore } = require('./memoryAuthCodeStore');
const { RedisAuthCodeStore } = require('./redisAuthCodeStore');

function createAuthCodeStore() {
  if (env.redisEnabled) {
    return new RedisAuthCodeStore();
  }

  return new MemoryAuthCodeStore();
}

module.exports = { createAuthCodeStore };
