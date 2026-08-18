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
    botao: 'REGISTRAR ENTRADA',
    confirmacao: 'Registrar entrada?',
    asset: '/assets/icons/clock.svg'
  },
  {
    tipo: 'SAIDA_ALMOCO',
    campo: 'saida_almoco',
    label: 'Saída para almoço',
    rotuloCard: 'Almoço',
    botao: 'INICIAR ALMOÇO',
    confirmacao: 'Iniciar almoço?',
    asset: '/assets/icons/timer.svg'
  },
  {
    tipo: 'RETORNO_ALMOCO',
    campo: 'retorno_almoco',
    label: 'Retorno do almoço',
    rotuloCard: 'Retorno',
    botao: 'RETORNAR DO ALMOÇO',
    confirmacao: 'Retornar do almoço?',
    asset: '/assets/icons/arrow-up-right.svg'
  },
  {
    tipo: 'SAIDA',
    campo: 'saida',
    label: 'Saída',
    rotuloCard: 'Saída',
    botao: 'REGISTRAR SAÍDA',
    confirmacao: 'Registrar saída?',
    asset: '/assets/icons/log-out.svg'
  }
]);

const ETAPAS_POR_TIPO = new Map(ETAPAS.map((etapa) => [etapa.tipo, etapa]));
const TIPOS_PROXIMA_BATIDA = new Set([
  ...ETAPAS_POR_TIPO.keys(),
  'CONCLUIDO',
  null
]);
const CLASSE_ACAO_POR_TIPO = Object.freeze({
  ENTRADA: 'is-entrada',
  SAIDA_ALMOCO: 'is-saida-almoco',
  RETORNO_ALMOCO: 'is-retorno-almoco',
  SAIDA: 'is-saida',
  CONCLUIDO: 'is-concluido',
  CONCLUIDA: 'is-concluido'
});
const CLASSES_ACAO_BOTAO = Object.freeze([
  'is-entrada',
  'is-saida-almoco',
  'is-retorno-almoco',
  'is-saida',
  'is-concluido'
]);
const CLASSES_ESTADO_BOTAO = [
  ...CLASSES_ACAO_BOTAO,
  'is-loading',
  'is-unavailable',
  'is-success',
  'is-sync-pending'
];
const FEEDBACK_REGISTRO_MINIMO_MS = 700;

let estadoHoje = null;
let carregandoHoje = false;
let promessaCarregamentoHoje = null;
let promessaSincronizacaoRegistro = null;
let isSubmitting = false;
let registroConfirmadoPendenteAtualizacao = false;
let temporizadorRedirecionamento = null;
let eventosPontoInicializados = false;
let focoAntesDoModal = null;

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
    (data.proxima_batida !== null && typeof data.proxima_batida !== 'string') ||
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

  // Painel desktop: espelha hora/data do mesmo `now` no bloco .ponto-dashboard-dt
  // (no-op se o bloco não existir — mobile/outras telas). Não recalcula nada.
  const dtClock = getElement('dt-clock');
  const dtDate = getElement('dt-date');
  if (dtClock) dtClock.textContent = time;
  if (dtDate) dtDate.textContent = `${DIAS_SEMANA[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
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
  ocupado = false,
  classes = [],
  anuncio = ''
}) {
  const button = getElement('btn-ponto');
  const estadoAnterior = button.dataset.state;
  const textoAnterior = getElement('btn-label').textContent;
  const classeAcao = CLASSE_ACAO_POR_TIPO[estado] || null;
  definirEstadoBotao(button, classeAcao, ...classes);
  button.dataset.state = estado;
  button.disabled = desabilitado;
  button.setAttribute('aria-busy', String(ocupado));
  button.setAttribute('aria-label', texto);
  getElement('btn-icon').src = icone;
  getElement('btn-label').textContent = texto;
  if (anuncio && (estadoAnterior !== estado || textoAnterior !== texto)) {
    anunciarEstadoBotao(anuncio);
  }

  // Espelha o estado recém-aplicado no botão e no painel desktop (no-op fora do
  // breakpoint). Lê os valores que acabamos de gravar — não duplica lógica.
  atualizarBotaoDesktop();
  atualizarPainelDesktop();
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
    ocupado: true,
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

  // Sidebar desktop: espelha a identidade do header (IDs proprios — o do header
  // continua populando o mobile/desktop-header; este so existe na sidebar >=768px).
  // getElement devolve null se a sidebar nao estiver no DOM (outras telas).
  const sbAvatar = getElement('sb-avatar');
  if (sbAvatar) {
    sbAvatar.textContent = iniciais;
    getElement('sb-name').textContent = nome;
    getElement('sb-role').textContent = cargo;
    // Etiqueta de cargo ao lado do nome (mesma tag "ADMIN" do dashboard admin,
    // reusando .sidebar-admin-badge). Espelho do cargo já computado — só display.
    const sbCargoTag = getElement('sb-cargo-tag');
    if (sbCargoTag) sbCargoTag.textContent = cargo;
  }
}

function getPercentualProgressoJornada(ponto) {
  const ultimoIndiceConcluido = ETAPAS.reduce(
    (ultimoIndice, etapa, indice) => (ponto[etapa.campo] ? indice : ultimoIndice),
    -1
  );

  if (ultimoIndiceConcluido < 0) return '0%';
  return `${(ultimoIndiceConcluido / (ETAPAS.length - 1)) * 100}%`;
}

function criarEtapaJornada(etapa, jornada, ponto, proximaBatida) {
  const horarioRegistrado = ponto[etapa.campo];
  const concluida = Boolean(horarioRegistrado);
  const atual = !concluida && proximaBatida === etapa.tipo;
  const item = document.createElement('li');
  item.className = 'journey-step';
  item.classList.add(
    concluida ? 'jmarker--done' : atual ? 'jmarker--current' : 'jmarker--pending'
  );
  if (concluida) item.classList.add('is-complete');
  if (atual) item.classList.add('is-current');

  const marker = document.createElement('span');
  marker.className = 'journey-step-marker';

  const icon = document.createElement('img');
  icon.src = concluida ? '/assets/icons/check.svg' : etapa.asset;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  marker.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'journey-step-label';
  label.textContent = etapa.rotuloCard;

  const state = document.createElement('span');
  state.className = 'journey-step-state';
  state.textContent = concluida ? 'Registrada' : atual ? 'Atual' : 'Prevista';

  const time = document.createElement('time');
  time.className = 'journey-step-time';
  time.textContent = atual ? 'agora' : formatarHorario(horarioRegistrado || jornada[etapa.campo]);

  item.append(marker, label, state, time);
  return item;
}

function renderTimeline(ponto, jornada, proximaBatida) {
  const timeline = getElement('timeline');
  timeline.style.setProperty('--journey-progress-stop', getPercentualProgressoJornada(ponto));
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
    texto: 'REGISTRANDO...',
    icone: etapa.asset,
    desabilitado: true,
    ocupado: true,
    classes: ['is-loading'],
    anuncio: `${etapa.label}: registrando ponto.`
  });
}

function mostrarEstadoConfirmado() {
  aplicarEstadoBotao({
    estado: 'CONFIRMADO',
    texto: 'REGISTRO CONFIRMADO',
    icone: '/assets/icons/circle-check.svg',
    desabilitado: true,
    classes: ['is-success'],
    anuncio: 'Registro confirmado com sucesso.'
  });
}

function mostrarEstadoAtualizacaoPendente() {
  aplicarEstadoBotao({
    estado: 'SYNC_PENDING',
    texto: 'ATUALIZE PARA CONTINUAR',
    icone: '/assets/icons/clock.svg',
    desabilitado: true,
    classes: ['is-sync-pending'],
    anuncio: 'Registro confirmado. Atualize o estado antes de continuar.'
  });
  getElement('retry-ponto-state').hidden = false;
}

function renderEstado() {
  const nextLabel = getElement('next-label');
  const nextTime = getElement('next-time');

  if (registroConfirmadoPendenteAtualizacao) return;

  if (!estadoHoje) {
    aplicarEstadoBotao({
      estado: 'ERRO',
      texto: 'INDISPONÍVEL',
      icone: '/assets/icons/circle-x.svg',
      desabilitado: true,
      classes: ['is-unavailable']
    });
    return;
  }

  const proximaBatida = estadoHoje.proxima_batida;
  const concluida =
    estadoHoje.jornada_concluida ||
    proximaBatida === null ||
    proximaBatida === 'CONCLUIDO';

  if (concluida) {
    aplicarEstadoBotao({
      estado: 'CONCLUIDA',
      texto: 'JORNADA CONCLUÍDA',
      icone: '/assets/icons/circle-check.svg',
      desabilitado: true,
      anuncio: 'Jornada concluída.'
    });
    nextLabel.textContent = 'Todos os registros de hoje foram concluídos';
    nextTime.textContent = '';
    return;
  }

  const etapa = ETAPAS_POR_TIPO.get(proximaBatida);
  if (!etapa || !TIPOS_PROXIMA_BATIDA.has(proximaBatida)) {
    aplicarEstadoBotao({
      estado: 'INDISPONIVEL',
      texto: 'INDISPONÍVEL',
      icone: '/assets/icons/circle-x.svg',
      desabilitado: true,
      classes: ['is-unavailable'],
      anuncio: 'Próxima ação indisponível.'
    });
    nextLabel.textContent = 'Próximo registro indisponível';
    nextTime.textContent = '';
    return;
  }

  if (isSubmitting) {
    mostrarEstadoRegistrando(etapa);
    return;
  }

  aplicarEstadoBotao({
    estado: etapa.tipo,
    texto: carregandoHoje ? 'ATUALIZANDO...' : etapa.botao,
    icone: etapa.asset,
    desabilitado: carregandoHoje,
    ocupado: carregandoHoje,
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

/* Painel desktop (>=768px): espelha valores já computados pelo fluxo normal
   nos elementos do bloco .ponto-dashboard-dt. Não altera cálculo de horário
   nem registro de ponto — só LÊ estado existente (#btn-ponto, #next-*, estadoHoje)
   e replica nos IDs *_dt/dt-*. getElement devolve null fora do bloco (mobile/outras
   telas) e os espelhos viram no-op. */
function atualizarBotaoDesktop() {
  const btn = getElement('btn-ponto-dt');
  if (!btn) return;
  const ref = getElement('btn-ponto');
  const label = getElement('btn-label');
  const icon = getElement('btn-icon');
  getElement('btn-label-dt').textContent = label ? label.textContent : '';
  if (icon) getElement('btn-icon-dt').src = icon.src;
  btn.disabled = ref ? ref.disabled : false;
  definirEstadoBotao(
    btn,
    ...CLASSES_ESTADO_BOTAO.filter((classe) => ref && ref.classList.contains(classe))
  );
}

function atualizarPainelDesktop() {
  const dtTipo = getElement('dt-tipo-proximo');
  const dtHora = getElement('dt-horario-proximo');
  const markers = document.querySelectorAll('.ponto-dashboard-dt .dt-jmarker');
  if (markers.length === 0) return;

  if (!estadoHoje) {
    // espelha o estado do painel mobile (skeleton/erro já escrito em #next-*)
    const nextLabel = getElement('next-label');
    const nextTime = getElement('next-time');
    const jornadaDesktop = document.querySelector('.ponto-dashboard-dt .dt-jornada');
    if (jornadaDesktop) jornadaDesktop.style.setProperty('--journey-progress-stop', '0%');
    if (dtTipo) dtTipo.textContent = nextLabel ? nextLabel.textContent : '';
    if (dtHora) dtHora.textContent = nextTime ? nextTime.textContent : '';
    markers.forEach((marker) => {
      marker.classList.remove('is-active', 'jmarker--done', 'jmarker--current', 'jmarker--pending');
      const icon = marker.querySelector('img');
      const etapa = icon ? ETAPAS_POR_TIPO.get(icon.dataset.step) : null;
      if (icon && etapa) icon.src = etapa.asset;
      const state = marker.querySelector('[data-state]');
      if (state) state.textContent = '—';
      const cell = marker.querySelector('[data-time]');
      if (cell) cell.textContent = '--:--';
    });
    return;
  }

  const { jornada, ponto, proxima_batida } = estadoHoje;
  const jornadaDesktop = document.querySelector('.ponto-dashboard-dt .dt-jornada');
  if (jornadaDesktop) {
    jornadaDesktop.style.setProperty('--journey-progress-stop', getPercentualProgressoJornada(ponto));
  }
  const concluida =
    estadoHoje.jornada_concluida || proxima_batida === null || proxima_batida === 'CONCLUIDO';

  if (concluida) {
    if (dtTipo) dtTipo.textContent = 'Jornada concluída';
    if (dtHora) dtHora.textContent = '';
  } else {
    const etapa = ETAPAS_POR_TIPO.get(proxima_batida);
    if (etapa) {
      if (dtTipo) dtTipo.textContent = etapa.rotuloCard;
      if (dtHora) dtHora.textContent = formatarHorario(jornada[etapa.campo]);
    }
  }

  markers.forEach((marker) => {
    const tipo = marker.querySelector('img').dataset.step;
    const etapa = ETAPAS_POR_TIPO.get(tipo);
    if (!etapa) return;
    const registrado = Boolean(ponto[etapa.campo]);
    const ehAtual = !concluida && proxima_batida === tipo;
    const icon = marker.querySelector('img');
    marker.classList.remove('jmarker--done', 'jmarker--current', 'jmarker--pending');
    marker.classList.add(
      registrado ? 'jmarker--done' : ehAtual ? 'jmarker--current' : 'jmarker--pending'
    );
    marker.classList.toggle('is-active', registrado || ehAtual);
    if (icon) icon.src = registrado ? '/assets/icons/check.svg' : etapa.asset;
    const state = marker.querySelector('[data-state]');
    if (state) state.textContent = registrado ? 'Registrada' : ehAtual ? 'Atual' : 'Prevista';
    const cell = marker.querySelector('[data-time]');
    if (cell) cell.textContent = ehAtual ? 'agora' : formatarHorario(ponto[etapa.campo] || jornada[etapa.campo]);
  });
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
    texto: 'INDISPONÍVEL',
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
  focoAntesDoModal = getElement('btn-ponto');
  modal.classList.add('show');
  if (typeof modal.showModal === 'function' && !modal.open) {
    modal.showModal();
  }
}

function definirDialogOcupado(valor) {
  const modal = getElement('confirm-modal');
  const confirmar = getElement('confirm-submit');
  modal.setAttribute('aria-busy', String(valor));
  getElement('confirm-cancel').disabled = valor;
  confirmar.disabled = valor;
  confirmar.classList.toggle('is-submitting', valor);
  confirmar.textContent = valor ? 'Registrando...' : 'Confirmar';
}

function aplicarEstadoConfirmacao(tipo) {
  const modal = getElement('confirm-modal');
  modal.classList.remove(...CLASSES_ACAO_BOTAO);
  const classe = CLASSE_ACAO_POR_TIPO[tipo];
  if (classe) modal.classList.add(classe);
}

function mostrarConfirmacaoRegistro() {
  const etapa = ETAPAS_POR_TIPO.get(estadoHoje?.proxima_batida);
  if (!etapa) return;

  aplicarEstadoConfirmacao(etapa.tipo);
  getElement('confirm-title').textContent = etapa.confirmacao;
  getElement('confirm-time').textContent = formatarHorario(estadoHoje.jornada[etapa.campo]);
  getElement('confirm-sub').textContent = 'Sua localização será verificada.';
  getElement('confirm-icon').src = etapa.asset;
  definirDialogOcupado(false);
  abrirModal();
  getElement('confirm-submit').focus();
}

function baterPonto() {
  if (
    !estadoHoje ||
    estadoHoje.proxima_batida === null ||
    !ETAPAS_POR_TIPO.has(estadoHoje.proxima_batida) ||
    estadoHoje.jornada_concluida ||
    registroConfirmadoPendenteAtualizacao ||
    carregandoHoje
  ) {
    return;
  }

  mostrarConfirmacaoRegistro();
}

function aplicarJornadaAtualizada(data, { renderizar = true } = {}) {
  estadoHoje = data;
  registroConfirmadoPendenteAtualizacao = false;
  getElement('retry-ponto-state').hidden = true;
  if (renderizar) renderHoje(data);
}

async function sincronizarAposRegistro(confirmadoEm) {
  const tentativa = buscarPontoHoje()
    .then((data) => ({ data, error: null }))
    .catch((error) => ({ data: null, error }));

  const tempoDecorrido = window.performance.now() - confirmadoEm;
  const [resultado] = await Promise.all([
    tentativa,
    aguardar(Math.max(FEEDBACK_REGISTRO_MINIMO_MS - tempoDecorrido, 0))
  ]);

  if (resultado.data) {
    aplicarJornadaAtualizada(resultado.data, { renderizar: false });
    return true;
  }

  mostrarEstadoAtualizacaoPendente();
  toast(
    'Registro confirmado, mas não foi possível atualizar a jornada. Tente recarregar o estado.',
    'error'
  );
  if (resultado.error?.status === 401 && !temporizadorRedirecionamento) {
    temporizadorRedirecionamento = window.setTimeout(sair, 1400);
  }
  return false;
}

function recarregarEstadoAposRegistro() {
  if (
    !registroConfirmadoPendenteAtualizacao ||
    promessaSincronizacaoRegistro
  ) {
    return promessaSincronizacaoRegistro || Promise.resolve(null);
  }

  const retry = getElement('retry-ponto-state');
  retry.disabled = true;
  retry.setAttribute('aria-busy', 'true');
  retry.textContent = 'Atualizando...';

  aplicarEstadoBotao({
    estado: 'SYNC_PENDING',
    texto: 'ATUALIZANDO...',
    icone: '/assets/icons/clock.svg',
    desabilitado: true,
    ocupado: true,
    classes: ['is-sync-pending', 'is-loading']
  });

  promessaSincronizacaoRegistro = buscarPontoHoje()
    .then((data) => {
      isSubmitting = false;
      aplicarJornadaAtualizada(data);
      return data;
    })
    .catch((error) => {
      mostrarEstadoAtualizacaoPendente();
      toast(
        'Ainda não foi possível atualizar a jornada. Verifique sua conexão e tente novamente.',
        'error'
      );
      if (error.status === 401 && !temporizadorRedirecionamento) {
        temporizadorRedirecionamento = window.setTimeout(sair, 1400);
      }
      return null;
    })
    .finally(() => {
      promessaSincronizacaoRegistro = null;
      retry.setAttribute('aria-busy', 'false');
      retry.textContent = 'Recarregar estado';
      retry.disabled = !registroConfirmadoPendenteAtualizacao;
    });

  return promessaSincronizacaoRegistro;
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
    !ETAPAS_POR_TIPO.has(estadoHoje.proxima_batida) ||
    estadoHoje.jornada_concluida ||
    isSubmitting ||
    registroConfirmadoPendenteAtualizacao ||
    carregandoHoje
  ) {
    return;
  }

  if (!navigator.onLine) {
    toast('Sem internet. Verifique sua conexão e tente novamente.', 'error');
    return;
  }

  const etapa = ETAPAS_POR_TIPO.get(estadoHoje.proxima_batida);
  let postConfirmado = false;
  if (isSubmitting) return;
  isSubmitting = true;
  definirDialogOcupado(true);
  mostrarEstadoRegistrando(etapa);

  try {
    const location = await getCurrentLocation();
    await apiRequest('/pontos/registrar', {
      method: 'POST',
      body: { ...location }
    });
    postConfirmado = true;
    registroConfirmadoPendenteAtualizacao = true;
    fecharConfirm({ forcar: true });
    const confirmadoEm = window.performance.now();
    mostrarEstadoConfirmado();
    await sincronizarAposRegistro(confirmadoEm);
  } catch (error) {
    if (!postConfirmado) {
      toast(mensagemSeguraRegistro(error), 'error');
      if (error.status === 401) {
        window.setTimeout(sair, 1400);
      }
    } else {
      mostrarEstadoAtualizacaoPendente();
      toast(
        'Registro confirmado, mas não foi possível atualizar a jornada. Tente recarregar o estado.',
        'error'
      );
    }
  } finally {
    if (!postConfirmado || !registroConfirmadoPendenteAtualizacao) {
      isSubmitting = false;
    }
    definirDialogOcupado(false);
    if (!postConfirmado) renderEstado();
    else if (!registroConfirmadoPendenteAtualizacao && estadoHoje) renderHoje(estadoHoje);
  }
}

function fecharConfirm({ forcar = false, restaurarFoco = true } = {}) {
  if (isSubmitting && !forcar) return;
  const modal = getElement('confirm-modal');
  if (modal.open) modal.close();
  modal.classList.remove('show');

  if (restaurarFoco) {
    const alvoFoco = focoAntesDoModal || getElement('btn-ponto');
    focoAntesDoModal = null;
    window.setTimeout(() => {
      if (alvoFoco && !alvoFoco.disabled) alvoFoco.focus();
    }, 0);
  } else {
    focoAntesDoModal = null;
  }
}

function manterFocoNoDialogo(event) {
  const modal = getElement('confirm-modal');
  if (event.key !== 'Tab' || !modal.open) return;

  const elementos = [getElement('confirm-submit'), getElement('confirm-cancel')]
    .filter((elemento) => !elemento.disabled);

  if (elementos.length === 0) {
    event.preventDefault();
    return;
  }

  const primeiro = elementos[0];
  const ultimo = elementos[elementos.length - 1];
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    primeiro.focus();
  } else if (event.shiftKey && document.activeElement === primeiro) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && document.activeElement === ultimo) {
    event.preventDefault();
    primeiro.focus();
  }
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

function inicializarEventosPonto() {
  if (eventosPontoInicializados) return;
  eventosPontoInicializados = true;

  getElement('btn-ponto').addEventListener('click', baterPonto);
  // Botão desktop (visível >=768px): mesma ação do botão mobile, que segue no DOM
  // (oculto via CSS no desktop, mas ainda é a fonte do estado espelhado para o dt).
  const btnPontoDt = getElement('btn-ponto-dt');
  if (btnPontoDt) btnPontoDt.addEventListener('click', baterPonto);

  const sbLogoutDt = getElement('sb-logout-dt');
  if (sbLogoutDt) sbLogoutDt.addEventListener('click', sair);

  getElement('retry-ponto-state').addEventListener('click', () => {
    recarregarEstadoAposRegistro();
  });
  getElement('confirm-form').addEventListener('submit', (event) => {
    event.preventDefault();
    confirmarRegistroPonto();
  });
  getElement('confirm-cancel').addEventListener('click', () => {
    fecharConfirm();
  });

  getElement('confirm-modal').addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!isSubmitting) fecharConfirm();
  });
  getElement('confirm-modal').addEventListener('keydown', manterFocoNoDialogo);
  getElement('confirm-modal').addEventListener('click', (event) => {
    if (event.target === event.currentTarget && !isSubmitting) fecharConfirm();
  });
}

if (funcionarioToken) {
  inicializarEventosPonto();
  setInterval(atualizarRelogio, 1000);
  atualizarRelogio();
  mostrarSkeleton();
  carregarPontoHoje({ mostrarCarregamento: false }).catch(() => {});
}
