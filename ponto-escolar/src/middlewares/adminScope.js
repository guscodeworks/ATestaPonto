"use strict";

const { ForbiddenError } = require("../utils/errors");
const vinculoModel = require("../models/vinculoModel");
const unidadeEscolarModel = require("../models/unidadeEscolarModel");

// Escopo por perfil: só este módulo interpreta perfis; demais camadas recebem ids ou null (SEDUC).

const PERFIL_SEDUC = "ADMIN_SEDUC"; // estadual
const PERFIL_DIRETORIA = "ADMIN_DIRETORIA"; // diretoria de ensino
const PERFIL_DIRETOR = "DIRETOR"; // unidade escolar
const PERFIL_VICE_DIRETOR = "VICE_DIRETOR"; // unidade escolar
const PERFIL_SECRETARIA = "SECRETARIA"; // unidade escolar
const PERFIL_COORDENADOR = "COORDENADOR"; // unidade escolar
const PERFIS_ESCOLARES = new Set([
  PERFIL_DIRETOR,
  PERFIL_VICE_DIRETOR,
  PERFIL_SECRETARIA,
  PERFIL_COORDENADOR,
]);

// Matriz de delegação: quem-pode-conceder-o-quê (perfil-based). Substitui a
// regra anterior apenas de escopo. Psq: linha = concedente; coluna = concedido.
//   ADMIN_SEDUC     -> ADMIN_DIRETORIA, SECRETARIA, COORDENADOR (não SEDUC, não escolares direção)
//   ADMIN_DIRETORIA -> DIRETOR, VICE_DIRETOR, SECRETARIA, COORDENADOR (não SEDUC, não DIRETORIA)
//   DIRETOR         -> SECRETARIA, COORDENADOR
//   VICE_DIRETOR    -> SECRETARIA, COORDENADOR
//   SECRETARIA      -> (nenhum)
//   COORDENADOR     -> (nenhum)
// Regras adicionais refletidas na matriz:
//   - ADMIN_SEDUC não cria outro ADMIN_SEDUC (ausente na coluna).
//   - ADMIN_DIRETORIA não cria ADMIN_SEDUC nem ADMIN_DIRETORIA (ausentes na coluna).
//   - DIRETOR/VICE_DIRETOR só concedem perfis escolares SECRETARIA/COORDENADOR.
// Anti-escalada é implícita: ninguém concede perfil igual ou acima do próprio nível
// (ADMIN_DIRETORIA não concede DIRETORIA nem SEDUC; direção não concede DIRETOR/VICE).
const MATRIZ_DELEGACAO = Object.freeze({
  [PERFIL_SEDUC]: new Set([PERFIL_DIRETORIA, PERFIL_SECRETARIA, PERFIL_COORDENADOR]),
  [PERFIL_DIRETORIA]: new Set([
    PERFIL_DIRETOR,
    PERFIL_VICE_DIRETOR,
    PERFIL_SECRETARIA,
    PERFIL_COORDENADOR,
  ]),
  [PERFIL_DIRETOR]: new Set([PERFIL_SECRETARIA, PERFIL_COORDENADOR]),
  [PERFIL_VICE_DIRETOR]: new Set([PERFIL_SECRETARIA, PERFIL_COORDENADOR]),
  [PERFIL_SECRETARIA]: new Set(),
  [PERFIL_COORDENADOR]: new Set(),
});

// Avalia pela matriz se um concedente (perfil) pode conceder um perfil-alvo.
// Não conhece escopo — apenas a dimensão perfil-a-perfil. A checagem de escopo
// (recursoNoEscopo) permanece incluída e independente; esta função é pré-filtro.
function podeConceder(perfilConcedente, perfilConcedido) {
  const concedente = String(perfilConcedente || "").trim().toUpperCase();
  const objetivo = String(perfilConcedido || "").trim().toUpperCase();
  const permitidos = MATRIZ_DELEGACAO[concedente];
  return Boolean(permitidos && permitidos.has(objetivo));
}

// Consolida acessos ativos (OR entre perfis) → { isSeduc, diretoriasPermitidas, unidadesPermitidas, temAcesso }.
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
    // Perfis desconhecidos são ignorados.
  }

  return escopo;
}

// Checagem pura de escopo por diretoria/unidade. SEDUC sempre passa; só-unidade exige expandirUnidadesPermitidas.
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

// Expande diretorias → unidades. null = sem filtro (SEDUC); [] = nenhuma permitida.
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
      // Falha em uma diretoria não invalida as demais permissões.
    }
  }

  return [...permitidas];
}

// Popula req.escopo e req.escopoUnidades a partir de req.acessos.
async function escopoMiddleware(req, _res, next) {
  const escopo = buildEscopo(req.acessos);

  if (!escopo.temAcesso) {
    return next(
      new ForbiddenError("Administrador sem acessos administrativos ativos")
    );
  }

  req.escopo = escopo;

  // Pré-computa unidades permitidas para filtros em listagens (null = sem filtro).
  try {
    req.escopoUnidades = await expandirUnidadesPermitidas(escopo);
  } catch (error) {
    return next(
      new ForbiddenError("Falha ao resolver escopo administrativo")
    );
  }

  return next();
}

// Valida escopo via vínculo ativo do funcionário (resolvido no backend).
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

// Valida escopo da unidade_escolar_id do body (unidade → diretoria resolvida no backend).
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

// Reativação: escopo via vínculo mais recente (encerrado), pois reativar não reabre vínculo.
function restringirEscopoFuncionarioReativacao(paramName = "id") {
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

    let vinculo;
    try {
      vinculo = await vinculoModel.findLatestByFuncionarioIdWithDetails(
        funcionarioId
      );
    } catch (error) {
      return next(
        new ForbiddenError("Falha ao validar escopo do funcionario")
      );
    }

    if (!vinculo) {
      return next(
        new ForbiddenError(
          "Funcionario sem vinculo para definir escopo de reativacao (pendencia)"
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

module.exports = {
  PERFIL_SEDUC,
  PERFIL_DIRETORIA,
  PERFIL_DIRETOR,
  PERFIL_VICE_DIRETOR,
  PERFIL_SECRETARIA,
  PERFIL_COORDENADOR,
  PERFIS_ESCOLARES,
  MATRIZ_DELEGACAO,
  podeConceder,
  buildEscopo,
  recursoNoEscopo,
  expandirUnidadesPermitidas,
  escopoMiddleware,
  restringirEscopoFuncionario,
  restringirEscopoUnidadeDoBody,
  restringirEscopoFuncionarioReativacao,
};
