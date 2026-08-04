"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");
const pointModel = require("../models/pointModel");
const { isWithinRadius } = require("../utils/location");
const { isValidCpf, maskCpf, normalizeCpf } = require("../utils/cpf");
const {
  EMPTY_PUNCH_TIME,
  PUNCH_TYPES,
  readPunchTimesFromRow,
  resolveNextPunch,
} = require("../utils/punch");
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");

/**
 * Usa o fuso da escola para separar dias de ponto, independente do fuso do servidor.
 */
function getSaoPauloDateTime(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(referenceDate);
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}:${map.second}`,
    dateTime: `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`,
  };
}

/**
 * Valida se o funcionario esta dentro do raio permitido antes de abrir a transacao.
 */
function validateLocation(latitude, longitude) {
  const distanceCheck = isWithinRadius(
    { latitude: env.SCHOOL_LATITUDE, longitude: env.SCHOOL_LONGITUDE },
    { latitude, longitude },
    env.ALLOWED_RADIUS_METERS
  );

  if (!distanceCheck.distanceMeters && distanceCheck.distanceMeters !== 0) {
    throw new BadRequestError("Localizacao invalida para registro de ponto");
  }

  if (!distanceCheck.isWithin) {
    throw new ForbiddenError(
      "Voce so pode bater ponto dentro da area permitida da escola."
    );
  }

  return distanceCheck;
}

function mapFuncionario(funcionario) {
  return {
    id: funcionario.id,
    nome: funcionario.nome,
    email: funcionario.email,
    cpf: maskCpf(funcionario.cpf),
  };
}

const TODAY_PUNCH_TYPE_MAP = Object.freeze({
  ENTRADA: "ENTRADA",
  SAIDA_ALMOCO: "SAIDA_ALMOCO",
  VOLTA_ALMOCO: "RETORNO_ALMOCO",
  SAIDA: "SAIDA",
});

function mapTimeOrNull(value) {
  const normalized = String(value || "").trim().slice(0, 8);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }
  return normalized === EMPTY_PUNCH_TIME ? null : normalized;
}

function mapRequiredScheduleTime(value) {
  const normalized = String(value || "").trim().slice(0, 8);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    throw new Error("Jornada do funcionario incompleta");
  }
  return normalized;
}

/**
 * Retorna o estado autoritativo da jornada do funcionario autenticado no dia atual.
 */
async function getTodayPunch(funcionarioId, referenceDate = new Date()) {
  const safeFuncionarioId = Number(funcionarioId);
  if (!Number.isInteger(safeFuncionarioId) || safeFuncionarioId < 1) {
    throw new UnauthorizedError("Sessao do funcionario invalida");
  }

  const funcionario = await employeeModel.findForPunchDashboardById(
    safeFuncionarioId
  );
  if (!funcionario) {
    throw new NotFoundError("Funcionario nao encontrado");
  }
  if (!funcionario.ativo) {
    throw new ForbiddenError("Funcionario inativo");
  }

  const { date } = getSaoPauloDateTime(referenceDate);
  const pointRow = await pointModel.findByEmployeeAndDate(
    safeFuncionarioId,
    date
  );
  const punchTimes = readPunchTimesFromRow(pointRow || {});
  const nextPunch = resolveNextPunch(punchTimes);

  return {
    funcionario: {
      nome: funcionario.nome,
      cargo: funcionario.cargo,
    },
    jornada: {
      entrada: mapRequiredScheduleTime(funcionario.entrada),
      saida_almoco: mapRequiredScheduleTime(funcionario.saida_almoco),
      retorno_almoco: mapRequiredScheduleTime(funcionario.retorno_almoco),
      saida: mapRequiredScheduleTime(funcionario.saida),
    },
    ponto: {
      data_referencia: date,
      entrada: mapTimeOrNull(punchTimes.entrada),
      saida_almoco: mapTimeOrNull(punchTimes.saidaAlmoco),
      retorno_almoco: mapTimeOrNull(punchTimes.voltaAlmoco),
      saida: mapTimeOrNull(punchTimes.saida),
    },
    proxima_batida: nextPunch
      ? TODAY_PUNCH_TYPE_MAP[nextPunch.type]
      : null,
    jornada_concluida: nextPunch === null,
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_PASSWORD_HASH = bcrypt.hashSync(
  "invalid-login-credential",
  env.BCRYPT_SALT_ROUNDS
);

// A espera e aplicada no servidor (e nao apenas na tela) para que scripts e
// bots tambem sejam desacelerados apos uma credencial invalida.
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
    // CPF mascarado no log de auditoria para nao expor o dado completo,
    // mesmo em tentativas de login invalidas.
    auditLogin: email || maskCpf(cpf),
  };
}

async function findFuncionarioForLogin({ cpf, email }) {
  if (email) {
    return employeeModel.findForPunchLoginByEmail(email);
  }

  return employeeModel.findForPunchLoginByCpf(cpf);
}

/**
 * Autentica funcionario pelo fluxo proprio, separado do login administrativo Gov.br.
 */
async function loginFuncionario(body, { ipOrigem } = {}) {
  const login = resolveLogin(body);
  const funcionario = await findFuncionarioForLogin(login);
  const senhaCorreta = await bcrypt.compare(
    login.senha,
    String(funcionario?.senha_hash || INVALID_PASSWORD_HASH)
  );

  // Falha de credenciais (usuario inexistente ou senha errada) sempre retorna
  // a mesma mensagem generica, para nao revelar qual condicao falhou.
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

  await loginModel.updateLastLogin(funcionario.id);

  const tokenPayload = {
    sub: String(funcionario.id),
    role: "funcionario",
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
    primeiro_acesso: Boolean(funcionario.primeiro_acesso),
    funcionario: mapFuncionario(funcionario),
  };
}

/**
 * O service escolhe a proxima batida para manter a sequencia fora do controller.
 */
async function registerPunch(
  { funcionarioId, latitude, longitude },
  { ipOrigem, userAgent } = {}
) {
  const safeLatitude = Number(latitude);
  const safeLongitude = Number(longitude);

  if (!Number.isFinite(safeLatitude) || !Number.isFinite(safeLongitude)) {
    throw new BadRequestError("Localizacao invalida para registro de ponto");
  }

  const distanceCheck = validateLocation(safeLatitude, safeLongitude);
  const { date, time, dateTime } = getSaoPauloDateTime(new Date());

  try {
    // Toda a leitura+decisao+escrita da batida roda em uma transacao com
    // FOR UPDATE na linha do funcionario e na linha do dia, para evitar que
    // duas batidas quase simultaneas do mesmo funcionario gerem uma condicao
    // de corrida (ex: duas "entradas" no mesmo dia).
    const punch = await pointModel.withTransaction(async (tx) => {
      // Bloqueios no funcionario e no dia evitam duas batidas concorrentes na mesma sequencia.
      const funcionario = await employeeModel.findForPunchRegisterByIdForUpdate(
        tx,
        funcionarioId
      );

      if (!funcionario) {
        throw new NotFoundError("Funcionario nao encontrado");
      }

      if (!funcionario.ativo) {
        throw new ForbiddenError("Funcionario inativo");
      }

      const existingRow = await pointModel.findByEmployeeAndDateForUpdate(
        tx,
        funcionario.id,
        date
      );

      let rowId = {};
      let sequence = 1;
      let type = PUNCH_TYPES[0];

      if (!existingRow) {
        // Primeira batida do dia para este funcionario: cria a linha do dia
        // com a "entrada" preenchida e os demais horarios vazios.
        const insertResult = await pointModel.createFirstPunch(tx, {
          funcionarioId: funcionario.id,
          date,
          time,
          emptyTime: EMPTY_PUNCH_TIME,
        });
        rowId = Number(insertResult.insertId);
      } else {
        const times = readPunchTimesFromRow(existingRow);
        const nextPunch = resolveNextPunch(times);

        // resolveNextPunch retorna {} quando as 4 batidas do dia ja foram
        // registradas, impedindo uma quinta batida no mesmo dia.
        if (!nextPunch) {
          throw new ConflictError("Funcionario ja realizou 4 batidas hoje");
        }

        sequence = nextPunch.sequence;
        type = nextPunch.type;
        times[nextPunch.field] = time;

        // Regrava a linha do dia inteira com o novo horario preenchido
        // (ver observacao sobre replacePunchRow no repository de pointModel).
        await pointModel.replacePunchRow(tx, {
          rowId: existingRow.id,
          funcionarioId: funcionario.id,
          date,
          times,
        });
        rowId = Number(existingRow.id);
      }

      return {
        id: rowId,
        funcionario,
        sequence,
        type,
        registeredAt: dateTime,
        distanceMeters: distanceCheck.distanceMeters,
      };
    });

    await registerAuditLog({
      evento: "batida_ponto_realizada",
      funcionarioId: punch.funcionario.id,
      mensagem: "Batida de ponto registrada com sucesso",
      ipOrigem,
      metadados: {
        sequencia: punch.sequence,
        tipo: punch.type,
        distancia_metros: punch.distanceMeters,
        latitude: safeLatitude,
        longitude: safeLongitude,
        user_agent: userAgent,
      },
    });

    return {
      ponto: {
        id: punch.id,
        sequencia: punch.sequence,
        tipo: punch.type,
        registrado_em: punch.registeredAt,
        distancia_metros: punch.distanceMeters,
      },
      funcionario: mapFuncionario(punch.funcionario),
    };
  } catch (error) {
    // Rede de seguranca contra condicao de corrida que escape do lock FOR UPDATE
    // (ex: race entre criar a linha do dia pela primeira vez), convertendo o erro
    // de constraint do banco em uma mensagem de negocio amigavel.
    if (error.code === "ER_DUP_ENTRY") {
      throw new ConflictError("Registro duplicado de ponto detectado");
    }
    throw error;
  }
}

module.exports = {
  getTodayPunch,
  loginFuncionario,
  registerPunch,
};
