"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const employeeModel = require("../models/employeeModel");
const pointModel = require("../models/pointModel");
const { isWithinRadius } = require("../utils/location");
const { maskCpf, normalizeCpf } = require("../utils/cpf");
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

// Usa "sv-SE" apenas pelo formato de saida (ISO-like, ano-mes-dia), fixando o
// fuso de Sao Paulo independente de onde o servidor roda, para que a data/hora
// do ponto reflita sempre o horario local da escola.
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

// Regra de negocio central do ponto por geolocalizacao: a batida so e aceita
// se a localizacao enviada estiver dentro do raio permitido a partir das
// coordenadas da escola (ambos configuraveis via env).
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

// Login flexivel: aceita CPF ou email digitados no mesmo campo "login", ou
// enviados separadamente (compatibilidade com diferentes formatos de payload).
// A deteccao de email e feita pela presenca de "@" no valor informado.
function resolveLogin(body = {}) {
  const rawLogin = String(body.login || body.email || body.cpf || "").trim();
  const cpf = normalizeCpf(rawLogin || body.cpf);
  const email = rawLogin.includes("@") ? rawLogin.toLowerCase() : "";
  const senha = String(body.senha || "");

  if (!rawLogin) {
    throw new BadRequestError("Informe CPF ou email");
  }

  return {
    rawLogin,
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

async function loginFuncionario(body, { ipOrigem } = {}) {
  const login = resolveLogin(body);
  const funcionario = await findFuncionarioForLogin(login);
  const senhaCorreta = funcionario
    ? await bcrypt.compare(login.senha, String(funcionario.senha || ""))
    : false;

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
    throw new UnauthorizedError("CPF/email ou senha invalidos");
  }

  // Checagem de "ativo" so ocorre apos validar a senha, evitando que um
  // atacante descubra (por diferenca de erro) quais contas existem mas estao
  // inativas.
  if (!funcionario.ativo) {
    throw new ForbiddenError("Funcionario inativo");
  }

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
    funcionario: mapFuncionario(funcionario),
  };
}

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
  loginFuncionario,
  registerPunch,
};