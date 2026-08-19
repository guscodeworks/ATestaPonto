/**
 * auth.js — Módulo de autenticação do funcionário
 * Sala do Futuro — Sistema de Ponto
 *
 * Funções:
 *  - logout(redirectTo)        → limpa sessão e redireciona
 *  - requireFuncAuth()         → guarda de rota funcionário
 *  - preventBackAfterLogout()  → impede voltar pelo browser após logout
 */

'use strict';

/* ============================================================
   CHAVES DE SESSÃO
   ============================================================ */
const AUTH_KEYS = {
  funcLoggedIn:   'func_logged_in',
  funcNome:       'func_nome',
  funcCargo:      'func_cargo',
  funcCPF:        'func_cpf',
  funcMatricula:  'func_matricula',
  pontoEtapa:     'ponto_etapa',
  pontoRegistros: 'ponto_registros',
};

/* ============================================================
   LOGOUT UNIVERSAL
   Limpa toda sessão, localStorage de auth e redireciona
   ============================================================ */
function logout(redirectTo) {
  // 1. Limpar sessionStorage completamente
  sessionStorage.clear();

  // 2. Limpar itens de auth do localStorage (preserva preferências do usuário)
  const authLocalKeys = [
    AUTH_KEYS.funcLoggedIn,
  ];
  authLocalKeys.forEach(k => localStorage.removeItem(k));

  // 3. Impedir o cache de histórico (back button) de restaurar página protegida
  // Substituímos o histórico atual pela página de login antes de redirecionar
  const destino = redirectTo || '/login';

  // Usar replace para que a página atual não fique no histórico
  window.history.replaceState(null, '', destino);
  window.location.replace(destino);
}

/* ============================================================
   GUARDA DE ROTA — FUNCIONÁRIO
   ============================================================ */
function requireFuncAuth() {
  const loggedIn = sessionStorage.getItem(AUTH_KEYS.funcLoggedIn);
  if (!loggedIn) {
    // Login do funcionário é acessado por caminho relativo; ajusta o
    // prefixo conforme a página atual já estar ou não dentro de /funcionario/.
    const base = window.location.pathname.includes('/funcionario/') ? '' : 'funcionario/';
    window.location.replace(base + 'login.html');
    return false;
  }
  preventBackAfterLogout();
  return true;
}

/* ============================================================
   IMPEDE VOLTAR APÓS LOGOUT
   Substitui o estado atual no histórico para que o "Voltar"
   não restaure a página autenticada.
   ============================================================ */
function preventBackAfterLogout() {
  // Empurra estado atual para que um popstate seja detectável
  window.history.pushState({ protected: true }, '');

  window.addEventListener('popstate', function() {
    const funcLoggedIn  = sessionStorage.getItem(AUTH_KEYS.funcLoggedIn);
    if (!funcLoggedIn) {
      // Usuário não autenticado tentou voltar — redireciona
      window.location.replace(window.location.href);
    }
  });
}

function setFuncSession(data) {
  sessionStorage.setItem(AUTH_KEYS.funcLoggedIn, '1');
  if (data.nome)      sessionStorage.setItem(AUTH_KEYS.funcNome, data.nome);
  if (data.cargo)     sessionStorage.setItem(AUTH_KEYS.funcCargo, data.cargo);
  if (data.cpf)       sessionStorage.setItem(AUTH_KEYS.funcCPF, data.cpf);
  if (data.matricula) sessionStorage.setItem(AUTH_KEYS.funcMatricula, data.matricula);
}

function getFuncSession() {
  return {
    loggedIn:  !!sessionStorage.getItem(AUTH_KEYS.funcLoggedIn),
    nome:      sessionStorage.getItem(AUTH_KEYS.funcNome) || '',
    cargo:     sessionStorage.getItem(AUTH_KEYS.funcCargo) || '',
    cpf:       sessionStorage.getItem(AUTH_KEYS.funcCPF) || '',
    matricula: sessionStorage.getItem(AUTH_KEYS.funcMatricula) || '',
  };
}
