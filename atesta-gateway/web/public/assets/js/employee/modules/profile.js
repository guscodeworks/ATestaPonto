'use strict';

const funcionarioToken = sessionStorage.getItem('funcionario_token');
const {
  getElement,
  definirTexto,
  obterIniciais,
  formatarCargo,
  formatarHorario,
  limparSessaoFuncionario
} = window.FuncionarioShared;
const TEXTO_INDISPONIVEL = 'Não informado';
const PROFILE_DATA_SECTION_IDS = [
  'profile-summary',
  'profile-personal',
  'profile-schedule',
  'profile-security'
];

if (!funcionarioToken) {
  window.location.replace('/login');
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

function mostrarEstadoPerfil(estado) {
  getElement('profile-loading').hidden = estado !== 'loading';
  getElement('profile-error').hidden = estado !== 'error';
  PROFILE_DATA_SECTION_IDS.forEach((id) => {
    getElement(id).hidden = estado !== 'ready';
  });
}

function renderizarPerfil(data) {
  const dadosLogin = lerFuncionarioDoLogin();
  const nome = textoReal(data.funcionario.nome || dadosLogin.nome);
  const cargo = formatarCargo(data.funcionario.cargo);
  const iniciais = obterIniciais(nome === TEXTO_INDISPONIVEL ? '' : nome);

  definirTexto('header-avatar', iniciais);
  definirTexto('header-name', nome);
  definirTexto('header-cargo', cargo);
  definirTexto('sidebar-welcome-name', nome);
  definirTexto('profile-avatar', iniciais);
  definirTexto('profile-name', nome);
  definirTexto('profile-cargo', cargo);
  definirTexto('profile-status', 'Ativo');
  getElement('profile-status').classList.remove('is-unavailable');
  definirTexto('profile-personal-name', nome);
  definirTexto('profile-email', textoReal(dadosLogin.email));
  definirTexto('profile-cpf', formatarCpfMascarado(dadosLogin.cpf));
  definirTexto('profile-phone', formatarTelefone(dadosLogin.telefone));
  definirTexto('schedule-entry', formatarHorario(data.jornada.entrada, TEXTO_INDISPONIVEL));
  definirTexto('schedule-lunch-out', formatarHorario(data.jornada.saida_almoco, TEXTO_INDISPONIVEL));
  definirTexto('schedule-lunch-return', formatarHorario(data.jornada.retorno_almoco, TEXTO_INDISPONIVEL));
  definirTexto('schedule-exit', formatarHorario(data.jornada.saida, TEXTO_INDISPONIVEL));
}

function sair() {
  limparSessaoFuncionario();
  window.location.replace('/login');
}

async function iniciarPerfil() {
  mostrarEstadoPerfil('loading');
  getElement('profile-content').setAttribute('aria-busy', 'true');

  try {
    const data = await buscarPerfilAtual();
    renderizarPerfil(data);
    mostrarEstadoPerfil('ready');
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      sair();
      return;
    }

    mostrarEstadoPerfil('error');
  } finally {
    getElement('profile-content').setAttribute('aria-busy', 'false');
  }
}

getElement('profile-logout').addEventListener('click', sair);
getElement('employee-logout').addEventListener('click', sair);
getElement('profile-retry').addEventListener('click', iniciarPerfil);

if (funcionarioToken) {
  iniciarPerfil();
}
