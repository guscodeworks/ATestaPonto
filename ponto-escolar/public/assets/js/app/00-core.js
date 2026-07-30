'use strict';

const API_BASE = '/api';
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

function getCurrentPath() {
  return window.location.pathname || '/';
}

function isAdminPage() {
  const path = getCurrentPath();
  return path === '/admin' || path.startsWith('/admin/');
}

// Sempre retorna false: atualmente não existe uma rota de "bater ponto"
// pública (sem login) nesta aplicação. Mantido como stub para uso futuro
// caso essa rota venha a existir.
function isPublicPunchPage() {
  return false;
}

function redirectToLogin() {
  window.location.href = '/auth/govbr/login';
}
