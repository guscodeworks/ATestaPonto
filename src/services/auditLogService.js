const { sanitizeForLog, logger } = require('../utils/logger');

function mapLevel(level) {
  const normalized = String(level || 'INFO').toUpperCase();
  if (normalized === 'WARN' || normalized === 'ERROR' || normalized === 'INFO') {
    return normalized;
  }
  return 'INFO';
}

async function registerAuditLog({
  evento,
  nivel = 'INFO',
  adminId = null,
  funcionarioId = null,
  mensagem,
  ipOrigem = null,
  metadados = null
}) {
  try {
    const safeMetadata = metadados ? sanitizeForLog(metadados) : null;

    // O schema atual (ponto (2).sql) nao possui tabela de auditoria persistente.
    // Para evitar erros SQL, registramos os eventos apenas no logger da aplicacao.
    logger.info('audit_evento', {
      evento: String(evento || 'evento_desconhecido'),
      nivel: mapLevel(nivel),
      adminId,
      funcionarioId,
      mensagem: String(mensagem || 'Sem mensagem'),
      ipOrigem,
      metadados: safeMetadata
    });
  } catch (error) {
    logger.error('Falha ao registrar log de auditoria', {
      error,
      evento,
      adminId,
      funcionarioId
    });
  }
}

module.exports = {
  registerAuditLog
};
