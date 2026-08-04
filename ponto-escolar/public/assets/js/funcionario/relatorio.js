'use strict';

const funcionarioToken = sessionStorage.getItem('funcionario_token');
const REPORT_STATE_IDS = [
  'report-loading',
  'report-empty',
  'report-error',
  'report-unavailable',
  'report-day-list'
];

let carregandoIdentidade = false;

if (!funcionarioToken) {
  window.location.replace('/login');
}

function getElement(id) {
  return document.getElementById(id);
}

function definirTexto(id, value) {
  const element = getElement(id);
  if (element) element.textContent = value;
}

function obterIniciais(nome) {
  const partes = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!partes.length) return '—';

  return partes
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toUpperCase();
}

function formatarCargo(cargo) {
  const cargos = {
    FUNCIONARIO: 'Funcionário(a)',
    INSPETOR: 'Inspetor(a)',
    PROFESSOR: 'Professor(a)'
  };
  const valor = String(cargo || '').trim().toUpperCase();
  return cargos[valor] || valor || 'Não informado';
}

function obterMesAtual() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatarMes(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) return 'Não informado';

  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function mostrarEstado(activeId) {
  REPORT_STATE_IDS.forEach((id) => {
    getElement(id).hidden = id !== activeId;
  });
}

function atualizarResumoIndisponivel() {
  const month = getElement('report-month').value;
  definirTexto('summary-period', formatarMes(month));
  definirTexto('summary-records', 'Não disponível');
  definirTexto('summary-worked', 'Não disponível');
  definirTexto('history-count', '—');
}

function mostrarHistoricoIndisponivel() {
  atualizarResumoIndisponivel();
  mostrarEstado('report-unavailable');
  getElement('report-content').setAttribute('aria-busy', 'false');
}

async function buscarIdentidadeAtual() {
  const response = await fetch('/api/pontos/hoje', {
    headers: {
      Authorization: `Bearer ${funcionarioToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const error = new Error('IDENTITY_REQUEST_FAILED');
    error.status = response.status;
    throw error;
  }

  const funcionario = payload?.data?.funcionario;
  if (
    !funcionario ||
    typeof funcionario.nome !== 'string' ||
    typeof funcionario.cargo !== 'string'
  ) {
    throw new Error('INVALID_IDENTITY_RESPONSE');
  }

  return funcionario;
}

function renderizarIdentidade(funcionario) {
  const nome = funcionario.nome.trim() || 'Não informado';
  definirTexto('header-avatar', obterIniciais(nome));
  definirTexto('header-name', nome);
  definirTexto('header-cargo', formatarCargo(funcionario.cargo));
}

function sair() {
  sessionStorage.removeItem('funcionario_token');
  sessionStorage.removeItem('funcionario_data');
  sessionStorage.removeItem('func_nome');
  sessionStorage.removeItem('func_cpf');
  window.location.replace('/login');
}

async function iniciarRelatorio() {
  if (carregandoIdentidade) return;

  carregandoIdentidade = true;
  mostrarEstado('report-loading');
  getElement('report-content').setAttribute('aria-busy', 'true');

  try {
    const funcionario = await buscarIdentidadeAtual();
    renderizarIdentidade(funcionario);
    mostrarHistoricoIndisponivel();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      sair();
      return;
    }

    definirTexto('header-avatar', '—');
    definirTexto('header-name', 'Não informado');
    definirTexto('header-cargo', 'Não informado');
    atualizarResumoIndisponivel();
    mostrarEstado('report-error');
    getElement('report-content').setAttribute('aria-busy', 'false');
  } finally {
    carregandoIdentidade = false;
  }
}

const monthField = getElement('report-month');
const currentMonth = obterMesAtual();
monthField.value = currentMonth;
monthField.max = currentMonth;
monthField.addEventListener('change', mostrarHistoricoIndisponivel);
getElement('report-retry').addEventListener('click', iniciarRelatorio);

if (funcionarioToken) {
  iniciarRelatorio();
}
