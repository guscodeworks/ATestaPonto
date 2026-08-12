"use strict";

const bcrypt = require("bcrypt");
const { randomBytes } = require("node:crypto");
const env = require("../config/env");
const { logger } = require("../utils/logger");
const { formatCpf, maskCpf } = require("../utils/cpf");
const {
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require("../utils/errors");
const { registerAuditLog } = require("./auditLogService");
const employeeModel = require("../models/employeeModel");
const loginModel = require("../models/loginModel");
const cargoModel = require("../models/cargoModel");
const vinculoModel = require("../models/vinculoModel");
const unidadeEscolarModel = require("../models/unidadeEscolarModel");
const { sendEmployeeWelcomeEmail } = require("./emailService");

const CARGO_TYPES = new Set(["FUNCIONARIO", "INSPETOR", "PROFESSOR"]);

// Edição aceita o mesmo conjunto do cadastro (inclui PROFESSOR). Antes o filtro
// extra impedia editar a jornada de um PROFESSOR já cadastrado.
const EDITABLE_CARGO_TYPES = CARGO_TYPES;
const EDITABLE_EMPLOYEE_FIELDS = new Set([
  "nome",
  "email",
  "telefone",
  "cargo",
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida",
]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

// CPF sempre mascarado ao sair da API, evitando expor o dado completo em
// respostas/listagens (o valor completo só é usado internamente para lógica).
function mapEmployee(employee) {
  return {
    id: employee.id,
    cpf: maskCpf(employee.cpf),
    nome: employee.nome,
    email: employee.email,
    telefone: employee.telefone || null,
    ativo: Boolean(employee.ativo),
    criado_em: employee.criado_em,
    primeiro_acesso: Boolean(employee.primeiro_acesso),
    cargo_id: employee.cargo_id ? Number(employee.cargo_id) : null,
    cargo_nome: employee.cargo_nome ? String(employee.cargo_nome) : null,
  };
}

function mapListedEmployee(employee) {
  return {
    id: Number(employee.id),
    nome: employee.nome,
    cpf: maskCpf(employee.cpf),
    email: employee.email,
    telefone: employee.telefone || null,
    ativo: Boolean(employee.ativo),
    desativado_em: employee.desativado_em || null,
    criado_em: employee.criado_em,
    cargo_id: employee.cargo_id ? Number(employee.cargo_id) : null,
    cargo: employee.cargo ? String(employee.cargo) : null,
    entrada: employee.entrada ? String(employee.entrada) : null,
    saida_almoco: employee.saida_almoco ? String(employee.saida_almoco) : null,
    retorno_almoco: employee.retorno_almoco ? String(employee.retorno_almoco) : null,
    saida: employee.saida ? String(employee.saida) : null,
  };
}

function mapEditableEmployee(employee) {
  return {
    id: Number(employee.id),
    nome: employee.nome,
    cpf: formatCpf(employee.cpf),
    email: employee.email,
    telefone: employee.telefone || null,
    cargo: employee.cargo ? String(employee.cargo) : null,
    entrada: employee.entrada ? String(employee.entrada) : null,
    saida_almoco: employee.saida_almoco ? String(employee.saida_almoco) : null,
    retorno_almoco: employee.retorno_almoco ? String(employee.retorno_almoco) : null,
    saida: employee.saida ? String(employee.saida) : null,
  };
}

function normalizeActiveFilter(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value === true || value === 1 || value === "true" || value === "1";
}

function readCargoSchedule(body = {}) {
  const fieldNames = [
    "cargo",
    "entrada",
    "saida_almoco",
    "retorno_almoco",
    "saida",
  ];
  const hasAnyScheduleField = fieldNames.some(
    (field) => body[field] !== undefined
  );

  if (!hasAnyScheduleField) {
    throw new BadRequestError("cargo e horarios sao obrigatorios");
  }

  const cargo = String(body.cargo || "").trim().toUpperCase();
  const times = {
    entrada: String(body.entrada || "").trim(),
    saidaAlmoco: String(body.saida_almoco || "").trim(),
    retornoAlmoco: String(body.retorno_almoco || "").trim(),
    saida: String(body.saida || "").trim(),
  };

  if (!CARGO_TYPES.has(cargo)) {
    throw new BadRequestError("cargo invalido");
  }

  if (Object.values(times).some((time) => !TIME_PATTERN.test(time))) {
    throw new BadRequestError("Horarios do cargo invalidos");
  }

  const timeToSeconds = (time) => {
    const [hours, minutes, seconds = "0"] = time.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  };
  const orderedTimes = [
    times.entrada,
    times.saidaAlmoco,
    times.retornoAlmoco,
    times.saida,
  ].map(timeToSeconds);
  if (
    !orderedTimes.every(
      (time, index) => index === 0 || orderedTimes[index - 1] < time
    )
  ) {
    throw new BadRequestError(
      "Horarios devem seguir entrada < saida_almoco < retorno_almoco < saida"
    );
  }

  return {
    cargo,
    entrada: times.entrada.length === 5 ? `${times.entrada}:00` : times.entrada,
    saidaAlmoco:
      times.saidaAlmoco.length === 5
        ? `${times.saidaAlmoco}:00`
        : times.saidaAlmoco,
    retornoAlmoco:
      times.retornoAlmoco.length === 5
        ? `${times.retornoAlmoco}:00`
        : times.retornoAlmoco,
    saida: times.saida.length === 5 ? `${times.saida}:00` : times.saida,
  };
}

function generateTemporaryPassword() {
  return randomBytes(18).toString("base64url");
}

/**
 * Normaliza a unidade escolar informada no cadastro. No novo schema é
 * obrigatória (o vínculo funcional exige uma unidade, e a geolocalização do
 * ponto passa a vir dela), então ausência/nulo são rejeitados aqui. A
 * existência da unidade é confirmada no fluxo de transação (consulta ao
 * model), não nesta normalização.
 */
function normalizeUnidadeEscolarId(value) {
  if (value === undefined || value === null || value === "") {
    throw new BadRequestError("unidade_escolar_id e obrigatorio");
  }

  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new BadRequestError("unidade_escolar_id invalido");
  }

  return id;
}

/**
 * Resolve o id de um cargo pelo nome, criando-o se ainda não existir. No novo
 * schema `cargo` é UNIQUE e compartilhada entre funcionários, então o
 * cadastro/edição reutiliza o row existente em vez de criar um por funcionário.
 * Roda dentro da transação (mesmo client) e trava o row com FOR UPDATE para
 * que dois cadastros concorrentes do mesmo cargo sejam determinísticos.
 */
async function findOrCreateCargo(client, cargo) {
  const existing = await cargoModel.findByNomeForUpdate(client, cargo);
  if (existing) {
    return Number(existing.id);
  }

  const insert = await cargoModel.createCargo(client, { cargo });
  const cargoId = Number(insert.insertId);
  if (!Number.isInteger(cargoId) || cargoId < 1) {
    throw new Error("Falha ao obter o ID do cargo criado");
  }
  return cargoId;
}

/**
 * Cria funcionario e login juntos para evitar credencial sem cadastro ativo.
 */
async function createEmployee(body, { adminId, ipOrigem } = {}) {
  const nome = String(body.nome || "").trim();
  const cpf = String(body.cpf || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const telefone = String(body.telefone || "").replace(/\D/g, "") || null;
  const ativo = body.ativo === undefined ? true : Boolean(body.ativo);
  const cargoSchedule = readCargoSchedule(body);
  if (Object.prototype.hasOwnProperty.call(body, "cargo_id")) {
    throw new BadRequestError("cargo_id nao e aceito no cadastro de funcionario");
  }
  const unidadeEscolarId = normalizeUnidadeEscolarId(body.unidade_escolar_id);
  const senhaTemporaria = generateTemporaryPassword();
  const senhaHash = await bcrypt.hash(
    senhaTemporaria,
    env.BCRYPT_SALT_ROUNDS
  );

  // A transacao cobre duplicidade, cargo, login e funcionario como uma unica regra.
  const createdIds = await employeeModel.withTransaction(async (tx) => {
    const cpfExists = await employeeModel.findByCpfForUpdate(tx, cpf);
    if (cpfExists?.id) {
      throw new ConflictError("CPF ja cadastrado");
    }

    const emailExists = await employeeModel.findByEmailForUpdate(tx, email);
    if (emailExists?.id) {
      throw new ConflictError("Email ja cadastrado");
    }

    // unidade agora obrigatoria: confirma sua existencia antes de criar o
    // funcionario, para falhar cedo com mensagem de negocio em vez de estourar
    // a FK no INSERT do vinculo.
    const unidade = await unidadeEscolarModel.findByIdForUpdate(
      tx,
      unidadeEscolarId
    );
    if (!unidade) {
      throw new NotFoundError("Unidade escolar nao encontrada");
    }

    // cargo e UNIQUE/compartilhada: reutiliza o row existente ou cria um novo.
    const cargoId = await findOrCreateCargo(tx, cargoSchedule.cargo);

    const result = await employeeModel.createEmployee(tx, {
      cpf,
      nome,
      email,
      telefone,
      ativo,
      cargoId,
    });
    const funcionarioId = Number(result.insertId);
    if (!Number.isInteger(funcionarioId) || funcionarioId < 1) {
      throw new Error("Falha ao obter o ID do funcionario criado");
    }

    await loginModel.createLogin(tx, { funcionarioId, senhaHash });
    // Cria o vínculo funcional na mesma transação, reutilizando o cargoId e
    // os horários já validados em cargoSchedule (sem novas consultas). Se
    // falhar, o rollback da transação desfaz funcionário, login e cargo
    // conjuntamente.
    await vinculoModel.createVinculo(tx, {
      funcionarioId,
      unidadeEscolarId,
      cargoId,
      entrada: cargoSchedule.entrada,
      saidaAlmoco: cargoSchedule.saidaAlmoco,
      retornoAlmoco: cargoSchedule.retornoAlmoco,
      saida: cargoSchedule.saida,
    });

    return { funcionarioId, cargoId };
  });

  let created;
  try {
    created = await employeeModel.findById(createdIds.funcionarioId);
  } catch (error) {
    logger.warn("Cadastro concluido, mas a leitura complementar falhou", {
      error,
      funcionarioId: createdIds.funcionarioId,
    });
  }

  if (!created) {
    created = {
      id: createdIds.funcionarioId,
      cpf,
      nome,
      email,
      telefone,
      ativo,
      criado_em: null,
      primeiro_acesso: true,
      cargo_id: createdIds.cargoId,
      cargo_nome: cargoSchedule.cargo,
    };
  }

  await registerAuditLog({
    evento: "funcionario_cadastrado",
    adminId,
    funcionarioId: createdIds.funcionarioId,
    mensagem: "Cadastro de funcionario realizado",
    ipOrigem,
    metadados: {
      cpf: created.cpf,
      email: created.email,
      cargo_id: created.cargo_id,
    },
  });

  // O envio ocorre apenas apos a transacao. Falhas no SMTP nao desfazem o
  // cadastro que ja foi confirmado no banco.
  const entregaEmail = await sendEmployeeWelcomeEmail({
    nome: created.nome,
    email: created.email,
    senhaTemporaria,
  });

  return {
    funcionario: mapEmployee(created),
    email_acesso: entregaEmail,
  };
}

async function listEmployees(query = {}, escopoUnidades = null) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;
  // Express 5 expoe req.query por getter; sanitizadores podem validar sem
  // substituir o valor original. Normaliza novamente na regra de negocio.
  const ativo = normalizeActiveFilter(query.ativo);
  const cargo = String(query.cargo || "").trim().toUpperCase();
  const q = String(query.q || "").trim();

  const totalRows = await employeeModel.countEmployees({ ativo, cargo, q }, escopoUnidades);
  const employees = await employeeModel.listEmployees({
    ativo,
    cargo,
    q,
    limit,
    offset,
  }, escopoUnidades);

  return {
    items: employees.map(mapListedEmployee),
    pagination: {
      page,
      limit,
      total: Number(totalRows?.total || 0),
    },
  };
}

async function getEmployee(employeeId) {
  const employee = await employeeModel.findAdminEmployeeById(employeeId);
  if (!employee) {
    throw new NotFoundError("Funcionario nao encontrado");
  }

  return {
    funcionario: mapEditableEmployee(employee),
  };
}

function resolveEditableEmployee(body, existing) {
  const fields = Object.keys(body || {});
  if (
    fields.length === 0 ||
    fields.some((field) => !EDITABLE_EMPLOYEE_FIELDS.has(field))
  ) {
    throw new BadRequestError("Campos de atualizacao invalidos");
  }

  const cargo = String(
    body.cargo !== undefined ? body.cargo : existing.cargo
  )
    .trim()
    .toUpperCase();
  if (!EDITABLE_CARGO_TYPES.has(cargo)) {
    throw new BadRequestError("cargo invalido");
  }

  const sourceTimes = {
    entrada: body.entrada !== undefined ? body.entrada : existing.entrada,
    saidaAlmoco:
      body.saida_almoco !== undefined
        ? body.saida_almoco
        : existing.saida_almoco,
    retornoAlmoco:
      body.retorno_almoco !== undefined
        ? body.retorno_almoco
        : existing.retorno_almoco,
    saida: body.saida !== undefined ? body.saida : existing.saida,
  };
  const times = Object.fromEntries(
    Object.entries(sourceTimes).map(([field, value]) => [
      field,
      String(value || "").trim(),
    ])
  );

  if (Object.values(times).some((time) => !TIME_PATTERN.test(time))) {
    throw new BadRequestError("Horarios do cargo invalidos");
  }

  const orderedTimes = [
    times.entrada,
    times.saidaAlmoco,
    times.retornoAlmoco,
    times.saida,
  ].map((time) => {
    const [hours, minutes, seconds = "0"] = time.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  });
  if (
    !orderedTimes.every(
      (time, index) => index === 0 || orderedTimes[index - 1] < time
    )
  ) {
    throw new BadRequestError(
      "Horarios devem seguir entrada < saida_almoco < retorno_almoco < saida"
    );
  }

  const toDatabaseTime = (time) => (time.length === 5 ? `${time}:00` : time);
  return {
    nome:
      body.nome !== undefined
        ? String(body.nome).trim()
        : String(existing.nome),
    email:
      body.email !== undefined
        ? String(body.email).trim().toLowerCase()
        : String(existing.email).trim().toLowerCase(),
    telefone:
      body.telefone !== undefined
        ? String(body.telefone || "").replace(/\D/g, "") || null
        : existing.telefone || null,
    cargoSchedule: {
      cargo,
      entrada: toDatabaseTime(times.entrada),
      saidaAlmoco: toDatabaseTime(times.saidaAlmoco),
      retornoAlmoco: toDatabaseTime(times.retornoAlmoco),
      saida: toDatabaseTime(times.saida),
    },
  };
}

/**
 * Atualiza o funcionario e seu cargo exclusivo como uma unica operacao atomica.
 */
async function updateEmployee(employeeId, body, { adminId, ipOrigem } = {}) {
  const updated = await employeeModel.withTransaction(async (tx) => {
    const existing = await employeeModel.findAdminEmployeeByIdForUpdate(
      tx,
      employeeId
    );
    if (!existing) {
      throw new NotFoundError("Funcionario nao encontrado");
    }

    // No novo schema a jornada e o cargo do funcionario vivem no vinculo ativo
    // (e nao mais na tabela cargos, que agora e UNIQUE/compartilhada). Trava o
    // vinculo ativo aqui; sem ele nao ha onde aplicar a edicao de jornada.
    // Renomear o row de cargos jamais faria sentido (afetaria outros
    // funcionarios que compartilham o mesmo cargo) — em vez disso re-pontamos o
    // vinculo para o cargo alvo (find-or-create pelo nome).
    const vinculo = await vinculoModel.findActiveByFuncionarioIdForUpdate(
      tx,
      employeeId
    );
    if (!vinculo) {
      throw new ConflictError("Funcionario sem vinculo ativo para editar");
    }

    const edits = resolveEditableEmployee(body, existing);
    const emailExists = await employeeModel.findEmailConflictForUpdate(
      tx,
      edits.email,
      employeeId
    );
    if (emailExists) {
      throw new ConflictError("Email ja cadastrado");
    }

    // As atualizacoes (funcionario + vinculo) operam sobre rows recem-travadas
    // (existing e vinculo via FOR UPDATE), garantindo o match da clausula WHERE.
    // Nao ha guard em affectedRows: o UPDATE do mysql2 devolve linhas ALTERADAS
    // (nao "matched"), entao uma edicao no-op (ex.: so `nome` mudou, jornada
    // repetida) resultaria 0 e dispararia um falso "nao encontrado".
    await employeeModel.updateAdminEmployee(tx, employeeId, edits);

    // Reaponta o vinculo ao cargo alvo (find-or-create pelo nome, ja que cargo e
    // UNIQUE/compartilhada) e sobrescreve a jornada no proprio vinculo.
    const cargoId = await findOrCreateCargo(tx, edits.cargoSchedule.cargo);
    await vinculoModel.update(tx, vinculo.id, {
      cargoId,
      entrada: edits.cargoSchedule.entrada,
      saidaAlmoco: edits.cargoSchedule.saidaAlmoco,
      retornoAlmoco: edits.cargoSchedule.retornoAlmoco,
      saida: edits.cargoSchedule.saida,
    });

    return {
      ...existing,
      cargo_id: cargoId,
      nome: edits.nome,
      email: edits.email,
      telefone: edits.telefone,
      cargo: edits.cargoSchedule.cargo,
      entrada: edits.cargoSchedule.entrada,
      saida_almoco: edits.cargoSchedule.saidaAlmoco,
      retorno_almoco: edits.cargoSchedule.retornoAlmoco,
      saida: edits.cargoSchedule.saida,
    };
  });

  await registerAuditLog({
    evento: "funcionario_alterado",
    adminId,
    funcionarioId: employeeId,
    mensagem: "Dados de funcionario alterados",
    ipOrigem,
    metadados: {
      email: updated.email,
      cargo_id: updated.cargo_id,
    },
  });

  return {
    funcionario: mapEditableEmployee(updated),
  };
}

async function changeEmployeeActivation(
  employeeId,
  ativo,
  confirmation,
  { adminId, ipOrigem } = {}
) {
  const expectedConfirmation = ativo ? "REATIVAR" : "DESATIVAR";
  if (confirmation !== expectedConfirmation) {
    throw new BadRequestError(
      `Confirmacao invalida. Informe ${expectedConfirmation}`
    );
  }

  const updated = await employeeModel.withTransaction(async (tx) => {
    const existing = await employeeModel.findByIdForUpdate(tx, employeeId);
    if (!existing) {
      throw new NotFoundError("Funcionario nao encontrado");
    }

    if (Boolean(existing.ativo) === ativo) {
      throw new ConflictError(
        ativo
          ? "Funcionario ja esta ativo"
          : "Funcionario ja esta inativo"
      );
    }

    const result = await employeeModel.updateEmployeeActivation(
      tx,
      employeeId,
      ativo
    );
    if (!result.affectedRows) {
      throw new Error("Falha ao atualizar o status do funcionario");
    }

    // Desativar encerra o vínculo ativo (status=ENCERRADO + data_fim) para
    // refletir o desligamento no novo schema, onde cargo/escola/jornada vivem
    // no vínculo. Não apaga registro_de_pontos (histórico permanece intacto).
    // Reativar não (re)abre vínculo: a reabertura de vínculo é uma operação
    // de cadastro separada, não parte desta ativação.
    if (!ativo) {
      const vinculo = await vinculoModel.findActiveByFuncionarioIdForUpdate(
        tx,
        employeeId
      );
      if (vinculo) {
        await vinculoModel.encerrarVinculo(tx, vinculo.id);
      }
    }

    const status = await employeeModel.findEmployeeActivationById(
      tx,
      employeeId
    );
    if (!status) {
      throw new Error("Falha ao consultar o status atualizado do funcionario");
    }

    return status;
  });

  await registerAuditLog({
    evento: ativo ? "funcionario_ativado" : "funcionario_desativado",
    adminId,
    funcionarioId: employeeId,
    mensagem: ativo ? "Funcionario ativado" : "Funcionario desativado",
    ipOrigem,
  });

  return {
    id: Number(updated.id),
    ativo: Boolean(updated.ativo),
    desativado_em: updated.desativado_em || null,
  };
}

async function deactivateEmployee(employeeId, confirmation, auditContext) {
  return changeEmployeeActivation(
    employeeId,
    false,
    confirmation,
    auditContext
  );
}

async function reactivateEmployee(employeeId, confirmation, auditContext) {
  return changeEmployeeActivation(
    employeeId,
    true,
    confirmation,
    auditContext
  );
}

module.exports = {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
};
