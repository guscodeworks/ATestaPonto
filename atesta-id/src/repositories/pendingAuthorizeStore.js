'use strict';

const { env } = require('../config/env');

module.exports = env.redisEnabled
  ? require('./redisPendingAuthorizeStore')
  : require('./memoryPendingAuthorizeStore');
