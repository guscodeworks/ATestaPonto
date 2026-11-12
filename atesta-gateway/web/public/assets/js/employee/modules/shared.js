'use strict';

(function inicializarFuncionarioShared(window, document, sessionStorage) {
  const CARGOS = Object.freeze({
    FUNCIONARIO: 'Funcionário(a)',
    INSPETOR: 'Inspetor(a)',
    PROFESSOR: 'Professor(a)'
  });
  const CHAVES_SESSAO = Object.freeze([
    'funcionario_token',
    'funcionario_data',
    'func_nome',
    'func_cpf',
    'funcionario_primeiro_acesso_token',
    'funcionario_primeiro_acesso_expira_em'
  ]);
  const tokenDaPagina = sessionStorage.getItem('funcionario_token');
  const displayOriginal = document.documentElement.style.display;

  function verificarSessaoAtual() {
    const tokenAtual = sessionStorage.getItem('funcionario_token');
    if (!tokenAtual) {
      document.documentElement.style.display = 'none';
      limparSessaoFuncionario();
      window.location.replace('/login');
      return;
    }
    if (tokenAtual !== tokenDaPagina) {
      // Uma página restaurada não pode reutilizar dados/token de outro login.
      document.documentElement.style.display = 'none';
      window.location.reload();
      return;
    }
    document.documentElement.style.display = displayOriginal;
  }

  window.addEventListener('pagehide', () => {
    document.documentElement.style.display = 'none';
  });
  window.addEventListener('pageshow', verificarSessaoAtual);
  window.addEventListener('focus', verificarSessaoAtual);
  verificarSessaoAtual();

  function getElement(id) {
    return document.getElementById(id);
  }

  function definirTexto(id, value) {
    const element = getElement(id);
    if (element) element.textContent = value;
  }

  function obterIniciais(nome, fallback = '—') {
    const partes = String(nome || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!partes.length) return fallback;

    return partes
      .slice(0, 2)
      .map((parte) => parte.charAt(0))
      .join('')
      .toUpperCase();
  }

  function formatarCargo(cargo, fallback = 'Não informado') {
    const valor = String(cargo || '').trim().toUpperCase();
    return CARGOS[valor] || valor || fallback;
  }

  function formatarHorario(horario, fallback = '—') {
    const valor = String(horario || '').trim();
    return /^\d{2}:\d{2}(?::\d{2})?$/.test(valor) ? valor.slice(0, 5) : fallback;
  }

  function limparSessaoFuncionario() {
    CHAVES_SESSAO.forEach((chave) => sessionStorage.removeItem(chave));
    document.documentElement.style.display = 'none';
  }

  window.FuncionarioShared = Object.freeze({
    getElement,
    definirTexto,
    obterIniciais,
    formatarCargo,
    formatarHorario,
    limparSessaoFuncionario
  });
})(window, document, sessionStorage);
