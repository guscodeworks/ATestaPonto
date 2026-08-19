'use strict';

const funcionarioToken = sessionStorage.getItem('funcionario_token');
const REPORT_STATE_IDS = [
  'report-loading',
  'report-empty',
  'report-error',
  'report-day-list'
];

let historyController = null;
let historyRequestId = 0;

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
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valores.year}-${valores.month}`;
}

function mesValido(mes) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ''));
}

function normalizarMesSelecionado() {
  const campo = getElement('report-month');
  const mesAtual = obterMesAtual();
  const valor = campo.value;
  const mesSeguro = !mesValido(valor) || valor > mesAtual ? mesAtual : valor;
  campo.max = mesAtual;
  campo.value = mesSeguro;
  return mesSeguro;
}

function formatarData(dataReferencia) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataReferencia || ''));
  if (!match) return 'Data não informada';

  const data = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  }).format(data).replace('.', '');
}

function formatarHorario(horario) {
  const valor = String(horario || '').trim();
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(valor) ? valor.slice(0, 5) : '—';
}

function formatarMinutos(minutos) {
  if (!Number.isInteger(minutos) || minutos < 0) return '—';

  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;
  if (horas === 0) return `${restantes} min`;
  if (restantes === 0) return `${horas}h`;
  return `${horas}h ${restantes}min`;
}

function mostrarEstado(activeId) {
  REPORT_STATE_IDS.forEach((id) => {
    getElement(id).hidden = id !== activeId;
  });
}

function definirResumo({ dias = '—', minutos = '—' } = {}) {
  definirTexto('summary-records', dias);
  definirTexto('summary-worked', minutos);
}

function criarErro(mensagem, status = 0) {
  const error = new Error(mensagem);
  error.status = status;
  return error;
}

function validarHistorico(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    !mesValido(data.periodo) ||
    !data.resumo ||
    !Array.isArray(data.registros) ||
    !Number.isInteger(data.resumo.dias_com_registro) ||
    !Number.isInteger(data.resumo.total_minutos)
  ) {
    throw criarErro('Resposta de histórico inválida.');
  }

  return data;
}

async function buscarHistorico(mes, signal) {
  const response = await fetch(`/api/pontos/historico?mes=${encodeURIComponent(mes)}`, {
    headers: {
      Authorization: `Bearer ${funcionarioToken}`
    },
    signal
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success !== true) {
    throw criarErro('Não foi possível carregar o histórico.', response.status);
  }

  return validarHistorico(payload.data);
}

async function buscarIdentidadeAtual() {
  const response = await fetch('/api/pontos/hoje', {
    headers: {
      Authorization: `Bearer ${funcionarioToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success !== true) {
    throw criarErro('Não foi possível carregar a identidade.', response.status);
  }

  const funcionario = payload?.data?.funcionario;
  if (!funcionario || typeof funcionario.nome !== 'string' || typeof funcionario.cargo !== 'string') {
    throw criarErro('Resposta de identidade inválida.');
  }

  return funcionario;
}

function renderizarIdentidade(funcionario) {
  const nome = funcionario.nome.trim() || 'Não informado';
  definirTexto('header-avatar', obterIniciais(nome));
  definirTexto('header-name', nome);
  definirTexto('header-cargo', formatarCargo(funcionario.cargo));
  definirTexto('sidebar-welcome-name', nome);
}

function criarHorario(label, horario) {
  const item = document.createElement('div');
  item.className = 'report-day-time';

  const titulo = document.createElement('span');
  titulo.textContent = label;
  const valor = document.createElement('time');
  valor.textContent = formatarHorario(horario);

  item.append(titulo, valor);
  return item;
}

function criarRegistroDia(registro) {
  const artigo = document.createElement('article');
  const completo = registro.status === 'COMPLETO';
  artigo.className = `report-day-card ${completo ? 'is-complete' : 'is-incomplete'}`;

  const cabecalho = document.createElement('header');
  cabecalho.className = 'report-day-header';
  const data = document.createElement('time');
  data.className = 'report-day-date';
  data.textContent = formatarData(registro.data_referencia);
  const status = document.createElement('span');
  status.className = 'report-day-status';
  status.textContent = completo ? 'COMPLETO' : 'INCOMPLETO';
  cabecalho.append(data, status);

  const horarios = document.createElement('div');
  horarios.className = 'report-day-times';
  horarios.append(
    criarHorario('Entrada', registro.entrada),
    criarHorario('Saída almoço', registro.saida_almoco),
    criarHorario('Retorno', registro.retorno_almoco),
    criarHorario('Saída', registro.saida)
  );

  const total = document.createElement('footer');
  total.className = 'report-day-total';
  const rotulo = document.createElement('span');
  rotulo.textContent = 'Total do dia';
  const valor = document.createElement('strong');
  valor.textContent = formatarMinutos(registro.total_minutos);
  total.append(rotulo, valor);

  artigo.append(cabecalho, horarios, total);
  return artigo;
}

function renderizarHistorico(data) {
  definirResumo({
    dias: String(data.resumo.dias_com_registro),
    minutos: formatarMinutos(data.resumo.total_minutos)
  });

  if (data.registros.length === 0) {
    mostrarEstado('report-empty');
    return;
  }

  getElement('report-day-list').replaceChildren(
    ...data.registros.map(criarRegistroDia)
  );
  mostrarEstado('report-day-list');
}

function sair() {
  sessionStorage.removeItem('funcionario_token');
  sessionStorage.removeItem('funcionario_data');
  sessionStorage.removeItem('func_nome');
  sessionStorage.removeItem('func_cpf');
  window.location.replace('/login');
}

async function carregarHistorico(mes) {
  if (historyController) historyController.abort();

  const requestId = ++historyRequestId;
  const controller = new AbortController();
  historyController = controller;
  definirResumo();
  mostrarEstado('report-loading');
  getElement('report-content').setAttribute('aria-busy', 'true');

  try {
    const data = await buscarHistorico(mes, controller.signal);
    if (controller.signal.aborted || requestId !== historyRequestId || getElement('report-month').value !== mes) {
      return;
    }
    if (data.periodo !== mes) {
      throw criarErro('Resposta de histórico para período diferente.');
    }
    renderizarHistorico(data);
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted || requestId !== historyRequestId) {
      return;
    }
    if (error.status === 401 || error.status === 403) {
      sair();
      return;
    }
    mostrarEstado('report-error');
  } finally {
    if (requestId === historyRequestId) {
      historyController = null;
      getElement('report-content').setAttribute('aria-busy', 'false');
    }
  }
}

async function carregarIdentidade() {
  try {
    renderizarIdentidade(await buscarIdentidadeAtual());
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      sair();
      return;
    }
    definirTexto('header-avatar', '—');
    definirTexto('header-name', 'Não informado');
    definirTexto('header-cargo', 'Não informado');
    definirTexto('sidebar-welcome-name', 'Não informado');
  }
}

const monthField = getElement('report-month');
monthField.value = obterMesAtual();
monthField.max = monthField.value;
monthField.addEventListener('change', () => {
  carregarHistorico(normalizarMesSelecionado());
});
getElement('report-retry').addEventListener('click', () => {
  carregarHistorico(normalizarMesSelecionado());
});
getElement('employee-logout').addEventListener('click', sair);

if (funcionarioToken) {
  carregarIdentidade();
  carregarHistorico(normalizarMesSelecionado());
}
