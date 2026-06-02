const bcrypt = require('bcrypt');
const { execute, executeOne, withTransaction } = require('../config/database');
const { maskCpf } = require('../utils/cpf');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/errors');
const { registerAuditLog } = require('../services/auditLogService');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

function mapEmployee(employee) {
  return {
    id: employee.id,
    cpf: maskCpf(employee.cpf),
    nome: employee.nome,
    email: employee.email,
    ativo: Boolean(employee.ativo),
    criado_em: employee.criado_em,
    primeiro_acesso: Boolean(employee.primeiro_acesso),
    cargo_id: employee.cargo_id,
    cargo_nome: employee.cargo_nome || null,
    login_id: employee.login_id
  };
}

async function loadEmployeeById(employeeId) {
  return executeOne(
    `SELECT f.id, f.cpf, f.nome, f.email, f.ativo, f.criado_em, f.primeiro_acesso, f.cargo_id, f.login_id, c.nome AS cargo_nome
     FROM funcionarios f
     LEFT JOIN cargo c ON c.id = f.cargo_id
     WHERE f.id = ?
     LIMIT 1`,
    [employeeId]
  );
}

async function resolveCargoId(tx, requestedCargoId) {
  if (requestedCargoId) {
    const cargo = await tx.executeOne('SELECT id FROM cargo WHERE id = ? LIMIT 1 FOR UPDATE', [requestedCargoId]);
    if (!cargo) {
      throw new BadRequestError('cargo_id informado nao existe');
    }
    return Number(cargo.id);
  }

  const defaultCargo = await tx.executeOne('SELECT id FROM cargo ORDER BY id ASC LIMIT 1 FOR UPDATE');
  if (!defaultCargo) {
    const result = await tx.execute(
      `INSERT INTO cargo (nome, hora_entrada, hora_saida)
       VALUES (?, ?, ?)`,
      ['Cargo Padrao', '2000-01-01 08:00:00', '2000-01-01 17:00:00']
    );
    return Number(result.insertId);
  }
  return Number(defaultCargo.id);
}

async function createEmployee(req, res, next) {
  try {
    const nome = String(req.body.nome || '').trim();
    const cpf = String(req.body.cpf || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const ativo = req.body.ativo === undefined ? true : Boolean(req.body.ativo);
    const requestedCargoId = req.body.cargo_id ? Number(req.body.cargo_id) : null;
    const senhaHash = await bcrypt.hash(senha, 12);

    const employeeId = await withTransaction(async (tx) => {
      const cpfExists = await tx.executeOne('SELECT id FROM funcionarios WHERE cpf = ? LIMIT 1 FOR UPDATE', [cpf]);
      if (cpfExists) {
        throw new ConflictError('CPF ja cadastrado');
      }

      const emailExists = await tx.executeOne('SELECT id FROM funcionarios WHERE email = ? LIMIT 1 FOR UPDATE', [email]);
      if (emailExists) {
        throw new ConflictError('Email ja cadastrado');
      }

      const loginCpfExists = await tx.executeOne('SELECT id FROM login WHERE cpf = ? LIMIT 1 FOR UPDATE', [cpf]);
      if (loginCpfExists) {
        throw new ConflictError('CPF ja cadastrado');
      }

      const cargoId = await resolveCargoId(tx, requestedCargoId);
      const loginInsert = await tx.execute(
        'INSERT INTO login (cpf, senha) VALUES (?, ?)',
        [cpf, senhaHash]
      );
      const loginId = Number(loginInsert.insertId);

      const result = await tx.execute(
        `INSERT INTO funcionarios (cpf, nome, email, senha, ativo, primeiro_acesso, cargo_id, login_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cpf, nome, email, senhaHash, ativo ? 1 : 0, 1, cargoId, loginId]
      );
      return result.insertId;
    });

    const created = await loadEmployeeById(employeeId);

    await registerAuditLog({
      evento: 'funcionario_cadastrado',
      adminId: req.auth.id,
      funcionarioId: employeeId,
      mensagem: 'Cadastro de funcionario realizado',
      ipOrigem: getClientIp(req),
      metadados: { cpf: created.cpf, email: created.email, cargo_id: created.cargo_id }
    });

    return res.status(201).json({
      success: true,
      data: {
        funcionario: mapEmployee(created)
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function listEmployees(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const offset = (page - 1) * limit;
    const ativo = req.query.ativo;
    const q = String(req.query.q || '').trim();

    const filters = [];
    const params = [];

    if (typeof ativo === 'boolean') {
      filters.push('f.ativo = ?');
      params.push(ativo ? 1 : 0);
    }

    if (q) {
      filters.push('(f.nome LIKE ? OR f.email LIKE ? OR f.cpf LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const totalRows = await executeOne(
      `SELECT COUNT(*) AS total
       FROM funcionarios f
       ${whereClause}`,
      params
    );

    const employees = await execute(
      `SELECT f.id, f.cpf, f.nome, f.email, f.ativo, f.criado_em, f.primeiro_acesso, f.cargo_id, f.login_id, c.nome AS cargo_nome
       FROM funcionarios f
       LEFT JOIN cargo c ON c.id = f.cargo_id
       ${whereClause}
       ORDER BY f.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      success: true,
      data: {
        items: employees.map(mapEmployee),
        pagination: {
          page,
          limit,
          total: Number(totalRows?.total || 0)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function updateEmployee(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    const nome = req.body.nome;
    const cpf = req.body.cpf;
    const email = req.body.email;
    const senha = req.body.senha;
    const ativo = req.body.ativo;
    const cargoId = req.body.cargo_id;

    const hasAnyField =
      nome !== undefined ||
      cpf !== undefined ||
      email !== undefined ||
      senha !== undefined ||
      ativo !== undefined ||
      cargoId !== undefined;

    if (!hasAnyField) {
      throw new BadRequestError('Nenhum campo para atualizar foi enviado');
    }

    await withTransaction(async (tx) => {
      const existing = await tx.executeOne(
        'SELECT id, cpf, email, ativo, cargo_id, login_id FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE',
        [employeeId]
      );
      if (!existing) {
        throw new NotFoundError('Funcionario nao encontrado');
      }

      const fields = [];
      const values = [];

      if (cpf !== undefined) {
        const normalizedCpf = String(cpf).trim();
        if (normalizedCpf !== existing.cpf) {
          const cpfExists = await tx.executeOne(
            'SELECT id FROM funcionarios WHERE cpf = ? AND id <> ? LIMIT 1 FOR UPDATE',
            [normalizedCpf, employeeId]
          );
          if (cpfExists) {
            throw new ConflictError('CPF ja cadastrado');
          }

          const loginCpfExists = await tx.executeOne(
            'SELECT id FROM login WHERE cpf = ? AND id <> ? LIMIT 1 FOR UPDATE',
            [normalizedCpf, existing.login_id]
          );
          if (loginCpfExists) {
            throw new ConflictError('CPF ja cadastrado');
          }

          await tx.execute('UPDATE login SET cpf = ? WHERE id = ?', [normalizedCpf, existing.login_id]);
          fields.push('cpf = ?');
          values.push(normalizedCpf);
        }
      }

      if (email !== undefined) {
        const normalizedEmail = String(email).trim().toLowerCase();
        if (normalizedEmail !== String(existing.email || '').toLowerCase()) {
          const emailExists = await tx.executeOne(
            'SELECT id FROM funcionarios WHERE email = ? AND id <> ? LIMIT 1 FOR UPDATE',
            [normalizedEmail, employeeId]
          );
          if (emailExists) {
            throw new ConflictError('Email ja cadastrado');
          }
        }
        fields.push('email = ?');
        values.push(normalizedEmail);
      }

      if (nome !== undefined) {
        fields.push('nome = ?');
        values.push(String(nome).trim());
      }

      if (ativo !== undefined) {
        fields.push('ativo = ?');
        values.push(ativo ? 1 : 0);
      }

      if (cargoId !== undefined) {
        const cargo = await tx.executeOne('SELECT id FROM cargo WHERE id = ? LIMIT 1 FOR UPDATE', [Number(cargoId)]);
        if (!cargo) {
          throw new BadRequestError('cargo_id informado nao existe');
        }
        fields.push('cargo_id = ?');
        values.push(Number(cargoId));
      }

      if (senha !== undefined) {
        const senhaHash = await bcrypt.hash(String(senha), 12);
        fields.push('senha = ?');
        values.push(senhaHash);
        await tx.execute('UPDATE login SET senha = ? WHERE id = ?', [senhaHash, existing.login_id]);
      }

      if (fields.length > 0) {
        values.push(employeeId);
        await tx.execute(`UPDATE funcionarios SET ${fields.join(', ')} WHERE id = ?`, values);
      }
    });

    const updated = await loadEmployeeById(employeeId);

    await registerAuditLog({
      evento: 'funcionario_alterado',
      adminId: req.auth.id,
      funcionarioId: employeeId,
      mensagem: 'Dados de funcionario alterados',
      ipOrigem: getClientIp(req),
      metadados: { cpf: updated.cpf, email: updated.email, cargo_id: updated.cargo_id }
    });

    return res.status(200).json({
      success: true,
      data: {
        funcionario: mapEmployee(updated)
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function setEmployeeStatus(req, res, next) {
  try {
    const employeeId = Number(req.params.id);
    const ativo = Boolean(req.body.ativo);

    const result = await execute(
      'UPDATE funcionarios SET ativo = ? WHERE id = ?',
      [ativo ? 1 : 0, employeeId]
    );

    if (!result.affectedRows) {
      throw new NotFoundError('Funcionario nao encontrado');
    }

    await registerAuditLog({
      evento: ativo ? 'funcionario_ativado' : 'funcionario_desativado',
      adminId: req.auth.id,
      funcionarioId: employeeId,
      mensagem: ativo ? 'Funcionario ativado' : 'Funcionario desativado',
      ipOrigem: getClientIp(req)
    });

    return res.status(200).json({
      success: true,
      data: {
        id: employeeId,
        ativo
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createEmployee,
  listEmployees,
  updateEmployee,
  setEmployeeStatus
};
