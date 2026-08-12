"use strict";

const { ForbiddenError } = require("../utils/errors");
const vinculoModel = require("../models/vinculoModel");
const unidadeEscolarModel = require("../models/unidadeEscolarModel");

// Perfis reconhecidos nos acessos_administrativos. A regra de escopo por perfil
// vive neste único módulo — services/models nunca interpretam perfis, apenas
// recebem o conjunto de unidades permitidas (ou null = acesso total).

// ADMIN_SEDUC: acesso estadual — qualquer diretoria e qualquer escola.
const PERFIL_SEDUC = "ADMIN_SEDUC";
// ADMIN_DIRETORIA: escopo de diretoria de ensino — toda escola da sua diretoria.
const PERFIL_DIRETORIA = "ADMIN_DIRETORIA";
// Perfis escolares: escopo de uma única unidade escolar.
const PERFIS_ESCOLARES = new Set([
  "DIRETOR",
  "VICE_DIRETOR",
  "SECRETARIA",
  "COORDENADOR",
]);

// Monta o escopo consolidado a partir dos acessos ativos do administrador.
// Um admin pode ter múltiplos acessos; a autorização é OR entre eles:
// qualquer acesso válido que autorize o recurso libera a operação.
//
// Resultado:
//   { isSeduc, diretoriasPermitidas: Set<number>, unidadesPermitidas: Set<number>,
//     temAcesso: boolean }
function buildEscopo(acessos) {
  const lista = Array.isArray(acessos) ? acessos : [];

  const escopo = {
    isSeduc: false,
    diretoriasPermitidas: new Set(),
    unidadesPermitidas: new Set(),
    temAcesso: false,
  };

  for (const acesso of lista) {
    const perfil = String((acesso && acesso.perfil) || "").trim();
    const diretoriaId = Number(
      acesso && acesso.diretoria_ensino_id
    );
    const unidadeId = Number(acesso && acesso.unidade_escolar_id);

    if (perfil === PERFIL_SEDUC) {
      escopo.isSeduc = true;
      escopo.temAcesso = true;
      continue;
    }

    if (perfil === PERFIL_DIRETORIA) {
      if (Number.isInteger(diretoriaId) && diretoriaId > 0) {
        escopo.diretoriasPermitidas.add(diretoriaId);
        escopo.temAcesso = true;
      }
      continue;
    }

    if (PERFIS_ESCOLARES.has(perfil)) {
      if (Number.isInteger(unidadeId) && unidadeId > 0) {
        escopo.unidadesPermitidas.add(unidadeId);
        escopo.temAcesso = true;
      }
      continue;
    }
    // Perfis desconhecidos são ignorados (não autorizam nada). Evita presumir
    // uma convenção para enums que não constam no spec desta etapa.
  }

  return escopo;
}

// Verifica, de forma pura (sem consultas ao banco), se um recurso identificado
// por diretoria_ensino_id e/ou unidade_escolar_id está no escopo do admin.
//   - SEDUC: sempre liberado.
//   - Perfil de escola: liberado se o recurso pertence à unidade permitida.
//   - Perfil de diretoria: liberado se o recurso pertence a uma diretoria
//     permitida. Para recurso identificado só por unidade, é necessário o
//     caller resolver a diretoria da unidade antes de chamar (ou usar
//     expandirUnidadesPermitidas).
function recursoNoEscopo(escopo, { diretoriaEnsinoId, unidadeEscolarId } = {}) {
  if (!escopo || !escopo.temAcesso) {
    return false;
  }
  if (escopo.isSeduc) {
    return true;
  }

  const unidadeId = Number(unidadeEscolarId);
  if (Number.isInteger(unidadeId) && unidadeId > 0) {
    if (escopo.unidadesPermitidas.has(unidadeId)) {
      return true;
    }
  }

  const diretoriaId = Number(diretoriaEnsinoId);
  if (Number.isInteger(diretoriaId) && diretoriaId > 0) {
    if (escopo.diretoriasPermitidas.has(diretoriaId)) {
      return true;
    }
  }

  return false;
}

// Resolve o conjunto de unidades_escolar_id permitidas ao admin. Para acessos
// de diretoria, expande buscando as unidades sob cada diretoria permitida e
// unindo com as unidades diretamente permitidas.
//   - SEDUC ou sem acessos processáveis: retorna null (sinal de "sem filtro",
//     isto é, acesso total). O caller deve interpretar null como "não filtra".
//   - Caso contrário: array de ids (possivelmente vazio = nenhum permitido).
async function expandirUnidadesPermitidas(escopo) {
  if (!escopo || !escopo.temAcesso) {
    return null;
  }
  if (escopo.isSeduc) {
    return null;
  }

  const permitidas = new Set(escopo.unidadesPermitidas);

  for (const diretoriaId of escopo.diretoriasPermitidas) {
    try {
      const unidades = await unidadeEscolarModel.findByDiretoriaId(diretoriaId);
      for (const unidade of unidades || []) {
        if (unidade && Number.isInteger(Number(unidade.id))) {
          permitidas.add(Number(unidade.id));
        }
      }
    } catch (_error) {
      // Diretoria sem unidades (ou falha temporária): não expande nada, mas
      // mantém as demais permissões. Outras unidades sob outras diretorias
      // continuam válidas.
    }
  }

  return [...permitidas];
}

// Middleware que popula req.escopo a partir de req.acessos (já carregado pelo
// ensureAdminApiAuthenticated). Bloqueia acesso se o admin não tem nenhum
// acesso ativo.
async function escopoMiddleware(req, _res, next) {
  const escopo = buildEscopo(req.acessos);

  if (!escopo.temAcesso) {
    return next(
      new ForbiddenError("Administrador sem acessos administrativos ativos")
    );
  }

  req.escopo = escopo;

  // Pré-computa o conjunto de unidades permitidas para os services/models
  // filtrarem listagens/relatórios sem conhecer perfis. null = sem filtro.
  try {
    req.escopoUnidades = await expandirUnidadesPermitidas(escopo);
  } catch (error) {
    return next(
      new ForbiddenError("Falha ao resolver escopo administrativo")
    );
  }

  return next();
}

// Verifica o escopo sobre um funcionário identificado por req.params[paramName].
// Resolve o vínculo ativo do funcionário no backend (não confia em IDs do
// frontend) e bloqueia se o recurso estiver fora do escopo do admin.
function restringirEscopoFuncionario(paramName = "id") {
  return async function (req, _res, next) {
    const escopo = req.escopo || buildEscopo(req.acessos);

    if (!escopo.temAcesso) {
      return next(
        new ForbiddenError("Administrador sem acessos administrativos ativos")
      );
    }

    // SEDUC opera livremente sobre qualquer funcionário.
    if (escopo.isSeduc) {
      return next();
    }

    const funcionarioId = Number(req.params[paramName]);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
      return next(new ForbiddenError("Identificador de funcionario invalido"));
    }

    // Resolve o vínculo ativo com detalhes de unidade + diretoria no backend.
    // Não há confiança em valor enviado pelo cliente.
    let vinculo;
    try {
      vinculo = await vinculoModel.findActiveByFuncionarioIdWithDetails(
        funcionarioId
      );
    } catch (error) {
      return next(
        new ForbiddenError("Falha ao validar escopo do funcionario")
      );
    }

    // Sem vínculo ativo: não há contexto de escola/diretoria para autorizar.
    // Apenas SEDUC (já tratado acima) operaria; demais perfis são bloqueados.
    if (!vinculo) {
      return next(
        new ForbiddenError(
          "Funcionario sem vinculo ativo visivel ao escopo do administrador"
        )
      );
    }

    const autorizado = recursoNoEscopo(escopo, {
      unidadeEscolarId: vinculo.unidade_escolar_id,
      diretoriaEnsinoId: vinculo.diretoria_ensino_id,
    });

    if (!autorizado) {
      return next(
        new ForbiddenError("Funcionario fora do escopo do administrador")
      );
    }

    return next();
  };
}

// Verifica o escopo sobre a unidade_escolar_id informada no body (cadastro de
// funcionário). Resolve a unidade → diretoria no backend e bloqueia se estiver
// fora do escopo do admin. Não confia no ID enviado pelo frontend além de usá-lo
// apenas como alvo da validação.
function restringirEscopoUnidadeDoBody(field = "unidade_escolar_id") {
  return async function (req, _res, next) {
    const escopo = req.escopo || buildEscopo(req.acessos);

    if (!escopo.temAcesso) {
      return next(
        new ForbiddenError("Administrador sem acessos administrativos ativos")
      );
    }

    if (escopo.isSeduc) {
      return next();
    }

    const unidadeId = Number(req.body && req.body[field]);
    if (!Number.isInteger(unidadeId) || unidadeId <= 0) {
      // Não é papel deste middleware rejeitar campo obrigatório (o validador
      // express-validator cuida disso); apenas não autoriza sem alvo válido.
      return next(new ForbiddenError("Unidade escolar nao informada"));
    }

    let unidade;
    try {
      unidade = await unidadeEscolarModel.findById(unidadeId);
    } catch (error) {
      return next(
        new ForbiddenError("Falha ao validar escopo da unidade escolar")
      );
    }

    if (!unidade) {
      return next(new ForbiddenError("Unidade escolar nao encontrada"));
    }

    const autorizado = recursoNoEscopo(escopo, {
      unidadeEscolarId: unidade.id,
      diretoriaEnsinoId: unidade.diretoria_ensino_id,
    });

    if (!autorizado) {
      return next(
        new ForbiddenError("Unidade escolar fora do escopo do administrador")
      );
    }

    return next();
  };
}

module.exports = {
  PERFIL_SEDUC,
  PERFIL_DIRETORIA,
  PERFIS_ESCOLARES,
  buildEscopo,
  recursoNoEscopo,
  expandirUnidadesPermitidas,
  escopoMiddleware,
  restringirEscopoFuncionario,
  restringirEscopoUnidadeDoBody,
};
