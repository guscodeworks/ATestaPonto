const { execute } = require('../config/database');
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
    await execute(
      `INSERT INTO audit_logs (evento, nivel, admin_id, funcionario_id, mensagem, ip_origem, metadados_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(evento || 'evento_desconhecido'),
        mapLevel(nivel),
        adminId,
        funcionarioId,
        String(mensagem || 'Sem mensagem'),
        ipOrigem,
        safeMetadata ? JSON.stringify(safeMetadata) : null
      ]
    );
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
