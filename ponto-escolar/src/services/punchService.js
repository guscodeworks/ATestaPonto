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

// Fuso da escola p/ separar dias de ponto, independente do fuso do servidor.
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

// Geolocalização da unidade do vínculo ativo (fail-fast, fora da transação).
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

// Agrupa batidas do mês por data_referencia → shape diário p/ o cliente.
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

// Registros mensais do funcionário identificado pelo JWT.
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

  // 1 linha por batida → agrupa por data_referencia p/ reconstruir o dia.
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

// Estado autoritativo da jornada do funcionário autenticado no dia atual.
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

  // Jornada vem do vínculo ativo (via LATERAL/LEFT JOIN). Sem vínculo ativo o
  // funcionário existe mas lv.* vem NULL → sinaliza "sem vínculo ativo"
  // (consistente com registerPunch), não "não encontrado".
  if (
    !funcionario.entrada ||
    !funcionario.saida_almoco ||
    !funcionario.retorno_almoco ||
    !funcionario.saida ||
    !funcionario.cargo
  ) {
    throw new NotFoundError("Funcionario sem vinculo ativo");
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
    proxima_batida: nextPunch ? nextPunch.type : null,
    jornada_concluida: nextPunch === null,
  };
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

// Autenticação própria do funcionário (separada do login admin Gov.br).
async function loginFuncionario(body, { ipOrigem } = {}) {
  const login = resolveLogin(body);
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

  // A senha foi comprovada, mas primeiro_acesso permanece uma decisao do
  // banco. Neste caso nao emitimos JWT de funcionario; apenas uma credencial
  // curta, com escopo exclusivo para a troca obrigatoria de senha.
  if (funcionario.primeiro_acesso) {
    const tokenTrocaSenha = jwt.sign(
      {
        sub: String(funcionario.id),
        role: "funcionario",
        purpose: "troca_senha_primeiro_acesso",
      },
      env.JWT_SECRET,
      { expiresIn: env.FUNCIONARIO_JWT_EXPIRES_IN }
    );

    await registerAuditLog({
      evento: "funcionario_troca_senha_obrigatoria",
      funcionarioId: funcionario.id,
      mensagem: "Login inicial requer troca obrigatoria de senha",
      ipOrigem,
      metadados: { login: login.auditLogin },
    });

    return {
      troca_senha_obrigatoria: true,
      token_troca_senha: tokenTrocaSenha,
      expiresIn: env.FUNCIONARIO_JWT_EXPIRES_IN,
      funcionario: mapFuncionario(funcionario),
    };
  }

  // Jornada/permissão de bater ponto vem do vínculo ativo. Funcionário ativo sem
  // vínculo não tem jornada nem geolocalização: rejeita aqui p/ não emitir um
  // token que só falharia tardiamente no ponto/dashboard. ANTES de gravar
  // ultimo_login_em (não marca sessão inválida como login bem-sucedido).
  const vinculoAtivo = await vinculoModel.findActiveByFuncionarioId(
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
    primeiro_acesso: false,
    funcionario: mapFuncionario(funcionario),
  };
}

async function changeFirstAccessPassword(funcionarioId, novaSenha, { ipOrigem } = {}) {
  const safeFuncionarioId = Number(funcionarioId);
  const senha = String(novaSenha || "");
  if (!Number.isInteger(safeFuncionarioId) || safeFuncionarioId < 1) {
    throw new UnauthorizedError("Credencial para troca de senha invalida");
  }
  if (senha.length < 8 || senha.length > 72) {
    throw new BadRequestError("Nova senha deve ter entre 8 e 72 caracteres");
  }

  await employeeModel.withTransaction(async (tx) => {
    const login = await loginModel.findFirstAccessByFuncionarioIdForUpdate(
      tx,
      safeFuncionarioId
    );
    if (!login || !login.ativo) {
      throw new UnauthorizedError("Funcionario inexistente ou inativo");
    }
    if (!login.primeiro_acesso) {
      throw new ForbiddenError("Troca obrigatoria de senha nao esta pendente");
    }
    if (await bcrypt.compare(senha, String(login.senha_hash))) {
      throw new BadRequestError("A nova senha deve ser diferente da senha temporaria");
    }

    const senhaHash = await bcrypt.hash(senha, env.BCRYPT_SALT_ROUNDS);
    const result = await loginModel.updateSenha(tx, safeFuncionarioId, senhaHash);
    if (!result.affectedRows) {
      throw new Error("Falha ao atualizar senha do funcionario");
    }
  });

  await registerAuditLog({
    evento: "funcionario_senha_inicial_alterada",
    funcionarioId: safeFuncionarioId,
    mensagem: "Senha temporaria de funcionario substituida",
    ipOrigem,
  });

  return {
    senha_alterada: true,
    primeiro_acesso: false,
  };
}

// Mantém a sequência de batidas no service (fora do controller).
async function registerPunch(
  { funcionarioId, latitude, longitude },
  { ipOrigem, userAgent } = {}
) {
  const safeLatitude = Number(latitude);
  const safeLongitude = Number(longitude);

  if (!Number.isFinite(safeLatitude) || !Number.isFinite(safeLongitude)) {
    throw new BadRequestError("Localizacao invalida para registro de ponto");
  }

  // Geolocalização por unidade (via vínculo), fail-fast antes da transação:
  // fora da área nem abre a tx.
  const { vinculoId, geolocation } =
    await resolveUnidadeGeolocation(funcionarioId);
  const distanceCheck = validateDistanceAgainst(
    geolocation,
    safeLatitude,
    safeLongitude
  );
  const { date, time, dateTime } = getSaoPauloDateTime(new Date());

  try {
    // Leitura+decisão+escrita da batida numa transação com FOR UPDATE no vínculo
    // ativo e nas batidas do dia, p/ evitar corrida (ex: duas "entradas" no mesmo
    // dia). Chave de negócio = `vinculo_funcional_id` (não funcionario_id).
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

      // Reconfirma e trava o vínculo DENTRO da tx (o FOR UPDATE aqui evita a
      // corrida; a leitura fora da tx era só fail-fast de geolocation).
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
        // Primeira batida do dia: cria a linha ENTRADA (1 linha/batida; as
        // demais virão pelas próximas batidas via replacePunchRow).
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

        // null = 4 batidas do dia já registradas (impede 5ª batida).
        if (!nextPunch) {
          throw new ConflictError("Funcionario ja realizou 4 batidas hoje");
        }

        sequence = nextPunch.sequence;
        type = nextPunch.type;
        times[nextPunch.field] = time;

        // Persiste como sua própria linha (idempotência via UNIQUE(vinculo, data, tipo)).
        await pointModel.replacePunchRow(tx, {
          vinculoFuncionalId: vinculo.id,
          date,
          times,
        });

        // Recupera o id da linha recém-gravada p/ a resposta.
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
    // Rede de segurança contra corrida que escape do FOR UPDATE (ex: criar a
    // linha do dia pela primeira vez) → constraint vira msg de negócio amigável.
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
  changeFirstAccessPassword,
  registerPunch,
};
