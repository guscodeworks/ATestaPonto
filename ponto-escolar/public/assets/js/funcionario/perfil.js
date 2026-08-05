'use strict';

const funcionarioToken = sessionStorage.getItem('funcionario_token');
const TEXTO_INDISPONIVEL = 'Não informado';

if (!funcionarioToken) {
  window.location.replace('/login');
}

function getElement(id) {
  return document.getElementById(id);
}

function lerFuncionarioDoLogin() {
  try {
    const data = JSON.parse(sessionStorage.getItem('funcionario_data') || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (_error) {
    return {};
  }
}

function textoReal(value) {
  const text = String(value || '').trim();
  return text || TEXTO_INDISPONIVEL;
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
  return cargos[valor] || textoReal(valor);
}

function formatarCpfMascarado(cpf) {
  const valor = String(cpf || '').trim();
  const digitos = valor.replace(/\D/g, '');

  if (digitos.length === 11) {
    return `***.***.***-${digitos.slice(-2)}`;
  }

  if (/^\*{3}\.\*{3}\.\*{3}-\d{2}$/.test(valor)) {
    return valor;
  }

  return TEXTO_INDISPONIVEL;
}

function formatarTelefone(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');

  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }

  return TEXTO_INDISPONIVEL;
}

function formatarHorario(horario) {
  const valor = String(horario || '').trim();
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(valor)
    ? valor.slice(0, 5)
    : TEXTO_INDISPONIVEL;
}

function validarRespostaHoje(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    !data.funcionario ||
    !data.jornada ||
    typeof data.funcionario.nome !== 'string' ||
    typeof data.funcionario.cargo !== 'string'
  ) {
    throw new Error('INVALID_PROFILE_RESPONSE');
  }

  return data;
}

async function buscarPerfilAtual() {
  const response = await fetch('/api/pontos/hoje', {
    headers: {
      Authorization: `Bearer ${funcionarioToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const error = new Error('PROFILE_REQUEST_FAILED');
    error.status = response.status;
    throw error;
  }

  return validarRespostaHoje(payload.data);
}

function definirTexto(id, value) {
  const element = getElement(id);
  if (element) element.textContent = value;
}

function renderizarPerfil(data) {
  const dadosLogin = lerFuncionarioDoLogin();
  const nome = textoReal(data.funcionario.nome || dadosLogin.nome);
  const cargo = formatarCargo(data.funcionario.cargo);
  const iniciais = obterIniciais(nome === TEXTO_INDISPONIVEL ? '' : nome);

  definirTexto('header-avatar', iniciais);
  definirTexto('header-name', nome);
  definirTexto('header-cargo', cargo);
  definirTexto('profile-avatar', iniciais);
  definirTexto('profile-name', nome);
  definirTexto('profile-cargo', cargo);
  definirTexto('profile-status', 'Ativo');
  getElement('profile-status').classList.remove('is-unavailable');
  definirTexto('profile-personal-name', nome);
  definirTexto('profile-email', textoReal(dadosLogin.email));
  definirTexto('profile-cpf', formatarCpfMascarado(dadosLogin.cpf));
  definirTexto('profile-phone', formatarTelefone(dadosLogin.telefone));
  definirTexto('schedule-entry', formatarHorario(data.jornada.entrada));
  definirTexto('schedule-lunch-out', formatarHorario(data.jornada.saida_almoco));
  definirTexto('schedule-lunch-return', formatarHorario(data.jornada.retorno_almoco));
  definirTexto('schedule-exit', formatarHorario(data.jornada.saida));
  getElement('profile-content').setAttribute('aria-busy', 'false');
}

function renderizarIndisponivel() {
  const ids = [
    'header-name',
    'header-cargo',
    'profile-name',
    'profile-cargo',
    'profile-status',
    'profile-personal-name',
    'profile-email',
    'profile-cpf',
    'profile-phone',
    'schedule-entry',
    'schedule-lunch-out',
    'schedule-lunch-return',
    'schedule-exit'
  ];

  ids.forEach((id) => definirTexto(id, TEXTO_INDISPONIVEL));
  definirTexto('header-avatar', '—');
  definirTexto('profile-avatar', '—');
  getElement('profile-status').classList.add('is-unavailable');
  getElement('profile-content').setAttribute('aria-busy', 'false');
}

function toast(message, type = 'error') {
  const stack = getElement('toast-stack');
  const element = document.createElement('div');
  const icon = document.createElement('span');
  const text = document.createElement('span');

  element.className = `toast toast-${type}`;
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  text.className = 'toast-msg';
  text.textContent = message;
  element.append(icon, text);
  stack.replaceChildren(element);
  window.setTimeout(() => element.remove(), 3500);
}

function sair() {
  sessionStorage.removeItem('funcionario_token');
  sessionStorage.removeItem('funcionario_data');
  sessionStorage.removeItem('func_nome');
  sessionStorage.removeItem('func_cpf');
  window.location.replace('/login');
}

async function iniciarPerfil() {
  try {
    const data = await buscarPerfilAtual();
    renderizarPerfil(data);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      sair();
      return;
    }

    renderizarIndisponivel();
    toast('Não foi possível carregar seu perfil. Tente novamente mais tarde.');
  }
}

getElement('profile-logout').addEventListener('click', sair);

if (funcionarioToken) {
  iniciarPerfil();
}
