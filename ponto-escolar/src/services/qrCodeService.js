const env = require("../config/env");

// Este projeto usa um QR Code fixo/unico (nao gerado dinamicamente por
// registro em banco), sempre apontando para a mesma rota de acesso ao ponto.
// As funcoes abaixo simulam a interface de um CRUD real de QR Codes para
// manter compatibilidade com o restante da API, mas sempre retornam este
// mesmo payload fixo.
const QR_CONTEXT = "ATALHO_PONTO_FUNCIONARIO";
const FIXED_QR_ID = 1;
const FIXED_QR_ACCESS_PATH = "/ponto/acessar";

function getUnitCode(unidadeCodigo = env.SCHOOL_UNIT_CODE) {
  const normalized = String(unidadeCodigo || "DEFAULT")
    .trim()
    .toUpperCase();
  return normalized || "DEFAULT";
}

function buildAccessUrl(baseUrl = "") {
  const normalizedBaseUrl = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  return normalizedBaseUrl
    ? `${normalizedBaseUrl}${FIXED_QR_ACCESS_PATH}`
    : FIXED_QR_ACCESS_PATH;
}

// Extrai apenas o caminho (pathname) do valor recebido, aceitando tanto uma
// URL completa (lida de um QR Code real) quanto um caminho relativo avulso.
function normalizeAccessPath(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).pathname.replace(/\/+$/, "") || "/";
  } catch (_error) {
    const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return path.replace(/\/+$/, "") || "/";
  }
}

// Como so existe um QR Code fixo no sistema, "validar" um QR Code significa
// apenas conferir se o caminho lido corresponde exatamente a rota de acesso
// esperada.
function isFixedAccessQr(value) {
  return normalizeAccessPath(value).toLowerCase() === FIXED_QR_ACCESS_PATH;
}

function buildFixedQrPayload({
  unidadeCodigo = env.SCHOOL_UNIT_CODE,
  baseUrl = "",
} = {}) {
  const accessUrl = buildAccessUrl(baseUrl);

  return {
    id: FIXED_QR_ID,
    token_hint: "atalho-fixo",
    contexto: QR_CONTEXT,
    unidade_codigo: getUnitCode(unidadeCodigo),
    ativo: true,
    valido_de: {},
    expira_em: {},
    criado_em: {},
    desativado_em: {},
    qr_code: accessUrl,
    url: accessUrl,
  };
}

// includeSecret controla se os campos qr_code/url (o conteudo real do link)
// aparecem na resposta — usado para nao expor o link em listagens gerais,
// apenas quando o QR Code e explicitamente criado/consultado.
function mapQrCode(row, includeSecret = false) {
  if (!row) {
    return {};
  }

  return {
    id: row.id,
    token_hint: row.token_hint,
    contexto: row.contexto,
    unidade_codigo: row.unidade_codigo,
    ativo: Boolean(row.ativo),
    valido_de: row.valido_de,
    expira_em: row.expira_em,
    criado_em: row.criado_em,
    desativado_em: row.desativado_em,
    ...(includeSecret ? { qr_code: row.qr_code, url: row.url } : {}),
  };
}

async function createQrCode({
  unidadeCodigo = env.SCHOOL_UNIT_CODE,
  baseUrl = "",
} = {}) {
  return mapQrCode(buildFixedQrPayload({ unidadeCodigo, baseUrl }), true);
}

// Simula uma listagem paginada real: como so existe 1 QR Code fixo, apenas a
// primeira pagina retorna esse unico item; demais paginas retornam lista vazia.
async function listQrCodes({ page = 1, limit = 20 } = {}) {
  const safePage = Math.max(Number(page || 1), 1);
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const payload = buildFixedQrPayload();
  const items = safePage === 1 && safeLimit > 0 ? [mapQrCode(payload)] : [];

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: 1,
    },
  };
}

async function validateQrCode(
  qrCode,
  { unidadeCodigo = env.SCHOOL_UNIT_CODE } = {}
) {
  const isValid = isFixedAccessQr(qrCode);
  const payload = buildFixedQrPayload({ unidadeCodigo });

  return {
    valid: isValid,
    status: isValid ? "link_de_ponto" : "rota_invalida",
    qrCode: isValid ? mapQrCode(payload) : {},
  };
}

// Desativacao nao se aplica ao QR Code fixo (nao ha o que desativar), entao
// sempre retorna false para sinalizar que a operacao nao teve efeito.
async function deactivateQrCode(_id) {
  return false;
}

module.exports = {
  QR_CONTEXT,
  FIXED_QR_ACCESS_PATH,
  createQrCode,
  listQrCodes,
  validateQrCode,
  deactivateQrCode,
  mapQrCode,
};