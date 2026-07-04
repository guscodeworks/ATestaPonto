/**
 * ============================================================
 * SISTEMA DE PONTO — SALA DO FUTURO
 * admin-main.js — Lógica da área administrativa
 * ============================================================
 */

'use strict';

/* ============================================================
   ESTADO GLOBAL (carregado pelas APIs reais do back-end)
   ============================================================ */
const togglePwButton = document.getElementById('toggle-pw');
if (togglePwButton) {
  togglePwButton.addEventListener('click', function() {
    const inp = document.getElementById('login-senha');
    if (!inp) {
      return;
    }
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    this.textContent = isHidden ? '🙈' : '👁';
  });
}
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

const ADMIN_ENDPOINTS = {
  funcionarios: '/api/admin/funcionarios',
  pontosHoje: '/api/admin/pontos/hoje',
  pontosRelatorio: '/api/admin/pontos/relatorio',
  pontosResumo: '/api/admin/pontos/resumo',
};

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

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    // Ordem de fallback: cobre os diferentes formatos de erro que a API
    // pode retornar (mensagem simples, erro estruturado ou lista de
    // erros de validação), garantindo uma mensagem legível em qualquer caso.
    const message =
      payload?.message ||
      payload?.error?.message ||
      payload?.errors?.[0]?.msg ||
      `Falha na API (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function carregarFuncionariosAdmin() {
  // limit=100: paginação simplificada, assume que a base de funcionários
  // não ultrapassa esse volume nesta tela administrativa.
  const payload = await adminApiFetch(`${ADMIN_ENDPOINTS.funcionarios}?limit=100`);
  const data = getApiData(payload);
  FUNCIONARIOS = Array.isArray(data?.items)
    ? data.items.map(normalizarFuncionarioApi)
    : [];
}

async function carregarPontosHojeAdmin() {
  const payload = await adminApiFetch(ADMIN_ENDPOINTS.pontosHoje);
  const data = getApiData(payload);

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
}

async function carregarResumoAdmin() {
  const payload = await adminApiFetch(ADMIN_ENDPOINTS.pontosResumo);
  const data = getApiData(payload);

  // Mantém a data de referência anterior caso a API não retorne uma nova,
  // evitando que a tela fique sem data de referência entre chamadas.
  DATA_REFERENCIA_PONTOS = data?.data_referencia || DATA_REFERENCIA_PONTOS;
  RESUMO_PONTOS = normalizarResumoApi(data?.resumo);
}

async function carregarRelatorioAdmin(dataReferencia) {
  const query = dataReferencia ? `?data=${encodeURIComponent(dataReferencia)}` : '';
  const payload = await adminApiFetch(`${ADMIN_ENDPOINTS.pontosRelatorio}${query}`);
  const data = getApiData(payload);

  DATA_REFERENCIA_RELATORIO = data?.data_referencia || null;
  RESUMO_PONTOS = normalizarResumoApi(data?.resumo);
  RELATORIO_PONTOS = Array.isArray(data?.items)
    ? data.items.map(normalizarResumoPontoApi)
    : [];
}

async function carregarDadosAdmin(options = {}) {
  ADMIN_DATA_ERROR = null;

  // Cada seção da tela é opcional e independente, permitindo que telas
  // diferentes chamem essa função pedindo só os dados que precisam.
  const includeEmployees = options.includeEmployees !== false;
  const includeToday = options.includeToday !== false;
  const includeSummary = options.includeSummary === true;
  const includeReport = options.includeReport === true;
  const loaders = [];

  if (includeEmployees) loaders.push(carregarFuncionariosAdmin());
  if (includeToday) loaders.push(carregarPontosHojeAdmin());
  if (includeSummary) loaders.push(carregarResumoAdmin());
  if (includeReport) loaders.push(carregarRelatorioAdmin(options.dataReferencia));

  if (!loaders.length) {
    return true;
  }

  // Promise.allSettled é usado (em vez de Promise.all) para que todas as
  // requisições sejam disparadas em paralelo e o motivo específico da
  // falha possa ser inspecionado, mesmo que outras tenham dado certo.
  const results = await Promise.allSettled(loaders);
  const rejected = results.find((result) => result.status === 'rejected');

  if (rejected) {
    ADMIN_DATA_ERROR = rejected.reason;
    // Sessão expirada/inválida: redireciona para o fluxo de login do gov.br.
    if (ADMIN_DATA_ERROR.status === 401) {
      window.location.replace('/auth/govbr/login');
    }
    return false;
  }

  sincronizarFuncionariosNosPontos();
  return true;
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