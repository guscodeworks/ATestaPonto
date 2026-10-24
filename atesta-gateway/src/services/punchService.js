"use strict";

const bcrypt = require("bcrypt");
const { requestSpring } = require("../integrations/springBackendClient");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { findLoginEmployee, findLoginLink, updateLastLogin } = require("./employeeCredentialsService");
const { isValidCpf, maskCpf, normalizeCpf } = require("../utils/cpf");
const { PUNCH_TYPES } = require("../utils/punch");
const {
  AppError,
  BadRequestError,
  UnauthorizedError,
} = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");
const { buildCredentialVersion } = require("./authService");
const { createFirstAccessToken } = require("./firstAccessTokenService");

function mapFuncionario(funcionario) {
  return {
    id: funcionario.id,
    nome: funcionario.nome,
    email: funcionario.email,
    cpf: maskCpf(funcionario.cpf),
  };
}

function unavailable() {
  return new AppError("Servico de ponto indisponivel", {
    statusCode: 502, code: "PUNCH_SERVICE_UNAVAILABLE",
  });
}

async function requestPunch(operation, body, project) {
  let response;
  let result;
  try {
    response = await requestSpring(`/internal/ponto/${operation}`, { method: "POST", body });
    result = await response.json();
  } catch (_error) {
    throw unavailable();
  }
  if (!response.ok) {
    const codes = { BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403,
      NOT_FOUND: 404, CONFLICT: 409, VALIDATION_ERROR: 422, INTERNAL_ERROR: 500 };
    if (result && codes[result.code] === response.status && typeof result.message === "string") {
      throw new AppError(result.message, { statusCode: response.status, code: result.code });
    }
    throw unavailable();
  }
  try {
    return project(result);
  } catch (_error) {
    throw unavailable();
  }
}

function publicTimes(value, nullable = true) {
  const { entrada, saida_almoco, retorno_almoco, saida } = value;
  for (const time of [entrada, saida_almoco, retorno_almoco, saida]) {
    if (!(nullable && time === null) && (typeof time !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(time))) {
      throw unavailable();
    }
  }
  return { entrada, saida_almoco, retorno_almoco, saida };
}

function getTodayPunch(funcionarioId, referenceDate) {
  return requestPunch("hoje", {
    funcionario_id: Number(funcionarioId), referencia: referenceDate?.toISOString(),
  }, (result) => {
    const { funcionario, jornada, ponto, proxima_batida, jornada_concluida } = result;
    if (typeof funcionario.nome !== "string" || typeof funcionario.cargo !== "string"
        || typeof ponto.data_referencia !== "string" || typeof jornada_concluida !== "boolean"
        || !(proxima_batida === null || PUNCH_TYPES.includes(proxima_batida))) throw unavailable();
    return {
      funcionario: { nome: funcionario.nome, cargo: funcionario.cargo },
      jornada: publicTimes(jornada, false),
      ponto: { data_referencia: ponto.data_referencia, ...publicTimes(ponto) },
      proxima_batida, jornada_concluida,
    };
  });
}

function getPunchHistory(funcionarioId, rawMonth, referenceDate) {
  return requestPunch("historico", {
    funcionario_id: Number(funcionarioId), mes: rawMonth, referencia: referenceDate?.toISOString(),
  }, (result) => {
    const { periodo, resumo, registros } = result;
    const { dias_com_registro, jornadas_completas, jornadas_incompletas, total_minutos } = resumo;
    if (typeof periodo !== "string" || !Array.isArray(registros)
        || ![dias_com_registro, jornadas_completas, jornadas_incompletas, total_minutos]
          .every(value => Number.isInteger(value) && value >= 0)) throw unavailable();
    return {
      periodo,
      resumo: { dias_com_registro, jornadas_completas, jornadas_incompletas, total_minutos },
      registros: registros.map((row) => {
        const { data_referencia, total_minutos, status, vinculo_funcional_id,
          unidade_escolar_id, unidade_escolar_nome } = row;
        if (typeof data_referencia !== "string" || typeof unidade_escolar_nome !== "string"
            || ![vinculo_funcional_id, unidade_escolar_id].every(id => Number.isInteger(id) && id > 0)
            || !(total_minutos === null || (Number.isInteger(total_minutos) && total_minutos >= 0))
            || !["COMPLETO", "INCOMPLETO"].includes(status)) throw unavailable();
        return { data_referencia, ...publicTimes(row), total_minutos, status,
          vinculo_funcional_id, unidade_escolar_id, unidade_escolar_nome };
      }),
    };
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Hash fixo p/ comparar même quando o usuário não existe (mesma latência).
const INVALID_PASSWORD_HASH = bcrypt.hashSync(
  "invalid-login-credential",
  env.BCRYPT_SALT_ROUNDS
);

// Delay pós-login inválido (também afeta scripts/bots).
function waitForFailedLoginDelay() {
  return new Promise((resolve) => {
    setTimeout(resolve, env.LOGIN_FAILURE_DELAY_MS);
  });
}

function resolveLogin(body = {}) {
  const rawLogin = String(body.identificador || "").trim();
  const email = rawLogin.includes("@") ? rawLogin.toLowerCase() : "";
  const cpf = email ? "" : normalizeCpf(rawLogin);
  const senha = String(body.senha || "");

  if (
    !rawLogin ||
    (email && !EMAIL_REGEX.test(email)) ||
    (!email && !isValidCpf(cpf))
  ) {
    throw new BadRequestError("Informe um CPF ou email valido");
  }

  return {
    cpf,
    email,
    senha,
    // CPF mascarado no log de auditoria, mesmo em tentativas inválidas.
    auditLogin: email || maskCpf(cpf),
  };
}

function isFirstAccess(value) {
  return value === true || value === 1 || value === "1";
}

// Autenticação própria do funcionário (separada do login admin Gov.br).
async function loginFuncionario(body, { ipOrigem } = {}) {
  const login = resolveLogin(body);

  const funcionario = await findLoginEmployee(login);
  const senhaCorreta = await bcrypt.compare(
    login.senha,
    String(funcionario?.senha_hash || INVALID_PASSWORD_HASH)
  );

  // Falha de credenciais sempre devolve a mesma msg (não revela o que falhou).
  if (!funcionario || !senhaCorreta) {
    await registerAuditLog({
      evento: "funcionario_login_invalido",
      nivel: "WARN",
      mensagem: "Tentativa de login de funcionario invalida",
      ipOrigem,
      metadados: { login: login.auditLogin },
    });
    await waitForFailedLoginDelay();
    throw new UnauthorizedError("CPF/email ou senha invalidos");
  }

  // Jornada/permissão de bater ponto vem do vínculo ativo. Funcionário ativo sem
  // vínculo não tem jornada nem geolocalização: rejeita aqui p/ não emitir um
  // token que só falharia tardiamente no ponto/dashboard. ANTES de gravar
  // ultimo_login_em (não marca sessão inválida como login bem-sucedido).
  // O banco legado não possui vínculos funcionais. Nele, a flag ativo do
  // funcionário já é a regra disponível para autorizar o acesso.
  const { modern, vinculo: vinculoAtivo } = await findLoginLink(funcionario.id);
  if (modern && !vinculoAtivo) {
    await registerAuditLog({
      evento: "funcionario_login_invalido",
      nivel: "WARN",
      mensagem: "Tentativa de login de funcionario sem vinculo ativo",
      ipOrigem,
      metadados: { login: login.auditLogin },
    });
    await waitForFailedLoginDelay();
    throw new UnauthorizedError("CPF/email ou senha invalidos");
  }

  if (isFirstAccess(funcionario.primeiro_acesso)) {
    const tokenPrimeiroAcesso = createFirstAccessToken(funcionario.id);

    await registerAuditLog({
      evento: "funcionario_primeiro_acesso_validado",
      funcionarioId: funcionario.id,
      mensagem: "Senha temporaria validada; troca de senha obrigatoria",
      ipOrigem,
      metadados: { login: login.auditLogin },
    });

    return {
      primeiro_acesso: true,
      token_primeiro_acesso: tokenPrimeiroAcesso,
      expiresIn: env.FIRST_ACCESS_TOKEN_EXPIRES_IN,
      funcionario: mapFuncionario(funcionario),
    };
  }

  await updateLastLogin(funcionario.id, modern);

  const tokenPayload = {
    sub: String(funcionario.id),
    role: "funcionario",
    credentialVersion: buildCredentialVersion(funcionario),
  };
  const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
    expiresIn: env.FUNCIONARIO_JWT_EXPIRES_IN,
  });

  await registerAuditLog({
    evento: "funcionario_login_sucesso",
    funcionarioId: funcionario.id,
    mensagem: "Login de funcionario realizado com CPF/email e senha",
    ipOrigem,
    metadados: { login: login.auditLogin },
  });

  return {
    token,
    expiresIn: env.FUNCIONARIO_JWT_EXPIRES_IN,
    primeiro_acesso: false,
    funcionario: mapFuncionario(funcionario),
  };
}

async function registerPunch(
  { funcionarioId, latitude, longitude, accuracy, timestamp, chaveIdempotencia },
  { ipOrigem, userAgent } = {}
) {
  // O Spring calcula o hash sobre estes bytes para preservar o replay legado.
  const reading = accuracy === undefined && timestamp === undefined
    ? [latitude, longitude] : [latitude, longitude, accuracy, timestamp];
  const result = await requestPunch("registrar", {
    funcionario_id: Number(funcionarioId), chave_idempotencia: chaveIdempotencia,
    leitura_json: JSON.stringify(reading),
  }, (result) => {
    const { replayed, response: { ponto, funcionario } } = result;
    const { id, sequencia, tipo, registrado_em, distancia_metros } = ponto;
    if (typeof replayed !== "boolean" || !(id === null || (Number.isInteger(id) && id > 0))
        || !Number.isInteger(sequencia) || sequencia < 1 || sequencia > 4
        || tipo !== PUNCH_TYPES[sequencia - 1] || typeof registrado_em !== "string"
        || !Number.isFinite(distancia_metros) || distancia_metros < 0
        || funcionario.id !== Number(funcionarioId) || typeof funcionario.nome !== "string"
        || !(funcionario.email === null || typeof funcionario.email === "string")
        || typeof funcionario.cpf !== "string" || !/^\*{3}\.\*{3}\.\*{3}-(?:\d{2}|\*{2})$/.test(funcionario.cpf)) throw unavailable();
    return { replayed, response: {
      ponto: { id, sequencia, tipo, registrado_em, distancia_metros },
      funcionario: { id: funcionario.id, nome: funcionario.nome, email: funcionario.email, cpf: funcionario.cpf },
    } };
  });
  if (result.replayed) return result.response;
  const punch = result.response;
  await registerAuditLog({
    evento: "batida_ponto_realizada", funcionarioId: punch.funcionario.id,
    mensagem: "Batida de ponto registrada com sucesso", ipOrigem,
    metadados: {
      sequencia: punch.ponto.sequencia, tipo: punch.ponto.tipo,
      distancia_metros: punch.ponto.distancia_metros, latitude, longitude, user_agent: userAgent,
    },
  });
  return punch;
}

module.exports = {
  getPunchHistory,
  getTodayPunch,
  loginFuncionario,
  registerPunch,
};
