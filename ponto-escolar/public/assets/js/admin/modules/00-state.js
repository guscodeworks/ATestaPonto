/**
 * ============================================================
 * SISTEMA DE PONTO — SALA DO FUTURO
 * Lógica compartilhada da área administrativa
 * ============================================================
 */

'use strict';

/* ============================================================
   ESTADO GLOBAL (carregado pelas APIs reais do back-end)
   ============================================================ */
const ADMIN = {
  nome: 'Administrador',
  cargo: 'Administrador',
};

// Estado em memória da tela administrativa. É preenchido pelas funções
// carregarXxxAdmin() e consumido pelas funções renderizarXxx() (definidas
// em outro arquivo). Mantido fora de qualquer módulo/classe para permitir
// acesso direto pelos handlers de renderização já existentes na página.
let FUNCIONARIOS = [];
let PONTOS_HOJE = [];
let AUSENTES_HOJE = [];
let RELATORIO_PONTOS = [];
let RESUMO_PONTOS = {
  total_funcionarios: 0,
  total_ativos: 0,
  presentes: 0,
  ausentes: 0,
  taxa_presenca_percent: 0,
};
let DATA_REFERENCIA_PONTOS = null;
let DATA_REFERENCIA_RELATORIO = null;
let ADMIN_DATA_ERROR = null;
let FUNCIONARIOS_DATA_ERROR = null;
let PONTOS_HOJE_DATA_ERROR = null;
let RESUMO_DATA_ERROR = null;
let RELATORIO_DATA_ERROR = null;
let FUNCIONARIOS_LOADING = false;
let FUNCIONARIOS_TOTAL_SISTEMA = null;
let FUNCIONARIOS_TOTAL_FILTRADO = 0;
let FUNCIONARIOS_REQUEST_ID = 0;
let FUNCIONARIOS_ABORT_CONTROLLER = null;
let ADMIN_DATA_LOADING = false;
let ADMIN_DATA_REQUEST_ID = 0;
let ADMIN_DATA_ABORT_CONTROLLER = null;

const ADMIN_ENDPOINTS = {
  cargos: '/api/admin/cargos',
  funcionarios: '/api/admin/funcionarios',
  pontosHoje: '/api/admin/pontos/hoje',
  pontosRelatorio: '/api/admin/pontos/relatorio',
  pontosResumo: '/api/admin/pontos/resumo',
};

function redirecionarAdminParaGovbr(
  destino = '/auth/govbr/login',
  mensagem = 'Redirecionando para o Gov.br...'
) {
  const caminhoSeguro = destino === '/auth/govbr/logout'
    ? '/auth/govbr/logout'
    : '/auth/govbr/login';
  document.documentElement.setAttribute('data-admin-session', 'pending');

  if (typeof iniciarCarregamentoGlobal !== 'function') {
    window.location.replace(caminhoSeguro);
    return null;
  }

  const overlay = iniciarCarregamentoGlobal({
    titulo: 'Aguarde',
    mensagem,
    atrasoMs: 0,
  });
  window.requestAnimationFrame(() => {
    window.setTimeout(() => window.location.replace(caminhoSeguro), 0);
  });

  // Caso o navegador não conclua a navegação, o overlay deixa de ser um
  // estado sem saída e oferece uma nova tentativa ou retorno à tela pública.
  window.setTimeout(() => {
    atualizarCarregamentoGlobal(overlay, {
      estado: 'erro',
      titulo: 'O redirecionamento está demorando',
      mensagem: 'Tente novamente ou volte para a tela de acesso.',
      aoTentarNovamente: () => redirecionarAdminParaGovbr(caminhoSeguro, mensagem),
      aoSair: () => window.location.replace('/'),
      textoSair: 'Voltar ao acesso',
    });
  }, 10000);
  return overlay;
}

// Alguns endpoints retornam o payload envolto em { data: ... } e outros
// retornam o objeto diretamente. Esta função normaliza os dois formatos
// para que o restante do código não precise se preocupar com isso.
function getApiData(payload) {
  return payload && payload.data ? payload.data : payload;
}

async function adminApiFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers,
    });
  } catch (networkError) {
    if (networkError?.name === 'AbortError') throw networkError;
    const error = new Error('Nao foi possivel conectar ao servidor. Verifique sua conexao e tente novamente.');
    error.status = 0;
    error.code = 'NETWORK_ERROR';
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const validationMessage =
      payload?.error?.details?.[0]?.message ||
      payload?.errors?.[0]?.msg;
    const apiMessage = payload?.error?.message || payload?.message;
    let message;

    if (response.status === 401) {
      message = 'Sessao administrativa expirada ou invalida. Entre novamente.';
    } else if (response.status === 403) {
      message = 'Usuario sem permissao para realizar esta operacao.';
    } else if (response.status === 400 || response.status === 422) {
      message = validationMessage || apiMessage || 'Dados enviados sao invalidos.';
    } else if (response.status >= 500) {
      message = 'Erro interno do servidor. Tente novamente mais tarde.';
    } else {
      message = apiMessage || `Falha na API (${response.status})`;
    }

    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || `HTTP_${response.status}`;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function carregarFuncionariosAdmin(filters = {}, options = {}) {
  const requestId = ++FUNCIONARIOS_REQUEST_ID;
  const params = new URLSearchParams({ page: '1', limit: '100' });
  const search = String(filters.q || '').trim();
  const cpfSearch = /^[\d.\-\s]+$/.test(search)
    ? search.replace(/\D/g, '')
    : '';
  const status = String(filters.status || '').trim();
  const cargo = String(filters.cargo || '').trim().toUpperCase();

  if (search) params.set('q', cpfSearch || search);
  if (status === 'ativo' || status === 'true') params.set('ativo', 'true');
  if (status === 'inativo' || status === 'false') params.set('ativo', 'false');
  if (cargo) params.set('cargo', cargo);

  const loadPage = async (page) => {
    const pageParams = new URLSearchParams(params);
    pageParams.set('page', String(page));
    const payload = await adminApiFetch(
      `${ADMIN_ENDPOINTS.funcionarios}?${pageParams.toString()}`,
      { signal: options.signal }
    );
    return getApiData(payload);
  };

  try {
    const firstPage = await loadPage(1);
    const parsedTotal = Number(firstPage?.pagination?.total || 0);
    const total = Number.isFinite(parsedTotal) ? Math.max(parsedTotal, 0) : 0;
    const pageLimit = Math.max(
      Number(firstPage?.pagination?.limit || 100) || 100,
      1
    );
    const totalPages = Math.max(Math.ceil(total / pageLimit), 1);
    const remainingPages = totalPages > 1
      ? await Promise.all(
          Array.from({ length: totalPages - 1 }, (_item, index) =>
            loadPage(index + 2)
          )
        )
      : [];

    if (requestId !== FUNCIONARIOS_REQUEST_ID) return false;

    const items = [firstPage, ...remainingPages].flatMap((page) =>
      Array.isArray(page?.items) ? page.items : []
    );
    FUNCIONARIOS = items.map(normalizarFuncionarioApi);
    FUNCIONARIOS_TOTAL_FILTRADO = total;
    FUNCIONARIOS_DATA_ERROR = null;

    if (!search && !status && !cargo) {
      FUNCIONARIOS_TOTAL_SISTEMA = total;
    }

    return true;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (requestId === FUNCIONARIOS_REQUEST_ID) {
      FUNCIONARIOS = [];
      FUNCIONARIOS_TOTAL_FILTRADO = 0;
      FUNCIONARIOS_DATA_ERROR = error;
    }
    throw error;
  }
}

async function carregarPontosHojeAdmin(options = {}) {
  try {
    const payload = await adminApiFetch(ADMIN_ENDPOINTS.pontosHoje, {
      signal: options.signal,
    });
    const data = getApiData(payload);
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;

    DATA_REFERENCIA_PONTOS = data?.data_referencia || null;
    RESUMO_PONTOS = normalizarResumoApi(data?.resumo);
    PONTOS_HOJE = Array.isArray(data?.presentes)
      ? data.presentes.map(normalizarResumoPontoApi)
      : [];
    // Reaproveita o normalizador de pontos e extrai apenas o funcionário,
    // já que a API devolve os ausentes no mesmo formato de registro de ponto.
    AUSENTES_HOJE = Array.isArray(data?.ausentes)
      ? data.ausentes.map((item) => normalizarResumoPontoApi(item).funcionario)
      : [];
    PONTOS_HOJE_DATA_ERROR = null;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;
    PONTOS_HOJE = [];
    AUSENTES_HOJE = [];
    PONTOS_HOJE_DATA_ERROR = error;
    throw error;
  }
}

async function carregarResumoAdmin(options = {}) {
  try {
    const payload = await adminApiFetch(ADMIN_ENDPOINTS.pontosResumo, {
      signal: options.signal,
    });
    const data = getApiData(payload);
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;

    // Mantém a data de referência anterior caso a API não retorne uma nova,
    // evitando que a tela fique sem data de referência entre chamadas.
    DATA_REFERENCIA_PONTOS = data?.data_referencia || DATA_REFERENCIA_PONTOS;
    RESUMO_PONTOS = normalizarResumoApi(data?.resumo);
    RESUMO_DATA_ERROR = null;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;
    RESUMO_DATA_ERROR = error;
    throw error;
  }
}

async function carregarRelatorioAdmin(dataReferencia, options = {}) {
  try {
    const query = dataReferencia ? `?data=${encodeURIComponent(dataReferencia)}` : '';
    const payload = await adminApiFetch(`${ADMIN_ENDPOINTS.pontosRelatorio}${query}`, {
      signal: options.signal,
    });
    const data = getApiData(payload);
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;

    DATA_REFERENCIA_RELATORIO = data?.data_referencia || null;
    RESUMO_PONTOS = normalizarResumoApi(data?.resumo);
    RELATORIO_PONTOS = Array.isArray(data?.items)
      ? data.items.map(normalizarResumoPontoApi)
      : [];
    RELATORIO_DATA_ERROR = null;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;
    RELATORIO_DATA_ERROR = error;
    throw error;
  }
}

async function carregarDadosAdmin(options = {}) {
  const requestId = ++ADMIN_DATA_REQUEST_ID;
  ADMIN_DATA_ABORT_CONTROLLER?.abort();
  const controller = new AbortController();
  ADMIN_DATA_ABORT_CONTROLLER = controller;
  ADMIN_DATA_LOADING = true;
  ADMIN_DATA_ERROR = null;

  // Cada seção da tela é opcional e independente, permitindo que telas
  // diferentes chamem essa função pedindo só os dados que precisam.
  const includeEmployees = options.includeEmployees !== false;
  const includeToday = options.includeToday !== false;
  const includeSummary = options.includeSummary === true;
  const includeReport = options.includeReport === true;
  const loaders = [];

  const requestOptions = { signal: controller.signal, requestId };
  if (includeEmployees) loaders.push(carregarFuncionariosAdmin({}, requestOptions));
  if (includeToday) loaders.push(carregarPontosHojeAdmin(requestOptions));
  if (includeSummary) loaders.push(carregarResumoAdmin(requestOptions));
  if (includeReport) loaders.push(carregarRelatorioAdmin(options.dataReferencia, requestOptions));

  try {
    if (!loaders.length) return true;

    // Promise.allSettled é usado (em vez de Promise.all) para que todas as
    // requisições sejam disparadas em paralelo e o motivo específico da
    // falha possa ser inspecionado, mesmo que outras tenham dado certo.
    const results = await Promise.allSettled(loaders);
    if (requestId !== ADMIN_DATA_REQUEST_ID) return false;
    const rejected = results.find((result) => result.status === 'rejected');

    if (rejected) {
      if (rejected.reason?.name === 'AbortError') return false;
      ADMIN_DATA_ERROR = rejected.reason;
      // Sessão expirada/inválida: redireciona para o fluxo de login do gov.br.
      if (ADMIN_DATA_ERROR.status === 401) {
        redirecionarAdminParaGovbr();
      }
      return false;
    }

    sincronizarFuncionariosNosPontos();
    return true;
  } finally {
    if (requestId === ADMIN_DATA_REQUEST_ID) {
      ADMIN_DATA_LOADING = false;
      if (ADMIN_DATA_ABORT_CONTROLLER === controller) {
        ADMIN_DATA_ABORT_CONTROLLER = null;
      }
    }
  }
}

function sincronizarFuncionariosNosPontos() {
  // getFuncionarioPorId depende da lista FUNCIONARIOS já carregada; se a
  // função ainda não existir no escopo, aborta para não quebrar a tela.
  if (typeof getFuncionarioPorId !== 'function') return;

  // Os endpoints de ponto retornam apenas o ID do funcionário; aqui os
  // registros são enriquecidos com o objeto completo do funcionário,
  // já carregado separadamente, para uso direto na renderização.
  PONTOS_HOJE = PONTOS_HOJE.map((ponto) => ({
    ...ponto,
    funcionario: getFuncionarioPorId(ponto.funcionarioId) || ponto.funcionario,
  }));
  AUSENTES_HOJE = AUSENTES_HOJE.map((funcionario) =>
    getFuncionarioPorId(funcionario.id) || funcionario
  );
  RELATORIO_PONTOS = RELATORIO_PONTOS.map((ponto) => ({
    ...ponto,
    funcionario: getFuncionarioPorId(ponto.funcionarioId) || ponto.funcionario,
  }));
}

async function recarregarDadosAdminTela() {
  await carregarDadosAdmin({
    includeEmployees: true,
    includeToday: true,
    includeSummary: true,
    // O relatório só é buscado se a tabela correspondente existir no DOM,
    // evitando uma chamada de API desnecessária em telas que não a exibem.
    includeReport: Boolean(document.getElementById('tbody-relatorio')),
  });

  if (typeof renderizarStats === 'function') renderizarStats();
  if (typeof renderizarUltimosRegistros === 'function') renderizarUltimosRegistros();
  if (typeof renderizarGrafico === 'function') renderizarGrafico();
  if (typeof renderizarAlertas === 'function') renderizarAlertas();
  if (typeof renderizarFuncionarios === 'function') renderizarFuncionarios();
  if (typeof renderizarPontosHoje === 'function') renderizarPontosHoje();
  if (typeof renderizarRelatorio === 'function') renderizarRelatorio();
}
