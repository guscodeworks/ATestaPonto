"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");
const pointModel = require("../models/pointModel");
const vinculoModel = require("../models/vinculoModel");
const unidadeEscolarModel = require("../models/unidadeEscolarModel");
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
 * Valida se o funcionario esta dentro do raio permitido da SUA unidade escolar
 * antes de abrir a transacao. No novo schema a geolocalizacao (latitude,
 * longitude, raio_permitido_metros) passou a residir por unidade em
 * `unidades_escolares`, lida a partir do vinculo funcional ativo — antes vinha
 * de variaveis de ambiente globais (env.SCHOOL_*), que foram removidas.
 *
 * Roda fora da transacao (fail-fast): se o funcionario estiver fora da area,
 * nem abrimos a transacao de batida. Ja lanca NotFound/Forbidden quando o
 * funcionario nao tem vinculo/unidade cadastrados.
 */
async function resolveUnidadeGeolocation(funcionarioId) {
  const vinculo = await vinculoModel.findActiveByFuncionarioId(funcionarioId);
  if (!vinculo) {
    throw new NotFoundError("Funcionario sem vinculo ativo");
  }

  const geolocation = await unidadeEscolarModel.findGeolocationByVinculo(
    vinculo.id
  );
  if (!geolocation) {
    throw new NotFoundError("Unidade escolar do vinculo nao encontrada");
  }

  return { vinculoId: vinculo.id, geolocation };
}

function validateDistanceAgainst(geolocation, latitude, longitude) {
  const distanceCheck = isWithinRadius(
    { latitude: geolocation.latitude, longitude: geolocation.longitude },
    { latitude, longitude },
    geolocation.raio_permitido_metros
  );

  if (
    !distanceCheck.distanceMeters &&
    distanceCheck.distanceMeters !== 0
  ) {
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

const HISTORY_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function resolveHistoryPeriod(rawMonth, referenceDate = new Date()) {
  const currentMonth = getSaoPauloDateTime(referenceDate).date.slice(0, 7);
  const month = rawMonth === undefined ? currentMonth : rawMonth;

  if (typeof month !== "string") {
    throw new BadRequestError("mes deve usar o formato YYYY-MM");
  }

  const match = HISTORY_MONTH_PATTERN.exec(month);
  if (!match) {
    throw new BadRequestError("mes deve usar o formato YYYY-MM");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1000 || year > 9999) {
    throw new BadRequestError("mes deve conter um ano valido");
  }

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month,
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function mapDateReference(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  throw new Error("Data de referencia invalida no historico de ponto");
}

function timeToSeconds(value) {
  if (!value) {
    return null;
  }

  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

// NOVO SCHEMA: o historico mensal agora e um array de batidas (1 linha por
// batida, coluna `tipo` + `registrado_em`), ordenadas por data e tipo. Para
// montar o dia-agregado que o cliente ja consome, agrupamos as batidas por
// data_referencia e puxamos cada horario pelo seu tipo.
function mapHistoryDay(date, punches) {
  const times = readPunchTimesFromRow(punches);
  const entrada = mapTimeOrNull(times.entrada);
  const saidaAlmoco = mapTimeOrNull(times.saidaAlmoco);
  const retornoAlmoco = mapTimeOrNull(times.voltaAlmoco);
  const saida = mapTimeOrNull(times.saida);
  const seconds = [entrada, saidaAlmoco, retornoAlmoco, saida].map(
    timeToSeconds
  );
  const isComplete =
    seconds.every(Number.isFinite) &&
    seconds[0] < seconds[1] &&
    seconds[1] < seconds[2] &&
    seconds[2] < seconds[3];
  const totalSeconds = isComplete
    ? seconds[1] - seconds[0] + (seconds[3] - seconds[2])
    : null;

  return {
    data_referencia: mapDateReference(date),
    entrada,
    saida_almoco: saidaAlmoco,
    retorno_almoco: retornoAlmoco,
    saida,
    total_minutos: isComplete ? Math.floor(totalSeconds / 60) : null,
    status: isComplete ? "COMPLETO" : "INCOMPLETO",
  };
}

/**
 * Retorna apenas os registros mensais do funcionario identificado pelo JWT.
 */
async function getPunchHistory(funcionarioId, rawMonth, referenceDate = new Date()) {
  const safeFuncionarioId = Number(funcionarioId);
  if (!Number.isInteger(safeFuncionarioId) || safeFuncionarioId < 1) {
    throw new UnauthorizedError("Sessao do funcionario invalida");
  }

  const { vinculoId } = await resolveUnidadeGeolocation(safeFuncionarioId);
  const period = resolveHistoryPeriod(rawMonth, referenceDate);
  const rows = await pointModel.listByEmployeeAndDateRange(
    vinculoId,
    period.startDate,
    period.endDate
  );

  // Agrupa as batidas (1 linha por batida) por data_referencia para reconstruir
  // o dia e entao mapear no formato agregado que o cliente consome.
  const byDate = new Map();
  for (const row of rows) {
    const key = mapDateReference(row.data_referencia);
    if (!byDate.has(key)) {
      byDate.set(key, []);
    }
    byDate.get(key).push(row);
  }
  const records = Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, punches]) => mapHistoryDay(date, punches));
  const completeRecords = records.filter(
    (record) => record.status === "COMPLETO"
  );

  return {
    periodo: period.month,
    resumo: {
      dias_com_registro: records.length,
      jornadas_completas: completeRecords.length,
      jornadas_incompletas: records.length - completeRecords.length,
      total_minutos: completeRecords.reduce(
        (total, record) => total + record.total_minutos,
        0
      ),
    },
    registros: records,
  };
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

  // A jornada vem do vinculo ativo (resolvido via LATERAL em
  // findForPunchDashboardById). Sem vinculo ativo nao ha jornada nem batida
  // possivel: sinalizamos de forma amigavel em vez de estourar.
  if (
    !funcionario.entrada ||
    !funcionario.saida_almoco ||
    !funcionario.retorno_almoco ||
    !funcionario.saida
  ) {
    throw new ConflictError("Funcionario sem jornada ativa configurada");
  }

  const { vinculoId } = await resolveUnidadeGeolocation(safeFuncionarioId);
  const { date } = getSaoPauloDateTime(referenceDate);
  const punchRows = await pointModel.findByEmployeeAndDate(vinculoId, date);
  const punchTimes = readPunchTimesFromRow(punchRows);
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

  // Geolocalizacao agora por unidade (via vinculo), fail-fast antes da
  // transacao: se o funcionario estiver fora da area, nem abrimos a tx.
  const { vinculoId, geolocation } =
    await resolveUnidadeGeolocation(funcionarioId);
  const distanceCheck = validateDistanceAgainst(
    geolocation,
    safeLatitude,
    safeLongitude
  );
  const { date, time, dateTime } = getSaoPauloDateTime(new Date());

  try {
    // Toda a leitura+decisao+escrita da batida roda em uma transacao com
    // FOR UPDATE no vinculo ativo e nas batidas do dia, para evitar que
    // duas batidas quase simultaneas do mesmo funcionario gerem uma condicao
    // de corrida (ex: duas "entradas" no mesmo dia). No novo schema a chave de
    // negocio e `vinculo_funcional_id` (nao mais funcionario_id direto).
    const punch = await pointModel.withTransaction(async (tx) => {
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

      // Reconfirma e trava o vinculo ativo DENTRO da transacao (o FOR UPDATE
      // aqui e o que evita a corrida entre duas batidas concorrentes do mesmo
      // funcionario — a leitura fora da tx era so para fail-fast de geolocation).
      const vinculo = await vinculoModel.findActiveByFuncionarioIdForUpdate(
        tx,
        funcionarioId
      );
      if (!vinculo) {
        throw new NotFoundError("Funcionario sem vinculo ativo");
      }

      const existingPunches = await pointModel.findByEmployeeAndDateForUpdate(
        tx,
        vinculo.id,
        date
      );

      let rowId = null;
      let sequence = 1;
      let type = PUNCH_TYPES[0];

      if (existingPunches.length === 0) {
        // Primeira batida do dia: cria a linha ENTRADA (1 linha por batida no
        // novo schema; as demais virao pelas proximas batidas via replacePunchRow).
        const insertResult = await pointModel.createFirstPunch(tx, {
          vinculoFuncionalId: vinculo.id,
          date,
          time,
          emptyTime: EMPTY_PUNCH_TIME,
        });
        rowId = Number(insertResult.insertId);
      } else {
        const times = readPunchTimesFromRow(existingPunches);
        const nextPunch = resolveNextPunch(times);

        // resolveNextPunch retorna null quando as 4 batidas do dia ja foram
        // registradas, impedindo uma quinta batida no mesmo dia.
        if (!nextPunch) {
          throw new ConflictError("Funcionario ja realizou 4 batidas hoje");
        }

        sequence = nextPunch.sequence;
        type = nextPunch.type;
        times[nextPunch.field] = time;

        // Persiste a batida como sua propria linha (INSERT ... ON DUPLICATE
        // KEY UPDATE resolve a idempotencia via UNIQUE(vinculo, data, tipo)).
        await pointModel.replacePunchRow(tx, {
          vinculoFuncionalId: vinculo.id,
          date,
          times,
        });

        // Localiza o id da linha recem-gravada para a resposta.
        const updated = await pointModel.findByEmployeeAndDateForUpdate(
          tx,
          vinculo.id,
          date
        );
        const matched = (updated || []).find((row) => row.tipo === type);
        rowId = matched ? Number(matched.id) : null;
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
  getPunchHistory,
  getTodayPunch,
  loginFuncionario,
  registerPunch,
};
