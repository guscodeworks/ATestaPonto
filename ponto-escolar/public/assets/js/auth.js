/**
 * auth.js — Módulo de autenticação compartilhado
 * Sala do Futuro — Sistema de Ponto
 *
 * Funções:
 *  - logout(redirectTo)        → limpa sessão e redireciona
 *  - requireAdminAuth()        → guarda de rota admin
 *  - requireFuncAuth()         → guarda de rota funcionário
 *  - preventBackAfterLogout()  → impede voltar pelo browser após logout
 */

'use strict';

/* ============================================================
   CHAVES DE SESSÃO
   ============================================================ */
const AUTH_KEYS = {
  adminLoggedIn:  'admin_logged_in',
  adminNome:      'admin_nome',
  adminCargo:     'admin_cargo',
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
    AUTH_KEYS.adminLoggedIn,
    AUTH_KEYS.adminNome,
    AUTH_KEYS.adminCargo,
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
   GUARDA DE ROTA — ADMIN
   Chame no topo de cada página do painel admin.
   Se não estiver autenticado, redireciona para o login do admin.
   ============================================================ */
function requireAdminAuth() {
  const loggedIn = sessionStorage.getItem(AUTH_KEYS.adminLoggedIn);
  if (!loggedIn) {
    window.history.replaceState(null, '', '/admin/login');
    window.location.replace('/admin/login');
    return false;
  }
  // Impede o botão "Voltar" de acessar a página protegida após logout
  preventBackAfterLogout();
  return true;
}

/* ============================================================
   GUARDA DE ROTA — FUNCIONÁRIO
   ============================================================ */
function requireFuncAuth() {
  const loggedIn = sessionStorage.getItem(AUTH_KEYS.funcLoggedIn);
  if (!loggedIn) {
    // Redireciona para login do funcionário (relativo)
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

  window.addEventListener('popstate', function(e) {
    const adminLoggedIn = sessionStorage.getItem(AUTH_KEYS.adminLoggedIn);
    const funcLoggedIn  = sessionStorage.getItem(AUTH_KEYS.funcLoggedIn);
    if (!adminLoggedIn && !funcLoggedIn) {
      // Usuário não autenticado tentou voltar — redireciona
      window.location.replace(window.location.href);
    }
  });
}

/* ============================================================
   HELPERS DE SESSÃO
   ============================================================ */
function setAdminSession(nome, cargo) {
  sessionStorage.setItem(AUTH_KEYS.adminLoggedIn, '1');
  sessionStorage.setItem(AUTH_KEYS.adminNome, nome || 'Administrador');
  sessionStorage.setItem(AUTH_KEYS.adminCargo, cargo || 'Administrador');
}

function setFuncSession(data) {
  sessionStorage.setItem(AUTH_KEYS.funcLoggedIn, '1');
  if (data.nome)      sessionStorage.setItem(AUTH_KEYS.funcNome, data.nome);
  if (data.cargo)     sessionStorage.setItem(AUTH_KEYS.funcCargo, data.cargo);
  if (data.cpf)       sessionStorage.setItem(AUTH_KEYS.funcCPF, data.cpf);
  if (data.matricula) sessionStorage.setItem(AUTH_KEYS.funcMatricula, data.matricula);
}

function getAdminSession() {
  return {
    loggedIn: !!sessionStorage.getItem(AUTH_KEYS.adminLoggedIn),
    nome:     sessionStorage.getItem(AUTH_KEYS.adminNome) || 'Administrador',
    cargo:    sessionStorage.getItem(AUTH_KEYS.adminCargo) || 'Administrador',
  };
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
