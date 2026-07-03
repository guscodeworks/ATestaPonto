'use strict';

const API_BASE = '/api';
const AUTH_STORAGE_KEY = 'ponto_escolar_auth';
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

function getCurrentPath() {
  return window.location.pathname || '/';
}

function isLoginPage() {
  const path = getCurrentPath();
  return path === '/' || path === '/login' || path === '/home';
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

/**
 * Decodifica o payload de um JWT sem biblioteca externa.
 * Não valida a assinatura — serve apenas para checar o campo `exp`.
 *
 * @param {string} token
 * @returns {object|null}
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    // atob não aceita base64url; substituímos os caracteres diferentes.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json   = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch (_e) {
    return null;
  }
}

/**
 * Verifica se um JWT está expirado com base no campo `exp` do payload.
 * Retorna true se expirado ou se não for possível decodificar.
 */
function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  // `exp` é em segundos; Date.now() em milissegundos.
  return Date.now() >= payload.exp * 1000;
}

// SECURITY NOTE: o token JWT está armazenado em localStorage, o que o torna
// acessível a qualquer script na página (vulnerável a XSS).
// Para ambientes de produção, migre para cookies httpOnly + SameSite=Strict,
// eliminando o acesso via JavaScript. Isso exige endpoint /api/auth/refresh
// e o backend servindo o cookie diretamente.
function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { token: null, admin: null };

    const parsed = JSON.parse(raw);
    const token  = typeof parsed?.token === 'string' ? parsed.token : null;

    // Limpa automaticamente tokens expirados antes de retorná-los.
    if (token && isTokenExpired(token)) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return { token: null, admin: null };
    }

    return { token, admin: parsed?.admin || null };
  } catch (_error) {
    return { token: null, admin: null };
  }
}

function saveAuthState(token, admin) {
  const payload = { token, admin };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

function clearAuthState() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getAuthToken() {
  return loadAuthState().token;
}

function redirectToLogin() {
  window.location.href = '/login';
}

function redirectToDashboard() {
  window.location.href = '/admin/dashboard';
}