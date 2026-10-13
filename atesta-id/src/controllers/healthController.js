'use strict';

const { env } = require('../config/env');
const { getRedisClient } = require('../config/redis');

function createHealthResponse(redisStatus) {
  return {
    success: redisStatus !== 'unavailable',
    service: 'Simulador de Identidade — ATestaPonto',
    environment: env.environmentLabel,
    // Este servico e sempre um simulador, inclusive quando publicado para homologacao.
    production: false,
    redis: {
      enabled: env.redisEnabled,
      status: redisStatus
    },
    message: redisStatus === 'unavailable'
      ? 'Servico temporariamente indisponivel.'
      : 'Simulador de identidade rodando em ambiente demonstrativo.'
  };
}

async function showHealth(_req, res) {
  if (!env.redisEnabled) {
    return res.status(200).json(createHealthResponse('disabled'));
  }

  try {
    const pong = await getRedisClient().ping();

    if (pong !== 'PONG') {
      return res.status(503).json(createHealthResponse('unavailable'));
    }
  } catch (_error) {
    // Nao retorna nem registra o erro bruto para evitar exposicao de endpoint,
    // token ou detalhes internos do provedor Redis.
    return res.status(503).json(createHealthResponse('unavailable'));
  }

  return res.status(200).json({
    ...createHealthResponse('healthy')
  });
}

module.exports = {
  showHealth
};
