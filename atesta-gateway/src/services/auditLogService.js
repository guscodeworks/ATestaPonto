const { sanitizeForLog, logger } = require("../utils/logger");

function mapLevel(level) {
  const normalized = String(level || "INFO").toUpperCase();
  if (
    normalized === "WARN" ||
    normalized === "ERROR" ||
    normalized === "INFO"
  ) {
    return normalized;
  }
  return "INFO";
}

async function registerAuditLog({
  evento,
  nivel = "INFO",
  adminId = {},
  funcionarioId = {},
  mensagem,
  ipOrigem = {},
  metadados = {},
}) {
  try {
    // Sanitiza metadados: nunca grava CPF/token/senha em claro.
    const safeMetadata = metadados ? sanitizeForLog(metadados) : {};

    // Sem tabela de auditoria persistente no schema → eventos vão só pro logger.
    logger.info("audit_evento", {
      evento: String(evento || "evento_desconhecido"),
      nivel: mapLevel(nivel),
      adminId,
      funcionarioId,
      mensagem: String(mensagem || "Sem mensagem"),
      ipOrigem,
      metadados: safeMetadata,
    });
  } catch (error) {
    logger.error("Falha ao registrar log de auditoria", {
      error,
      evento,
      adminId,
      funcionarioId,
    });
  }
}

module.exports = {
  registerAuditLog,
};