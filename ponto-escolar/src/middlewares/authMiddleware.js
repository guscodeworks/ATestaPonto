const jwt = require("jsonwebtoken");
const env = require("../config/env");
const authService = require("../services/authService");
const { ForbiddenError, UnauthorizedError } = require("../utils/errors");

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string") {
    return {};
  }

  const [scheme, token] = authHeader.split(" ");
  if (!/^Bearer$/i.test(scheme) || !token) {
    return {};
  }

  return token.trim();
}

/**
 * Protege rotas de funcionario com JWT proprio, sem passar pelo fluxo admin Gov.br.
 */
async function authenticateFuncionario(req, _res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw new UnauthorizedError("Sessao do funcionario e obrigatoria");
    }

    const payload = jwt.verify(token, env.JWT_SECRET);
    const role = String(payload.role || "").toLowerCase();

    if (role !== "funcionario") {
      throw new ForbiddenError("Acesso de funcionario obrigatorio");
    }

    // Fallback para "id" cobre tokens legados que ainda não usavam a claim padrão "sub".
    const funcionarioId = Number(payload.sub || payload.id || 0);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
      throw new UnauthorizedError("Sessao do funcionario invalida");
    }

    // O token identifica; o banco confirma se o funcionario ainda pode bater ponto.
    const funcionario = await authService.findUserByToken(funcionarioId);

    // Token válido não garante que o funcionário ainda existe ou está ativo
    // (ex: demissão/desligamento após a emissão do token).
    if (!funcionario || !funcionario.ativo) {
      throw new UnauthorizedError("Funcionario inexistente ou inativo");
    }

    // Também invalida JWTs normais emitidos antes desta regra para quem ainda
    // precisa substituir a senha temporária.
    if (
      funcionario.primeiro_acesso === true ||
      funcionario.primeiro_acesso === 1 ||
      funcionario.primeiro_acesso === "1"
    ) {
      throw new ForbiddenError("Troca de senha obrigatoria antes de acessar o ponto");
    }

    req.auth = {
      id: funcionario.id,
      nome: funcionario.nome,
      role: "funcionario",
      email: funcionario.email,
      cpf: funcionario.cpf,
    };

    return next();
  } catch (error) {
    // Traduz erros internos do jsonwebtoken para respostas de autenticação
    // consistentes com o restante da API, sem vazar detalhes da lib.
    if (error.name === "TokenExpiredError") {
      return next(
        new UnauthorizedError("Sessao expirada. Faca login novamente.")
      );
    }

    if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      return next(new UnauthorizedError("Sessao do funcionario invalida"));
    }

    return next(error);
  }
}

module.exports = {
  authenticateFuncionario,
  extractBearerToken,
};
