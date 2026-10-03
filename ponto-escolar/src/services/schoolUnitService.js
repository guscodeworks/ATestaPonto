"use strict";

const schoolUnitModel = require("../models/schoolUnitModel");
const educationDepartmentModel = require("../models/educationDepartmentModel");
const cepService = require("./cepService");
const { registerAuditLog } = require("./auditLogService");
const { buildEscopo, recursoNoEscopo } = require("../middlewares/adminScope");
const { filtrarAcessosPorCapacidade } = require("../utils/adminCapabilities");
const { haversineDistanceMeters } = require("../utils/location");
const {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require("../utils/errors");

// Gestão de escolas/unidades escolares (tabela unidades_escolares).
//
// Regras de cadastro:
//  - ADMIN_SEDUC cadastra em qualquer DRE; ADMIN_DIRETORIA só na própria DRE;
//    perfis escolares não cadastram (nem possuem a capacidade escola.criar).
//  - O escopo é revalidado aqui mesmo com o middleware na rota (defesa em
//    profundidade: o service nunca confia que quem o chamou já checou).
//  - A BrasilAPI NÃO é autoridade: o que o administrador informou prevalece e a
//    API só completa lacunas. Se ela falhar, o cadastro só segue com endereço e
//    coordenadas informados manualmente e confirmados de forma explícita.

const CAPACIDADE_CRIAR = "escola.criar";
const RAIO_PADRAO_METROS = 100;
// Acima disso, coordenadas manuais e as do CEP são tão distantes que vale avisar.
const DIVERGENCIA_COORDENADAS_METROS = 3000;

function limparTexto(valor, max) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor)
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return texto ? texto.slice(0, max) : null;
}

// Comparação tolerante (caixa e acentos) só para gerar avisos de divergência.
function semAcento(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function lerNumero(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : NaN;
}

function normalizarEntrada(payload = {}) {
  const diretoriaEnsinoId = Number(payload.diretoria_ensino_id);
  const latitude = lerNumero(payload.latitude);
  const longitude = lerNumero(payload.longitude);
  const raio = lerNumero(payload.raio_permitido_metros);
  const inepBruto = limparTexto(payload.codigo_inep, 20);

  return {
    diretoriaEnsinoId,
    nome: limparTexto(payload.nome, 150),
    codigoInep: inepBruto ? inepBruto.replace(/\D/g, "") : null,
    cep: cepService.normalizarCep(payload.cep),
    logradouro: limparTexto(payload.logradouro, 255),
    numero: limparTexto(payload.numero, 20),
    bairro: limparTexto(payload.bairro, 100),
    cidade: limparTexto(payload.cidade, 100),
    uf: limparTexto(payload.uf, 2)?.toUpperCase() ?? null,
    latitude,
    longitude,
    raioPermitidoMetros: raio === null ? RAIO_PADRAO_METROS : raio,
    enderecoManualConfirmado: payload.endereco_manual_confirmado === true,
  };
}

function falhaDeCampo(field, message) {
  return { field, location: "body", message };
}

// Validações que não dependem de banco nem de rede.
function validarEntrada(dados) {
  const erros = [];

  if (!dados.nome || dados.nome.length < 3) {
    erros.push(falhaDeCampo("nome", "Nome deve ter entre 3 e 150 caracteres"));
  }
  if (!Number.isSafeInteger(dados.diretoriaEnsinoId) || dados.diretoriaEnsinoId < 1) {
    erros.push(falhaDeCampo("diretoria_ensino_id", "diretoria_ensino_id invalido"));
  }
  if (dados.codigoInep && !/^\d{8}$/.test(dados.codigoInep)) {
    erros.push(falhaDeCampo("codigo_inep", "Codigo INEP deve ter 8 digitos"));
  }
  if (!cepService.isCepValido(dados.cep)) {
    erros.push(falhaDeCampo("cep", "CEP deve ter 8 digitos validos"));
  }
  if (dados.uf && !/^[A-Z]{2}$/.test(dados.uf)) {
    erros.push(falhaDeCampo("uf", "UF deve ter 2 letras"));
  }
  if (
    !Number.isInteger(dados.raioPermitidoMetros) ||
    dados.raioPermitidoMetros < 10 ||
    dados.raioPermitidoMetros > 1000
  ) {
    erros.push(
      falhaDeCampo("raio_permitido_metros", "raio_permitido_metros deve ser inteiro entre 10 e 1000")
    );
  }

  const informouLat = dados.latitude !== null;
  const informouLng = dados.longitude !== null;
  if (informouLat !== informouLng) {
    erros.push(falhaDeCampo("latitude", "Informe latitude e longitude juntas"));
  } else if (informouLat) {
    if (!cepService.coordenadasDentroDoBrasil(dados.latitude, dados.longitude)) {
      erros.push(falhaDeCampo("latitude", "Coordenadas fora do territorio brasileiro"));
    }
  }

  if (erros.length > 0) {
    throw new ValidationError("Dados da escola invalidos", erros);
  }
}

// Etapa 1 da autorização: o perfil precisa ter a capacidade de cadastrar.
// Perfis escolares (DIRETOR, SECRETARIA etc.) não têm e param aqui.
function exigirCapacidadeDeCadastro(acessos) {
  const autorizadores = filtrarAcessosPorCapacidade(acessos, CAPACIDADE_CRIAR);
  if (autorizadores.length === 0) {
    throw new ForbiddenError("Perfil sem permissao para cadastrar escolas");
  }
  return autorizadores;
}

// Etapa 2: o escopo de um acesso com a capacidade precisa cobrir a DRE de
// destino. SEDUC cobre todas; DIRETORIA, só a(s) sua(s).
function exigirEscopoDeCadastro(autorizadores, diretoriaEnsinoId) {
  const cobre = autorizadores.some((acesso) =>
    recursoNoEscopo(buildEscopo([acesso]), { educationDepartmentId: diretoriaEnsinoId })
  );
  if (!cobre) {
    throw new ForbiddenError("Diretoria de ensino fora do escopo do administrador");
  }
}

// Consulta o CEP sem derrubar o cadastro: devolve { consulta } ou { falha }.
async function tentarConsultarCep(cep) {
  try {
    return { consulta: await cepService.consultarCep(cep), falha: null };
  } catch (error) {
    if (
      error instanceof cepService.CepNaoEncontradoError ||
      error instanceof cepService.CepIndisponivelError
    ) {
      return { consulta: null, falha: error };
    }
    throw error;
  }
}

// Sem confirmação explícita, a falha do CEP interrompe o cadastro antes de qualquer escrita.
function erroParaFalhaDeCep(falha) {
  const naoEncontrado = falha instanceof cepService.CepNaoEncontradoError;
  return new AppError(
    naoEncontrado
      ? "CEP nao encontrado. Confira o numero ou confirme o endereco manual"
      : "Nao foi possivel consultar o CEP agora. Tente novamente ou confirme o endereco manual",
    {
      // 404 aqui seria confundido com rota inexistente; para o cadastro é 422.
      statusCode: naoEncontrado ? 422 : falha.statusCode,
      code: falha.code,
      details: {
        alternativa:
          "Envie logradouro, bairro, cidade, uf, latitude, longitude e endereco_manual_confirmado=true",
      },
    }
  );
}

// Decide o endereço final. Informado pelo administrador > BrasilAPI.
function resolverEndereco(dados, consulta, falha) {
  const manualCompleto = Boolean(
    dados.logradouro &&
      dados.bairro &&
      dados.cidade &&
      dados.uf &&
      dados.latitude !== null &&
      dados.longitude !== null
  );

  if (falha && !(dados.enderecoManualConfirmado && manualCompleto)) {
    throw erroParaFalhaDeCep(falha);
  }

  const endereco = {
    logradouro: dados.logradouro ?? consulta?.logradouro ?? null,
    bairro: dados.bairro ?? consulta?.bairro ?? null,
    cidade: dados.cidade ?? consulta?.cidade ?? null,
    uf: dados.uf ?? consulta?.uf ?? null,
  };

  const faltando = Object.entries(endereco)
    .filter(([, valor]) => !valor)
    .map(([campo]) => falhaDeCampo(campo, `${campo} nao veio do CEP; informe manualmente`));
  if (faltando.length > 0) {
    throw new ValidationError("Endereco incompleto", faltando);
  }

  // Latitude/longitude são obrigatórias no schema e definem a cerca do ponto:
  // nunca se grava um valor inventado para "passar".
  let coordenadas;
  if (dados.latitude !== null) {
    coordenadas = {
      latitude: dados.latitude,
      longitude: dados.longitude,
      origemCoordenadas: "MANUAL",
    };
  } else if (consulta && consulta.latitude !== null) {
    coordenadas = {
      latitude: consulta.latitude,
      longitude: consulta.longitude,
      origemCoordenadas: "BRASILAPI",
    };
  } else {
    throw new ValidationError("Coordenadas indisponiveis para este CEP", [
      falhaDeCampo(
        "latitude",
        "O CEP nao possui geolocalizacao; informe latitude e longitude da escola"
      ),
    ]);
  }

  return {
    ...endereco,
    ...coordenadas,
    cepVerificado: Boolean(consulta),
  };
}

// Divergências entre o informado e a BrasilAPI: não bloqueiam, só avisam.
function gerarAvisos(dados, consulta) {
  const avisos = [];
  if (!consulta) {
    avisos.push("CEP nao verificado: endereco e coordenadas foram informados manualmente");
    return avisos;
  }

  if (dados.uf && consulta.uf && dados.uf !== consulta.uf) {
    avisos.push(`UF informada (${dados.uf}) difere da UF do CEP (${consulta.uf})`);
  }
  if (dados.cidade && consulta.cidade && semAcento(dados.cidade) !== semAcento(consulta.cidade)) {
    avisos.push(`Cidade informada difere da cidade do CEP (${consulta.cidade})`);
  }
  if (
    dados.latitude !== null &&
    consulta.latitude !== null &&
    haversineDistanceMeters(
      dados.latitude,
      dados.longitude,
      consulta.latitude,
      consulta.longitude
    ) > DIVERGENCIA_COORDENADAS_METROS
  ) {
    avisos.push("Coordenadas informadas estao distantes das coordenadas do CEP; confira no mapa");
  }
  return avisos;
}

function mapSchoolUnit(linha) {
  return {
    id: Number(linha.id),
    diretoria_ensino_id: Number(linha.diretoria_ensino_id),
    diretoria_ensino_nome: linha.diretoria_ensino_nome,
    nome: linha.nome,
    codigo_inep: linha.codigo_inep,
    cep: linha.cep,
    logradouro: linha.endereco,
    numero: linha.numero,
    bairro: linha.bairro,
    cidade: linha.cidade,
    uf: linha.uf,
    cep_verificado: Boolean(linha.cep_verificado),
    latitude: linha.latitude === null ? null : Number(linha.latitude),
    longitude: linha.longitude === null ? null : Number(linha.longitude),
    origem_coordenadas: linha.origem_coordenadas,
    raio_permitido_metros: Number(linha.raio_permitido_metros),
    ativa: Boolean(linha.ativa),
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
  };
}

// contexto: { adminId, ipOrigem, acessos } — `acessos` vem de req.acessos.
async function createSchoolUnit(payload, contexto = {}) {
  const dados = normalizarEntrada(payload);

  // 1) Quem pode? Antes de validar ou consultar qualquer coisa externa.
  const autorizadores = exigirCapacidadeDeCadastro(contexto.acessos);
  if (Number.isSafeInteger(dados.diretoriaEnsinoId) && dados.diretoriaEnsinoId > 0) {
    exigirEscopoDeCadastro(autorizadores, dados.diretoriaEnsinoId);
  }
  validarEntrada(dados); // DRE malformada é recusada aqui (422).

  const diretoria = await educationDepartmentModel.findById(dados.diretoriaEnsinoId);
  if (!diretoria) {
    throw new ValidationError("Diretoria de ensino nao encontrada", [
      falhaDeCampo("diretoria_ensino_id", "Diretoria de ensino nao encontrada"),
    ]);
  }
  if (!diretoria.ativo) {
    throw new ConflictError("Diretoria de ensino inativa");
  }

  // 2) Consulta externa FORA da transação: não segura lock de banco esperando a rede.
  const { consulta, falha } = await tentarConsultarCep(dados.cep);
  const final = resolverEndereco(dados, consulta, falha);
  const avisos = gerarAvisos(dados, consulta);

  // 3) Grava tudo ou nada. O lock na DRE serializa cadastros concorrentes e
  //    torna confiável a checagem de nome duplicado (não há índice único nele).
  const escolaId = await schoolUnitModel.withTransaction(async (tx) => {
    const diretoriaTravada = await educationDepartmentModel.findByIdForUpdate(
      tx,
      dados.diretoriaEnsinoId
    );
    if (!diretoriaTravada || !diretoriaTravada.ativo) {
      throw new ConflictError("Diretoria de ensino ausente ou inativa");
    }
    if (dados.codigoInep && (await schoolUnitModel.findByCodigoInep(tx, dados.codigoInep))) {
      throw new ConflictError("Codigo INEP ja cadastrado");
    }
    if (await schoolUnitModel.findByNomeNaDiretoria(tx, dados.diretoriaEnsinoId, dados.nome)) {
      throw new ConflictError("Ja existe escola com este nome na diretoria de ensino");
    }

    const resultado = await schoolUnitModel.createSchoolUnit(tx, {
      diretoriaEnsinoId: dados.diretoriaEnsinoId,
      nome: dados.nome,
      codigoInep: dados.codigoInep,
      cep: dados.cep,
      logradouro: final.logradouro,
      numero: dados.numero,
      bairro: final.bairro,
      cidade: final.cidade,
      uf: final.uf,
      cepVerificado: final.cepVerificado,
      latitude: final.latitude,
      longitude: final.longitude,
      origemCoordenadas: final.origemCoordenadas,
      raioPermitidoMetros: dados.raioPermitidoMetros,
    });
    return Number(resultado.insertId);
  });

  const criada = await schoolUnitModel.findAdminById(escolaId);

  await registerAuditLog({
    evento: "escola_criada",
    adminId: contexto.adminId,
    mensagem: "Escola cadastrada",
    ipOrigem: contexto.ipOrigem,
    metadados: {
      escolaId,
      diretoriaEnsinoId: dados.diretoriaEnsinoId,
      cepVerificado: final.cepVerificado,
      origemCoordenadas: final.origemCoordenadas,
      motivoCepNaoVerificado: falha ? falha.code : undefined,
    },
  });

  return { ...mapSchoolUnit(criada), avisos };
}

async function listSchoolUnits(query = {}, escopoUnidades = []) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const offset = (page - 1) * limit;

  const filtros = {
    escopoUnidades,
    diretoriaId: query.diretoria_ensino_id ? Number(query.diretoria_ensino_id) : undefined,
    ativa:
      query.ativa === undefined || query.ativa === ""
        ? undefined
        : query.ativa === true || query.ativa === "true" || query.ativa === "1",
    q: String(query.q || "").trim(),
  };

  const totalRow = await schoolUnitModel.countForAdmin(filtros);
  const linhas = await schoolUnitModel.listForAdmin({ ...filtros, limit, offset });

  return {
    items: linhas.map(mapSchoolUnit),
    pagination: { page, limit, total: Number(totalRow?.total || 0) },
  };
}

// O escopo da unidade já foi validado pelo middleware da rota.
async function getSchoolUnit(escolaId) {
  const linha = await schoolUnitModel.findAdminById(escolaId);
  if (!linha) {
    throw new NotFoundError("Escola nao encontrada");
  }
  return mapSchoolUnit(linha);
}

// DREs onde o administrador pode cadastrar (alimenta o seletor do formulário).
async function listDiretoriasParaCadastro(acessos) {
  const autorizadores = filtrarAcessosPorCapacidade(acessos, CAPACIDADE_CRIAR);
  const escopo = buildEscopo(autorizadores);
  if (!escopo.temAcesso) return [];

  const ativas = await educationDepartmentModel.list({ ativo: true });
  return ativas
    .filter((d) => escopo.isSeduc || escopo.diretoriasPermitidas.has(Number(d.id)))
    .map((d) => ({
      id: Number(d.id),
      nome: d.nome,
      codigo: d.codigo,
      cidade_sede: d.cidade_sede,
    }));
}

// Pré-visualização para o formulário; não grava nada. Erros (404/503/504) seguem para o cliente.
async function previewCep(cep) {
  const dados = await cepService.consultarCep(cep);
  return { ...dados, geolocalizacao_disponivel: dados.latitude !== null };
}

module.exports = {
  createSchoolUnit,
  listSchoolUnits,
  getSchoolUnit,
  listDiretoriasParaCadastro,
  previewCep,
};
