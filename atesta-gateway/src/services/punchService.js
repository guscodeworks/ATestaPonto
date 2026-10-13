"use strict";

const bcrypt = require("bcrypt");
const { requestSpring } = require("../integrations/springBackendClient");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");
const employmentLinkModel = require("../models/employmentLinkModel");
const { isValidCpf, maskCpf, normalizeCpf } = require("../utils/cpf");
const {
  AppError,
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");
const { buildCredentialVersion } = require("./authService");

function mapFuncionario(funcionario) {
  return {
    id: funcionario.id,
    nome: funcionario.nome,
    email: funcionario.email,
    cpf: maskCpf(funcionario.cpf),
  };
}

async function requestPunch(path, body) {
  let response;
  let result;
  try {
    response = await requestSpring(path, { method: "POST", body });
    result = await response.json();
  } catch (_error) {
    throw new AppError("Servico de ponto indisponivel", {
      statusCode: 502, code: "PUNCH_SERVICE_UNAVAILABLE",
    });
  }
  if (!response.ok) {
    if (typeof result?.code === "string" && typeof result?.message === "string") {
      throw new AppError(result.message, { statusCode: response.status, code: result.code });
    }
    throw new AppError("Servico de ponto indisponivel", {
      statusCode: 502, code: "PUNCH_SERVICE_UNAVAILABLE",
    });
  }
  return result;
}

function getPunchHistory(funcionarioId, rawMonth, referenceDate) {
  return requestPunch("/internal/ponto/historico", {
    funcionario_id: Number(funcionarioId), mes: rawMonth,
    referencia: referenceDate?.toISOString(),
  });
}

function getTodayPunch(funcionarioId, referenceDate) {
  return requestPunch("/internal/ponto/hoje", {
    funcionario_id: Number(funcionarioId), referencia: referenceDate?.toISOString(),
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

async function findFuncionarioForLogin({ cpf, email }) {
  if (email) {
    return employeeModel.findForPunchLoginByEmail(email);
  }

  return employeeModel.findForPunchLoginByCpf(cpf);
}

function isFirstAccess(value) {
  return value === true || value === 1 || value === "1";
}

// Autenticação própria do funcionário (separada do login admin Gov.br).
async function loginFuncionario(
  body,
  { ipOrigem, unidadeEscolarIdQr } = {}
) {
  const login = resolveLogin(body);
  const qrSchoolUnitId =
    unidadeEscolarIdQr === undefined ? null : Number(unidadeEscolarIdQr);

  if (
    qrSchoolUnitId !== null &&
    (!Number.isInteger(qrSchoolUnitId) || qrSchoolUnitId <= 0)
  ) {
    throw new ForbiddenError("Contexto de QR Code invalido");
  }

  const funcionario = await findFuncionarioForLogin(login);
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
  if (await employeeModel.hasModernLoginTable()) {
    const vinculoAtivo = await employmentLinkModel.findActiveByFuncionarioId(
      funcionario.id
    );
    if (!vinculoAtivo) {
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

    if (
      qrSchoolUnitId !== null &&
      Number(vinculoAtivo.unidade_escolar_id) !== qrSchoolUnitId
    ) {
      await registerAuditLog({
        evento: "funcionario_login_qr_unidade_incompativel",
        nivel: "WARN",
        funcionarioId: funcionario.id,
        mensagem: "Tentativa de login com QR Code de outra unidade escolar",
        ipOrigem,
      });
      throw new ForbiddenError(
        "QR Code nao corresponde a unidade escolar do funcionario"
      );
    }
  } else if (qrSchoolUnitId !== null) {
    // Sem vínculo funcional não há como provar a unidade do funcionário.
    throw new ForbiddenError("Contexto de QR Code indisponivel");
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

  await loginModel.updateLastLogin(funcionario.id);

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
  // Preserva os bytes JSON usados no hash legado, inclusive o replay sem GPS A03.
  const reading = accuracy === undefined && timestamp === undefined
    ? [latitude, longitude] : [latitude, longitude, accuracy, timestamp];
  const result = await requestPunch("/internal/ponto/registrar", {
    funcionario_id: Number(funcionarioId),
    chave_idempotencia: chaveIdempotencia,
    leitura_json: JSON.stringify(reading),
  });
  if (result.replayed) return result.response;
  const punch = result.response;
  await registerAuditLog({
    evento: "batida_ponto_realizada",
    funcionarioId: punch.funcionario.id,
    mensagem: "Batida de ponto registrada com sucesso",
    ipOrigem,
    metadados: {
      sequencia: punch.ponto.sequencia,
      tipo: punch.ponto.tipo,
      distancia_metros: punch.ponto.distancia_metros,
      latitude,
      longitude,
      user_agent: userAgent,
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
