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
    botao: 'Registrar entrada',
    icon: 'ENT',
    classe: 'entrada'
  },
  {
    tipo: 'SAIDA_ALMOCO',
    campo: 'saida_almoco',
    label: 'Saída para almoço',
    botao: 'Iniciar almoço',
    icon: 'ALM',
    classe: 'pausa'
  },
  {
    tipo: 'RETORNO_ALMOCO',
    campo: 'retorno_almoco',
    label: 'Retorno do almoço',
    botao: 'Retornar do almoço',
    icon: 'RET',
    classe: 'retorno'
  },
  {
    tipo: 'SAIDA',
    campo: 'saida',
    label: 'Saída',
    botao: 'Registrar saída',
    icon: 'SAI',
    classe: 'saida'
  }
]);

const ETAPAS_POR_TIPO = new Map(ETAPAS.map((etapa) => [etapa.tipo, etapa]));
const TIPOS_PROXIMA_BATIDA = new Set([...ETAPAS_POR_TIPO.keys(), null]);

let estadoHoje = null;
let carregandoHoje = false;
let promessaCarregamentoHoje = null;
let registrando = false;
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

function formatarDataReferencia(dataReferencia) {
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(dataReferencia || '').trim()
  );
  if (!correspondencia) return '--/--/----';
  return `${correspondencia[3]}/${correspondencia[2]}/${correspondencia[1]}`;
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
  const ss = String(now.getSeconds()).padStart(2, '0');
  const time = `${hh}:${mm}:${ss}`;

  getElement('hero-clock').textContent = time;
  getElement('hero-weekday').textContent = DIAS_SEMANA[now.getDay()];
  getElement('hero-date').textContent = `${String(now.getDate()).padStart(2, '0')} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

  const h = now.getHours();
  getElement('greeting').textContent = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'},`;
}

function aplicarEstiloSkeleton(elemento, largura, altura) {
  elemento.setAttribute('aria-hidden', 'true');
  Object.assign(elemento.style, {
    display: 'block',
    width: largura,
    maxWidth: '100%',
    height: altura,
    borderRadius: '999px',
    background: 'linear-gradient(90deg, rgba(20, 80, 240, 0.06) 25%, rgba(20, 80, 240, 0.13) 50%, rgba(20, 80, 240, 0.06) 75%)',
    backgroundSize: '200% 100%',
    animation: 'employee-skeleton-loading 1.2s ease-in-out infinite'
  });
}

function criarSkeleton(largura, altura) {
  const skeleton = document.createElement('span');
  aplicarEstiloSkeleton(skeleton, largura, altura);
  return skeleton;
}

function definirBusy(valor) {
  document.querySelectorAll('.ponto-hero, .timeline-card, .schedule-card')
    .forEach((elemento) => elemento.setAttribute('aria-busy', String(valor)));
}

function mostrarSkeleton() {
  definirBusy(true);

  const heroName = getElement('hero-name');
  const heroCargo = getElement('hero-cargo');
  heroName.replaceChildren(criarSkeleton('168px', '16px'));
  heroCargo.replaceChildren(criarSkeleton('92px', '12px'));

  getElement('tp-avatar').textContent = '—';

  document.querySelectorAll('.schedule-time').forEach((elemento) => {
    elemento.replaceChildren(criarSkeleton('52px', '12px'));
  });

  const timeline = getElement('timeline');
  timeline.replaceChildren();
  for (let index = 0; index < 4; index += 1) {
    const row = document.createElement('div');
    row.className = 'ponto-timeline-item';
    row.append(
      criarSkeleton('36px', '36px'),
      criarSkeleton('118px', '13px'),
      criarSkeleton('46px', '13px')
    );
    timeline.appendChild(row);
  }

  getElement('timeline-count').textContent = 'Carregando';
  getElement('last-action').textContent = 'Carregando registros...';
  getElement('status-dot').className = 'ponto-status-dot waiting';
  getElement('status-text').textContent = 'Carregando jornada...';

  const button = getElement('btn-ponto');
  button.disabled = true;
  button.style.opacity = '0.58';
  button.style.cursor = 'wait';
  getElement('btn-icon').textContent = '';
  getElement('btn-label').textContent = 'Carregando';
}

function renderFuncionario(funcionario) {
  const nome = funcionario.nome.trim();
  const cargo = formatarCargo(funcionario.cargo);
  const iniciais = getInitials(nome);

  getElement('tp-avatar').textContent = iniciais;
  getElement('hero-name').textContent = nome;
  getElement('hero-cargo').textContent = cargo;
}

function renderJornada(jornada) {
  const campos = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
  const horarios = document.querySelectorAll('.schedule-time');

  campos.forEach((campo, index) => {
    if (horarios[index]) {
      horarios[index].textContent = formatarHorario(jornada[campo]);
    }
  });
}

function criarTimelineItem(etapa, horario, dataReferencia) {
  const item = document.createElement('div');
  item.className = 'ponto-timeline-item';

  const marker = document.createElement('div');
  marker.className = `ponto-tl-marker ${etapa.classe}`;
  marker.textContent = etapa.icon;

  const info = document.createElement('div');
  info.className = 'ponto-tl-info';

  const label = document.createElement('div');
  label.className = 'ponto-tl-label';
  label.textContent = etapa.label;

  const sub = document.createElement('div');
  sub.className = 'ponto-tl-sub';
  sub.textContent = horario ? `Registrado em ${formatarDataReferencia(dataReferencia)}` : 'Aguardando registro';

  const time = document.createElement('time');
  time.className = 'ponto-tl-time';
  time.textContent = formatarHorario(horario);

  info.append(label, sub);
  item.append(marker, info, time);
  return item;
}

function renderTimeline(ponto) {
  const timeline = getElement('timeline');
  const batidas = ETAPAS.filter((etapa) => Boolean(ponto[etapa.campo]));
  timeline.replaceChildren(
    ...ETAPAS.map((etapa) => criarTimelineItem(
      etapa,
      ponto[etapa.campo],
      ponto.data_referencia
    ))
  );

  getElement('timeline-count').textContent = `${batidas.length} registro(s)`;
  getElement('timeline-date').textContent = formatarDataReferencia(ponto.data_referencia);

  const ultimaBatida = [...ETAPAS]
    .reverse()
    .find((etapa) => Boolean(ponto[etapa.campo]));

  getElement('last-action').textContent = ultimaBatida
    ? `Último registro: ${ultimaBatida.label} às ${formatarHorario(ponto[ultimaBatida.campo])}`
    : 'Nenhum registro hoje';
}

function renderEstado() {
  const button = getElement('btn-ponto');
  const buttonIcon = getElement('btn-icon');
  const buttonLabel = getElement('btn-label');
  const statusDot = getElement('status-dot');
  const statusText = getElement('status-text');

  if (!estadoHoje) {
    button.disabled = true;
    return;
  }

  const proximaBatida = estadoHoje.proxima_batida;
  const etapa = ETAPAS_POR_TIPO.get(proximaBatida);
  const concluida = estadoHoje.jornada_concluida || proximaBatida === null;

  if (concluida) {
    button.className = 'ponto-btn saida';
    button.disabled = true;
    button.style.opacity = '0.58';
    button.style.cursor = 'not-allowed';
    buttonIcon.textContent = 'OK';
    buttonLabel.textContent = 'Jornada concluída';
    statusDot.className = 'ponto-status-dot closed';
    statusText.textContent = 'Jornada concluída';
    return;
  }

  button.className = `ponto-btn ${etapa.classe}`;
  button.disabled = registrando || carregandoHoje;
  button.style.opacity = registrando || carregandoHoje ? '0.68' : '';
  button.style.cursor = registrando || carregandoHoje ? 'wait' : '';
  buttonIcon.textContent = registrando ? '...' : etapa.icon;
  buttonLabel.textContent = registrando
    ? 'Registrando ponto'
    : carregandoHoje
      ? 'Atualizando'
      : etapa.botao;

  const statusPorTipo = {
    ENTRADA: 'Aguardando registro de entrada',
    SAIDA_ALMOCO: 'Entrada registrada',
    RETORNO_ALMOCO: 'Intervalo de almoço iniciado',
    SAIDA: 'Retorno do almoço registrado'
  };
  statusDot.className = `ponto-status-dot ${proximaBatida === 'RETORNO_ALMOCO' ? 'paused' : 'active'}`;
  statusText.textContent = statusPorTipo[proximaBatida];
}

function renderHoje(data) {
  renderFuncionario(data.funcionario);
  renderJornada(data.jornada);
  renderTimeline(data.ponto);
  renderEstado();
}

function criarEstadoErro(mensagem, permitirRetry) {
  const container = document.createElement('div');
  container.className = 'timeline-empty';

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
  document.querySelectorAll('.schedule-time').forEach((elemento) => {
    elemento.textContent = '--:--';
  });

  const timeline = getElement('timeline');
  timeline.replaceChildren(criarEstadoErro(mensagem, !isUnauthorized && !isForbidden));
  getElement('timeline-count').textContent = 'Indisponível';
  getElement('last-action').textContent = mensagem;
  getElement('status-dot').className = 'ponto-status-dot waiting';
  getElement('status-text').textContent = mensagem;

  const button = getElement('btn-ponto');
  button.disabled = true;
  button.style.opacity = '0.58';
  button.style.cursor = 'not-allowed';
  getElement('btn-icon').textContent = '!';
  getElement('btn-label').textContent = 'Ponto indisponível';

  if (notificar) toast(mensagem, 'error');

  if (isUnauthorized && !temporizadorRedirecionamento) {
    temporizadorRedirecionamento = window.setTimeout(sair, 1400);
  }
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
      const data = validarContratoHoje(await apiRequest('/pontos/hoje'));
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

function registroFromResponse(ponto) {
  const tipos = {
    ENTRADA: { label: 'Entrada', icon: 'ENT' },
    SAIDA_ALMOCO: { label: 'Saída para almoço', icon: 'ALM' },
    VOLTA_ALMOCO: { label: 'Retorno do almoço', icon: 'RET' },
    RETORNO_ALMOCO: { label: 'Retorno do almoço', icon: 'RET' },
    SAIDA: { label: 'Saída', icon: 'SAI' }
  };
  const meta = tipos[ponto.tipo] || tipos.ENTRADA;
  const dataRegistro = ponto.registrado_em
    ? new Date(String(ponto.registrado_em).replace(' ', 'T'))
    : new Date();

  return {
    ...meta,
    hora: dataRegistro.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  };
}

function mostrarConfirmacao(registro) {
  getElement('confirm-title').textContent = `${registro.label} registrada`;
  getElement('confirm-time').textContent = registro.hora;
  getElement('confirm-sub').textContent = `${registro.label} registrada com sucesso`;
  getElement('confirm-icon').textContent = registro.icon;

  const modal = getElement('confirm-modal');
  modal.classList.add('show');
  if (typeof modal.showModal === 'function' && !modal.open) {
    modal.showModal();
  }
}

async function baterPonto() {
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

  registrando = true;
  renderEstado();
  const carregamento = iniciarCarregamento(getElement('btn-ponto'), {
    tamanho: 'md',
    mensagem: 'Registrando ponto'
  });

  try {
    const location = await getCurrentLocation();
    const data = await apiRequest('/pontos/registrar', {
      method: 'POST',
      body: { ...location }
    });
    const registro = registroFromResponse(data.ponto || {});
    mostrarConfirmacao(registro);

    try {
      await carregarPontoHoje({
        mostrarCarregamento: false,
        notificarErro: false
      });
    } catch (_error) {
      toast(
        'Ponto registrado, mas não foi possível atualizar a tela. Tente novamente.',
        'error'
      );
    }
  } catch (error) {
    const message = error.message || 'Falha ao registrar ponto.';
    toast(message, 'error');
    if (error.status === 401) {
      window.setTimeout(sair, 1400);
    }
  } finally {
    await finalizarCarregamento(carregamento);
    registrando = false;
    renderEstado();
  }
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
  setInterval(atualizarRelogio, 1000);
  atualizarRelogio();
  mostrarSkeleton();
  carregarPontoHoje({ mostrarCarregamento: false }).catch(() => {});
}
