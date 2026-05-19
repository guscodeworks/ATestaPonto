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
    atualizado_em: employee.atualizado_em,
    desativado_em: employee.desativado_em
  };
}

async function createEmployee(req, res, next) {
  try {
    const nome = String(req.body.nome || '').trim();
    const cpf = String(req.body.cpf || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const ativo = req.body.ativo === undefined ? true : Boolean(req.body.ativo);
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

      const result = await tx.execute(
        `INSERT INTO funcionarios (cpf, nome, email, senha_hash, ativo, desativado_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cpf, nome, email, senhaHash, ativo ? 1 : 0, ativo ? null : new Date()]
      );
      return result.insertId;
    });

    const created = await executeOne(
      `SELECT id, cpf, nome, email, ativo, criado_em, atualizado_em, desativado_em
       FROM funcionarios WHERE id = ? LIMIT 1`,
      [employeeId]
    );

    await registerAuditLog({
      evento: 'funcionario_cadastrado',
      adminId: req.auth.id,
      funcionarioId: employeeId,
      mensagem: 'Cadastro de funcionario realizado',
      ipOrigem: getClientIp(req),
      metadados: { cpf: created.cpf, email: created.email }
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
      filters.push('ativo = ?');
      params.push(ativo ? 1 : 0);
    }

    if (q) {
      filters.push('(nome LIKE ? OR email LIKE ? OR cpf LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const totalRows = await executeOne(
      `SELECT COUNT(*) AS total FROM funcionarios ${whereClause}`,
      params
    );

    const employees = await execute(
      `SELECT id, cpf, nome, email, ativo, criado_em, atualizado_em, desativado_em
       FROM funcionarios ${whereClause}
       ORDER BY id DESC
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
    const ativo = req.body.ativo;

    const hasAnyField = nome !== undefined || cpf !== undefined || email !== undefined || ativo !== undefined;
    if (!hasAnyField) {
      throw new BadRequestError('Nenhum campo para atualizar foi enviado');
    }

    await withTransaction(async (tx) => {
      const existing = await tx.executeOne(
        'SELECT id, cpf, email, ativo FROM funcionarios WHERE id = ? LIMIT 1 FOR UPDATE',
        [employeeId]
      );
      if (!existing) {
        throw new NotFoundError('Funcionario nao encontrado');
      }

      if (cpf && cpf !== existing.cpf) {
        const cpfExists = await tx.executeOne(
          'SELECT id FROM funcionarios WHERE cpf = ? AND id <> ? LIMIT 1 FOR UPDATE',
          [cpf, employeeId]
        );
        if (cpfExists) {
          throw new ConflictError('CPF ja cadastrado');
        }
      }

      if (email && email.toLowerCase() !== String(existing.email || '').toLowerCase()) {
        const emailExists = await tx.executeOne(
          'SELECT id FROM funcionarios WHERE email = ? AND id <> ? LIMIT 1 FOR UPDATE',
          [email.toLowerCase(), employeeId]
        );
        if (emailExists) {
          throw new ConflictError('Email ja cadastrado');
        }
      }

      const fields = [];
      const values = [];
      if (nome !== undefined) {
        fields.push('nome = ?');
        values.push(String(nome).trim());
      }
      if (cpf !== undefined) {
        fields.push('cpf = ?');
        values.push(String(cpf).trim());
      }
      if (email !== undefined) {
        fields.push('email = ?');
        values.push(String(email).trim().toLowerCase());
      }
      if (ativo !== undefined) {
        fields.push('ativo = ?');
        fields.push('desativado_em = ?');
        values.push(ativo ? 1 : 0, ativo ? null : new Date());
      }

      values.push(employeeId);
      await tx.execute(`UPDATE funcionarios SET ${fields.join(', ')} WHERE id = ?`, values);
    });

    const updated = await executeOne(
      `SELECT id, cpf, nome, email, ativo, criado_em, atualizado_em, desativado_em
       FROM funcionarios WHERE id = ? LIMIT 1`,
      [employeeId]
    );

    await registerAuditLog({
      evento: 'funcionario_alterado',
      adminId: req.auth.id,
      funcionarioId: employeeId,
      mensagem: 'Dados de funcionario alterados',
      ipOrigem: getClientIp(req),
      metadados: { cpf: updated.cpf, email: updated.email }
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
      'UPDATE funcionarios SET ativo = ?, desativado_em = ? WHERE id = ?',
      [ativo ? 1 : 0, ativo ? null : new Date(), employeeId]
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
