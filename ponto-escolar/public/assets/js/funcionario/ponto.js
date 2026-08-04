'use strict';

const funcionarioToken = sessionStorage.getItem('funcionario_token');

if (!funcionarioToken) {
  window.location.href = '/login';
}

const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

const ETAPAS = Object.freeze([
  {
    tipo: 'ENTRADA',
    campo: 'entrada',
    label: 'Entrada',
    rotuloCard: 'Entrada',
    botao: 'Registrar entrada',
    asset: '/assets/icons/clock.svg'
  },
  {
    tipo: 'SAIDA_ALMOCO',
    campo: 'saida_almoco',
    label: 'Saída para almoço',
    rotuloCard: 'Almoço',
    botao: 'Iniciar almoço',
    asset: '/assets/icons/timer.svg'
  },
  {
    tipo: 'RETORNO_ALMOCO',
    campo: 'retorno_almoco',
    label: 'Retorno do almoço',
    rotuloCard: 'Retorno',
    botao: 'Retornar do almoço',
    asset: '/assets/icons/arrow-up-right.svg'
  },
  {
    tipo: 'SAIDA',
    campo: 'saida',
    label: 'Saída',
    rotuloCard: 'Saída',
    botao: 'Registrar saída',
    asset: '/assets/icons/log-out.svg'
  }
]);

const ETAPAS_POR_TIPO = new Map(ETAPAS.map((etapa) => [etapa.tipo, etapa]));
const TIPOS_PROXIMA_BATIDA = new Set([...ETAPAS_POR_TIPO.keys(), null]);
const CLASSES_ESTADO_BOTAO = [
  'is-loading',
  'is-unavailable',
  'is-registering',
  'is-confirmed',
  'is-sync-pending'
];
const FEEDBACK_REGISTRO_MINIMO_MS = 700;
const ATRASO_REPETICAO_GET_MS = 900;

let estadoHoje = null;
let carregandoHoje = false;
let promessaCarregamentoHoje = null;
let registrando = false;
let registroConfirmadoPendenteAtualizacao = false;
let temporizadorRedirecionamento = null;

class ApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function getElement(id) {
  return document.getElementById(id);
}

function aguardar(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getInitials(nome) {
  return String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((parte) => parte[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'FN';
}

function formatarCargo(cargo) {
  const cargos = {
    FUNCIONARIO: 'Funcionário(a)',
    INSPETOR: 'Inspetor(a)',
    PROFESSOR: 'Professor(a)'
  };
  const normalizado = String(cargo || '').trim().toUpperCase();
  return cargos[normalizado] || normalizado || '—';
}

function formatarHorario(horario) {
  const valor = String(horario || '').trim();
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(valor) ? valor.slice(0, 5) : '--:--';
}

function validarContratoHoje(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    !data.funcionario ||
    !data.jornada ||
    !data.ponto ||
    typeof data.funcionario.nome !== 'string' ||
    typeof data.funcionario.cargo !== 'string' ||
    !TIPOS_PROXIMA_BATIDA.has(data.proxima_batida) ||
    typeof data.jornada_concluida !== 'boolean'
  ) {
    throw new ApiError('A API retornou dados inválidos para o ponto de hoje.', {
      status: 500,
      code: 'INVALID_TODAY_PUNCH_RESPONSE'
    });
  }

  return data;
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${funcionarioToken}`,
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (_error) {
    throw new ApiError('Não foi possível conectar ao servidor.', {
      code: 'NETWORK_ERROR'
    });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new ApiError(
      payload?.error?.message || 'Falha ao comunicar com o servidor.',
      {
        status: response.status,
        code: payload?.error?.code || ''
      }
    );
  }

  return payload.data;
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este aparelho não permite capturar localização.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => reject(new Error('Para bater ponto, permita o acesso à localização.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function atualizarRelogio() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  getElement('hero-clock').textContent = time;
  getElement('hero-weekday').textContent = DIAS_SEMANA[now.getDay()];
  getElement('hero-date').textContent = `${String(now.getDate()).padStart(2, '0')} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

}

function criarSkeleton(variante) {
  const skeleton = document.createElement('span');
  skeleton.className = `employee-skeleton employee-skeleton-${variante}`;
  skeleton.setAttribute('aria-hidden', 'true');
  return skeleton;
}

function definirEstadoBotao(button, ...classes) {
  button.classList.remove(...CLASSES_ESTADO_BOTAO);
  button.classList.add(...classes.filter(Boolean));
}

function anunciarEstadoBotao(mensagem) {
  getElement('ponto-action-announcer').textContent = '';
  window.setTimeout(() => {
    getElement('ponto-action-announcer').textContent = mensagem;
  }, 20);
}

function aplicarEstadoBotao({
  estado,
  texto,
  icone = '/assets/icons/clock.svg',
  desabilitado,
  classes = [],
  anuncio = ''
}) {
  const button = getElement('btn-ponto');
  const estadoAnterior = button.dataset.state;
  const textoAnterior = getElement('btn-label').textContent;
  definirEstadoBotao(button, ...classes);
  button.dataset.state = estado;
  button.disabled = desabilitado;
  button.setAttribute('aria-label', texto);
  getElement('btn-icon').src = icone;
  getElement('btn-label').textContent = texto;
  if (anuncio && (estadoAnterior !== estado || textoAnterior !== texto)) {
    anunciarEstadoBotao(anuncio);
  }
}

function definirBusy(valor) {
  document.querySelectorAll('.journey-card')
    .forEach((elemento) => elemento.setAttribute('aria-busy', String(valor)));
}

function mostrarSkeleton() {
  definirBusy(true);

  const heroName = getElement('hero-name');
  const heroCargo = getElement('hero-cargo');
  heroName.replaceChildren(criarSkeleton('name'));
  heroCargo.replaceChildren(criarSkeleton('role'));

  getElement('tp-avatar').textContent = '—';

  const timeline = getElement('timeline');
  timeline.replaceChildren();
  for (let index = 0; index < 4; index += 1) {
    const step = document.createElement('li');
    step.className = 'journey-step';
    step.append(criarSkeleton('marker'), criarSkeleton('label'), criarSkeleton('time'));
    timeline.appendChild(step);
  }

  getElement('last-action').textContent = 'Carregando registros...';
  getElement('next-label').textContent = 'Carregando jornada';
  getElement('next-time').textContent = '';

  aplicarEstadoBotao({
    estado: 'LOADING',
    texto: 'Carregando',
    desabilitado: true,
    classes: ['is-loading']
  });
}

function renderFuncionario(funcionario) {
  const nome = funcionario.nome.trim();
  const cargo = formatarCargo(funcionario.cargo);
  const iniciais = getInitials(nome);

  getElement('tp-avatar').textContent = iniciais;
  getElement('hero-name').textContent = nome;
  getElement('hero-cargo').textContent = cargo;
}

function criarEtapaJornada(etapa, jornada, ponto, proximaBatida) {
  const horarioRegistrado = ponto[etapa.campo];
  const item = document.createElement('li');
  item.className = 'journey-step';
  if (horarioRegistrado) item.classList.add('is-complete');
  if (proximaBatida === etapa.tipo) item.classList.add('is-current');

  const marker = document.createElement('span');
  marker.className = 'journey-step-marker';

  const icon = document.createElement('img');
  icon.src = etapa.asset;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  marker.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'journey-step-label';
  label.textContent = etapa.rotuloCard;

  const state = document.createElement('span');
  state.className = 'journey-step-state';
  state.textContent = horarioRegistrado ? 'Registrada' : 'Prevista';

  const time = document.createElement('time');
  time.className = 'journey-step-time';
  time.textContent = formatarHorario(horarioRegistrado || jornada[etapa.campo]);

  item.append(marker, label, state, time);
  return item;
}

function renderTimeline(ponto, jornada, proximaBatida) {
  const timeline = getElement('timeline');
  timeline.replaceChildren(
    ...ETAPAS.map((etapa) => criarEtapaJornada(etapa, jornada, ponto, proximaBatida))
  );

  const ultimaBatida = [...ETAPAS]
    .reverse()
    .find((etapa) => Boolean(ponto[etapa.campo]));

  getElement('last-action').textContent = ultimaBatida
    ? `Último registro: ${ultimaBatida.label} às ${formatarHorario(ponto[ultimaBatida.campo])}`
    : 'Nenhum registro hoje';
}

function mostrarEstadoRegistrando(etapa) {
  aplicarEstadoBotao({
    estado: etapa.tipo,
    texto: 'Registrando...',
    icone: etapa.asset,
    desabilitado: true,
    classes: ['is-registering'],
    anuncio: `${etapa.label}: registrando ponto.`
  });
}

function mostrarEstadoConfirmado({ atualizando = false } = {}) {
  const texto = atualizando
    ? 'Registro confirmado — atualizando...'
    : 'Registro confirmado';
  aplicarEstadoBotao({
    estado: atualizando ? 'SYNC_PENDING' : 'CONFIRMADO',
    texto,
    icone: '/assets/icons/circle-check.svg',
    desabilitado: true,
    classes: [atualizando ? 'is-sync-pending' : 'is-confirmed'],
    anuncio: atualizando
      ? 'Registro confirmado. Atualizando os dados da jornada.'
      : 'Registro confirmado com sucesso.'
  });
}

function renderEstado() {
  const nextLabel = getElement('next-label');
  const nextTime = getElement('next-time');

  if (registroConfirmadoPendenteAtualizacao) return;

  if (!estadoHoje) {
    aplicarEstadoBotao({
      estado: 'ERRO',
      texto: 'Ponto indisponível',
      icone: '/assets/icons/circle-x.svg',
      desabilitado: true,
      classes: ['is-unavailable']
    });
    return;
  }

  const proximaBatida = estadoHoje.proxima_batida;
  const etapa = ETAPAS_POR_TIPO.get(proximaBatida);
  const concluida = estadoHoje.jornada_concluida || proximaBatida === null;

  if (concluida) {
    aplicarEstadoBotao({
      estado: 'CONCLUIDA',
      texto: 'Jornada concluída',
      icone: '/assets/icons/circle-check.svg',
      desabilitado: true,
      classes: ['is-unavailable'],
      anuncio: 'Jornada concluída.'
    });
    nextLabel.textContent = 'Todos os registros de hoje foram concluídos';
    nextTime.textContent = '';
    return;
  }

  if (registrando) {
    mostrarEstadoRegistrando(etapa);
    return;
  }

  aplicarEstadoBotao({
    estado: etapa.tipo,
    texto: carregandoHoje ? 'Atualizando...' : etapa.botao,
    icone: etapa.asset,
    desabilitado: carregandoHoje,
    classes: carregandoHoje ? ['is-loading'] : [],
    anuncio: carregandoHoje ? '' : `Próxima ação: ${etapa.botao}.`
  });

  const descricaoPorTipo = {
    ENTRADA: 'Entrada prevista para',
    SAIDA_ALMOCO: 'Almoço previsto para',
    RETORNO_ALMOCO: 'Retorno previsto para',
    SAIDA: 'Saída prevista para'
  };
  nextLabel.textContent = descricaoPorTipo[proximaBatida];
  nextTime.textContent = formatarHorario(estadoHoje.jornada[etapa.campo]);
}

function renderHoje(data) {
  renderFuncionario(data.funcionario);
  renderTimeline(data.ponto, data.jornada, data.proxima_batida);
  renderEstado();
}

function criarEstadoErro(mensagem, permitirRetry) {
  const container = document.createElement('li');
  container.className = 'employee-state employee-state-error';

  const texto = document.createElement('span');
  texto.textContent = mensagem;
  container.appendChild(texto);

  if (permitirRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'employee-button employee-button-primary';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => {
      carregarPontoHoje().catch(() => {});
    });
    container.appendChild(retry);
  }

  return container;
}

function tratarErroCarregamento(error, { notificar = true } = {}) {
  const isUnauthorized = error.status === 401;
  const isForbidden = error.status === 403;
  const isNetwork = error.code === 'NETWORK_ERROR';
  const isInternal = error.status >= 500 || error.status === 0;

  let mensagem = error.message || 'Não foi possível carregar o ponto de hoje.';
  if (isUnauthorized) mensagem = 'Sua sessão expirou. Entre novamente.';
  else if (isForbidden) mensagem = 'Seu acesso ao ponto não está autorizado.';
  else if (isNetwork) mensagem = 'Sem conexão com o servidor. Verifique sua internet.';
  else if (isInternal) mensagem = 'Não foi possível carregar seus dados agora.';

  getElement('hero-name').textContent = '—';
  getElement('hero-cargo').textContent = '—';
  getElement('tp-avatar').textContent = '—';
  const timeline = getElement('timeline');
  timeline.replaceChildren(criarEstadoErro(mensagem, !isUnauthorized && !isForbidden));
  getElement('last-action').textContent = mensagem;
  getElement('next-label').textContent = mensagem;
  getElement('next-time').textContent = '';

  aplicarEstadoBotao({
    estado: 'ERRO',
    texto: 'Ponto indisponível',
    icone: '/assets/icons/circle-x.svg',
    desabilitado: true,
    classes: ['is-unavailable'],
    anuncio: mensagem
  });

  if (notificar) toast(mensagem, 'error');

  if (isUnauthorized && !temporizadorRedirecionamento) {
    temporizadorRedirecionamento = window.setTimeout(sair, 1400);
  }
}

async function buscarPontoHoje() {
  return validarContratoHoje(await apiRequest('/pontos/hoje'));
}

function carregarPontoHoje({
  mostrarCarregamento = true,
  notificarErro = true
} = {}) {
  if (promessaCarregamentoHoje) return promessaCarregamentoHoje;

  carregandoHoje = true;
  if (mostrarCarregamento) mostrarSkeleton();
  else renderEstado();

  promessaCarregamentoHoje = (async () => {
    try {
      const data = await buscarPontoHoje();
      estadoHoje = data;
      renderHoje(data);
      return data;
    } catch (error) {
      estadoHoje = null;
      tratarErroCarregamento(error, { notificar: notificarErro });
      throw error;
    } finally {
      carregandoHoje = false;
      definirBusy(false);
      promessaCarregamentoHoje = null;
      if (estadoHoje) renderEstado();
    }
  })();

  return promessaCarregamentoHoje;
}

function abrirModal() {
  const modal = getElement('confirm-modal');
  modal.classList.add('show');
  if (typeof modal.showModal === 'function' && !modal.open) {
    modal.showModal();
  }
}

function definirDialogOcupado(valor) {
  const modal = getElement('confirm-modal');
  modal.setAttribute('aria-busy', String(valor));
  getElement('confirm-cancel').disabled = valor;
  getElement('confirm-submit').disabled = valor;
}

function mostrarConfirmacaoRegistro() {
  const etapa = ETAPAS_POR_TIPO.get(estadoHoje?.proxima_batida);
  if (!etapa) return;

  getElement('confirm-title').textContent = `Confirmar ${etapa.label.toLowerCase()}`;
  getElement('confirm-time').textContent = formatarHorario(estadoHoje.jornada[etapa.campo]);
  getElement('confirm-sub').textContent = 'A localização será verificada antes de concluir o registro.';
  getElement('confirm-icon').src = etapa.asset;
  getElement('confirm-actions').hidden = false;
  definirDialogOcupado(false);
  abrirModal();
  getElement('confirm-submit').focus();
}

function baterPonto() {
  if (
    !estadoHoje ||
    estadoHoje.proxima_batida === null ||
    estadoHoje.jornada_concluida ||
    registrando ||
    carregandoHoje
  ) {
    return;
  }

  mostrarConfirmacaoRegistro();
}

function aplicarJornadaAtualizada(data) {
  estadoHoje = data;
  registroConfirmadoPendenteAtualizacao = false;
  registrando = false;
  renderHoje(data);
}

async function sincronizarAposRegistro(confirmadoEm) {
  let dataAtualizada = null;

  try {
    dataAtualizada = await buscarPontoHoje();
  } catch (_error) {
    dataAtualizada = null;
  }

  const tempoDecorrido = window.performance.now() - confirmadoEm;
  await aguardar(Math.max(FEEDBACK_REGISTRO_MINIMO_MS - tempoDecorrido, 0));

  if (dataAtualizada) {
    aplicarJornadaAtualizada(dataAtualizada);
    return true;
  }

  mostrarEstadoConfirmado({ atualizando: true });
  await aguardar(ATRASO_REPETICAO_GET_MS);

  try {
    dataAtualizada = await buscarPontoHoje();
    aplicarJornadaAtualizada(dataAtualizada);
    return true;
  } catch (error) {
    toast(
      'Registro confirmado, mas ainda não foi possível atualizar a jornada. Recarregue a página para consultar o estado atual.',
      'error'
    );
    if (error.status === 401 && !temporizadorRedirecionamento) {
      temporizadorRedirecionamento = window.setTimeout(sair, 1400);
    }
    return false;
  }
}

function mensagemSeguraRegistro(error) {
  if (error.status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (error.status === 403) return 'Seu acesso ao registro de ponto não está autorizado.';
  if (error.code === 'NETWORK_ERROR') {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (error.status >= 500) return 'Não foi possível registrar o ponto agora. Tente novamente.';
  return error.message || 'Falha ao registrar ponto.';
}

async function confirmarRegistroPonto() {
  if (
    !estadoHoje ||
    estadoHoje.proxima_batida === null ||
    estadoHoje.jornada_concluida ||
    registrando ||
    carregandoHoje
  ) {
    return;
  }

  if (!navigator.onLine) {
    toast('Sem internet. Verifique sua conexão e tente novamente.', 'error');
    return;
  }

  const etapa = ETAPAS_POR_TIPO.get(estadoHoje.proxima_batida);
  registrando = true;
  definirDialogOcupado(true);
  fecharConfirm();
  mostrarEstadoRegistrando(etapa);

  try {
    const location = await getCurrentLocation();
    await apiRequest('/pontos/registrar', {
      method: 'POST',
      body: { ...location }
    });
  } catch (error) {
    registrando = false;
    definirDialogOcupado(false);
    renderEstado();
    toast(mensagemSeguraRegistro(error), 'error');
    if (error.status === 401) {
      window.setTimeout(sair, 1400);
    }
    return;
  }

  registroConfirmadoPendenteAtualizacao = true;
  const confirmadoEm = window.performance.now();
  mostrarEstadoConfirmado();
  await sincronizarAposRegistro(confirmadoEm);
}

function fecharConfirm() {
  const modal = getElement('confirm-modal');
  if (modal.open) modal.close();
  modal.classList.remove('show');
}

function toast(msg, tipo = 'info') {
  const icons = { success: 'OK', error: 'ER', info: 'IN', warning: 'AT' };
  const element = document.createElement('div');
  element.className = `toast toast-${tipo}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = icons[tipo] || icons.info;

  const message = document.createElement('span');
  message.className = 'toast-msg';
  message.textContent = String(msg || '');

  element.append(icon, message);
  getElement('toast-stack').appendChild(element);
  window.setTimeout(() => element.remove(), 3500);
}

function sair() {
  sessionStorage.removeItem('funcionario_token');
  sessionStorage.removeItem('funcionario_data');
  sessionStorage.removeItem('func_nome');
  sessionStorage.removeItem('func_cpf');
  window.location.href = '/login';
}

if (funcionarioToken) {
  getElement('confirm-modal').addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!registrando) fecharConfirm();
  });
  setInterval(atualizarRelogio, 1000);
  atualizarRelogio();
  mostrarSkeleton();
  carregarPontoHoje({ mostrarCarregamento: false }).catch(() => {});
}
