'use strict';

const { env } = require('../config/env');
const { MemoryAccessTokenStore } = require('./memoryAccessTokenStore');
const { RedisAccessTokenStore } = require('./redisAccessTokenStore');

function createAccessTokenStore() {
  if (env.redisEnabled) {
    return new RedisAccessTokenStore();
  }

  return new MemoryAccessTokenStore();
}

module.exports = { createAccessTokenStore };
