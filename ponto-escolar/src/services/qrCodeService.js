const env = require("../config/env");

// QR Code fixo (não dinâmico/por registro): aponta sempre p/ a mesma rota de
// ponto. As funções simulam um CRUD real p/ compat com o restante da API.
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

// Aceita URL completa ou caminho relativo avulso; devolve só o pathname.
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

// Sendo único e fixo, validar = conferir se o caminho lido bate com a rota esperada.
function isFixedAccessQr(value) {
  return normalizeAccessPath(value).toLowerCase() === FIXED_QR_ACCESS_PATH;
}

// Payload estável do QR (não cria permissão de acesso).
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

// includeSecret expõe qr_code/url só na criação/consulta explícita, não em listagens.
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

// Sendo 1 item fixo, só a página 1 retorna o item; demais páginas são vazias.
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

// Desativação não se aplica ao QR fixo; retorna false (operação sem efeito).
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