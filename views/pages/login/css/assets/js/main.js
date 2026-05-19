'use strict';

const API_BASE = '/api';
const AUTH_STORAGE_KEY = 'ponto_escolar_auth';
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

function getCurrentPath() {
  return window.location.pathname || '/';
}

function getCurrentFileName() {
  const raw = getCurrentPath().split('/').pop();
  return raw || 'index.html';
}

function isLoginPage() {
  const path = getCurrentPath();
  return path === '/' || path === '/index.html' || getCurrentFileName() === 'index.html';
}

function isAdminPage() {
  return getCurrentPath().includes('/admin/');
}

function isPublicPunchPage() {
  const path = getCurrentPath();
  return /^\/(ponto|bater-ponto)\/?$/.test(path);
}

function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return { token: null, admin: null };
    }
    const parsed = JSON.parse(raw);
    return {
      token: typeof parsed?.token === 'string' ? parsed.token : null,
      admin: parsed?.admin || null
    };
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
  window.location.href = '/index.html';
}

function redirectToDashboard() {
  window.location.href = '/admin/dashboard.html';
}

function getIniciais(nomeCompleto) {
  const partes = String(nomeCompleto || '')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!partes.length) {
    return 'AD';
  }
  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function getPrimeiroNome(nomeCompleto) {
  return String(nomeCompleto || '').trim().split(' ')[0] || 'Administrador';
}

function formatDateLong(date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function formatDateShort(dateString) {
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateString;
  }
  return parsed.toLocaleDateString('pt-BR');
}

function formatTimeFromIso(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(11, 16) || '—';
  }
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function sanitizeMessage(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function mostrarToast(mensagem, tipo = 'info', duracao = 3500) {
  const icons = {
    success: '✓',
    error: '✕',
    info: 'i'
  };

  const container = document.getElementById('toast-container');
  if (!container) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `<span>${icons[tipo] || icons.info}</span> ${mensagem}`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duracao);
}

function initClock() {
  const elHora = document.getElementById('topbar-time');
  const elData = document.getElementById('topbar-date');

  if (!elHora || !elData) {
    return;
  }

  function updateClock() {
    const now = new Date();
    elHora.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    elData.textContent = formatDateLong(now);
  }

  updateClock();
  setInterval(updateClock, 1000);
}

function initSidebar() {
  const toggleBtn = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!toggleBtn || !sidebar || !overlay) {
    return;
  }

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });
}

function bindLogoutButtons() {
  const logoutButtons = document.querySelectorAll('.logout-btn');
  logoutButtons.forEach((button) => {
    button.onclick = null;
    button.addEventListener('click', () => {
      clearAuthState();
      redirectToLogin();
    });
  });
}

function setLoadingButton(button, loadingText) {
  if (!button) {
    return () => {};
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  return () => {
    button.disabled = false;
    button.textContent = originalText;
  };
}

async function apiRequest(endpoint, options = {}) {
  const {
    method = 'GET',
    body = undefined,
    auth = true,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      Accept: 'application/json'
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (auth) {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Sessao expirada. Faca login novamente.');
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.error?.message || `Erro na requisicao (${response.status})`;
      if (response.status === 401 && auth) {
        clearAuthState();
      }
      throw new Error(message);
    }

    return payload?.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tempo de requisicao excedido. Tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function renderAdminProfile(admin) {
  const avatar = document.getElementById('admin-avatar');
  const firstName = document.getElementById('admin-firstname');
  const role = document.getElementById('admin-role');

  if (avatar) {
    avatar.textContent = getIniciais(admin?.nome || 'Administrador');
  }
  if (firstName) {
    firstName.textContent = getPrimeiroNome(admin?.nome || 'Administrador');
  }
  if (role) {
    role.textContent = 'Administrador';
  }

  const generatedBy = document.getElementById('relatorio-gerado-por');
  if (generatedBy && admin?.nome) {
    generatedBy.textContent = admin.nome;
  }
}

async function ensureAuthenticatedAdmin() {
  const token = getAuthToken();
  if (!token) {
    redirectToLogin();
    return null;
  }

  try {
    const data = await apiRequest('/admin/auth/me');
    const admin = data?.admin || null;
    if (!admin) {
      throw new Error('Sessao invalida');
    }
    saveAuthState(token, admin);
    renderAdminProfile(admin);
    return admin;
  } catch (error) {
    clearAuthState();
    mostrarToast(sanitizeMessage(error.message, 'Sessao expirada.'), 'error');
    redirectToLogin();
    return null;
  }
}

function applyCpfMask(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function attachCpfMask(inputId) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }
  input.addEventListener('input', () => {
    input.value = applyCpfMask(input.value);
  });
}

function updateEmployeePreview() {
  const nome = document.getElementById('input-nome')?.value?.trim() || '';
  const email = document.getElementById('input-email')?.value?.trim() || '';
  const cpf = document.getElementById('input-cpf')?.value?.trim() || '';
  const cargo = document.getElementById('input-cargo')?.value?.trim() || '';

  const avatar = document.getElementById('preview-avatar');
  const nomePreview = document.getElementById('preview-nome');
  const cargoPreview = document.getElementById('preview-cargo');
  const emailPreview = document.getElementById('preview-email');
  const cpfPreview = document.getElementById('preview-cpf');

  if (avatar) {
    avatar.textContent = nome ? getIniciais(nome) : '?';
  }
  if (nomePreview) {
    nomePreview.textContent = nome || 'Nome do Funcionario';
  }
  if (cargoPreview) {
    cargoPreview.textContent = cargo || 'Cargo';
  }
  if (emailPreview) {
    emailPreview.textContent = email || '—';
  }
  if (cpfPreview) {
    cpfPreview.textContent = cpf || '—';
  }
}

function mapReportRowToStatus(item) {
  if (item.status === 'COMPLETO') {
    return { css: 'badge-success', label: 'Ponto completo' };
  }
  if (item.status === 'EM_ANDAMENTO') {
    return { css: 'badge-warning', label: 'Em andamento' };
  }
  return { css: 'badge-danger', label: 'Nao bateu ponto' };
}

function bindTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn[data-tab]');
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.tab;
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.id !== targetId);
      });
    });
  });
}

function renderDashboardSummary(summary) {
  const statTotal = document.getElementById('stat-total');
  const statPresentes = document.getElementById('stat-presentes');
  const statAusentes = document.getElementById('stat-ausentes');
  const statTaxa = document.getElementById('stat-taxa');

  if (statTotal) {
    statTotal.textContent = String(summary.total_ativos ?? summary.total_funcionarios ?? 0);
  }
  if (statPresentes) {
    statPresentes.textContent = String(summary.presentes ?? 0);
  }
  if (statAusentes) {
    statAusentes.textContent = String(summary.ausentes ?? 0);
  }
  if (statTaxa) {
    statTaxa.textContent = `${summary.taxa_presenca_percent ?? 0}%`;
  }
}

async function initDashboardPage() {
  try {
    const data = await apiRequest('/admin/pontos/resumo');
    renderDashboardSummary(data.resumo || {});
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar dashboard.'), 'error');
  }
}

function renderEmployeesGrid(container, employees, presentIds) {
  if (!container) {
    return;
  }
  if (!employees.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum funcionario encontrado</div></div>';
    return;
  }
  container.innerHTML = employees
    .map((employee) => {
      const punchedToday = presentIds.has(employee.id);
      return `
        <div class="func-item-card animate-in">
          <div class="func-item-avatar">${getIniciais(employee.nome)}</div>
          <div class="func-item-info">
            <div class="func-item-name">${employee.nome}</div>
            <div class="func-item-cargo">${employee.ativo ? 'Ativo' : 'Inativo'}</div>
          </div>
          <span class="badge ${punchedToday ? 'badge-success' : 'badge-danger'}">
            ${punchedToday ? '✓' : '✕'}
          </span>
        </div>
      `;
    })
    .join('');
}

function renderEmployeesTable(tableBody, employees, presentIds) {
  if (!tableBody) {
    return;
  }
  tableBody.innerHTML = employees
    .map((employee) => {
      const punchedToday = presentIds.has(employee.id);
      const statusClass = punchedToday ? 'badge-success' : 'badge-danger';
      const statusLabel = punchedToday ? 'Ponto batido' : 'Sem ponto';
      return `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(employee.nome)}</div>
              <div>
                <div class="td-name">${employee.nome}</div>
                <div class="td-email">${employee.email}</div>
              </div>
            </div>
          </td>
          <td>${employee.ativo ? 'Ativo' : 'Inativo'}</td>
          <td style="font-family:monospace; font-size:13px;">${employee.cpf}</td>
          <td><span class="badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-ghost btn-sm js-toggle-status" data-id="${employee.id}" data-ativo="${employee.ativo ? '1' : '0'}">
                ${employee.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function initEmployeesPage() {
  const listContainer = document.getElementById('lista-funcionarios');
  const totalEmployees = document.getElementById('total-funcionarios');
  const tableBody = document.getElementById('tbody-func-tabela');
  const searchInput = document.getElementById('busca-funcionario');

  let employees = [];
  let presentIds = new Set();

  async function loadData() {
    const [employeeData, pointsData] = await Promise.all([
      apiRequest('/admin/funcionarios?page=1&limit=100'),
      apiRequest('/admin/pontos/hoje')
    ]);

    employees = employeeData?.items || [];
    presentIds = new Set((pointsData?.presentes || []).map((item) => item.funcionario.id));
    if (totalEmployees) {
      totalEmployees.textContent = String(employeeData?.pagination?.total ?? employees.length);
    }
  }

  function applyRender(filterValue = '') {
    const query = filterValue.trim().toLowerCase();
    const filtered = !query
      ? employees
      : employees.filter((employee) => {
          return (
            employee.nome.toLowerCase().includes(query) ||
            employee.email.toLowerCase().includes(query) ||
            employee.cpf.toLowerCase().includes(query)
          );
        });
    renderEmployeesGrid(listContainer, filtered, presentIds);
    renderEmployeesTable(tableBody, filtered, presentIds);
    bindEmployeeStatusButtons();
  }

  async function toggleEmployeeStatus(employeeId, currentActive) {
    const nextActive = !currentActive;
    await apiRequest(`/admin/funcionarios/${employeeId}/status`, {
      method: 'PATCH',
      body: { ativo: nextActive }
    });
    mostrarToast(`Funcionario ${nextActive ? 'ativado' : 'desativado'} com sucesso.`, 'success');
    await loadData();
    applyRender(searchInput?.value || '');
  }

  function bindEmployeeStatusButtons() {
    const buttons = document.querySelectorAll('.js-toggle-status');
    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        const employeeId = Number(button.dataset.id);
        const isActive = button.dataset.ativo === '1';
        const restore = setLoadingButton(button, 'Salvando...');
        try {
          await toggleEmployeeStatus(employeeId, isActive);
        } catch (error) {
          mostrarToast(sanitizeMessage(error.message, 'Falha ao atualizar status.'), 'error');
        } finally {
          restore();
        }
      });
    });
  }

  try {
    await loadData();
    applyRender();

    if (searchInput) {
      searchInput.addEventListener('input', () => applyRender(searchInput.value));
    }
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar funcionarios.'), 'error');
  }
}

async function initRegisterEmployeePage() {
  attachCpfMask('input-cpf');
  ['input-nome', 'input-email', 'input-cpf', 'input-cargo'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', updateEmployeePreview);
      input.addEventListener('change', updateEmployeePreview);
    }
  });
  updateEmployeePreview();

  const form = document.getElementById('form-registro');
  if (!form) {
    return;
  }

  const clearButton = document.getElementById('btn-limpar-registro');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      form.reset();
      updateEmployeePreview();
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nome = document.getElementById('input-nome')?.value?.trim() || '';
    const email = document.getElementById('input-email')?.value?.trim() || '';
    const cpf = (document.getElementById('input-cpf')?.value || '').replace(/\D/g, '');

    const submitButton = document.getElementById('btn-registrar');
    const restore = setLoadingButton(submitButton, 'Registrando...');

    try {
      await apiRequest('/admin/funcionarios', {
        method: 'POST',
        body: {
          nome,
          email,
          cpf,
          ativo: true
        }
      });
      mostrarToast('Funcionario registrado com sucesso.', 'success');
      form.reset();
      updateEmployeePreview();
    } catch (error) {
      mostrarToast(sanitizeMessage(error.message, 'Falha ao registrar funcionario.'), 'error');
    } finally {
      restore();
    }
  });
}

function renderPointsTableRows(container, rows, isAbsentTable = false) {
  if (!container) {
    return;
  }

  if (!rows.length) {
    const colSpan = isAbsentTable ? 3 : 5;
    container.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro encontrado</div></div></td></tr>`;
    return;
  }

  if (isAbsentTable) {
    container.innerHTML = rows
      .map((row) => {
        return `
          <tr>
            <td>
              <div class="td-user">
                <div class="td-avatar">${getIniciais(row.funcionario.nome)}</div>
                <div>
                  <div class="td-name">${row.funcionario.nome}</div>
                  <div class="td-email">${row.funcionario.email}</div>
                </div>
              </div>
            </td>
            <td>${row.funcionario.ativo ? 'Ativo' : 'Inativo'}</td>
            <td><span class="badge badge-danger">Nao bateu ponto</span></td>
          </tr>
        `;
      })
      .join('');
    return;
  }

  container.innerHTML = rows
    .map((row) => {
      const status = mapReportRowToStatus(row);
      return `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(row.funcionario.nome)}</div>
              <div>
                <div class="td-name">${row.funcionario.nome}</div>
                <div class="td-email">${row.funcionario.email}</div>
              </div>
            </div>
          </td>
          <td>${row.funcionario.ativo ? 'Ativo' : 'Inativo'}</td>
          <td>${formatTimeFromIso(row.entrada)}</td>
          <td>${formatTimeFromIso(row.saida)}</td>
          <td><span class="badge ${status.css}">${status.label}</span></td>
        </tr>
      `;
    })
    .join('');
}

async function initPointsPage() {
  bindTabs();
  const dataSubtitle = document.getElementById('data-ponto-sub');
  const countPresentes = document.getElementById('count-presentes');
  const countAusentes = document.getElementById('count-ausentes');
  const presentesBody = document.getElementById('tbody-presentes');
  const ausentesBody = document.getElementById('tbody-ausentes');

  try {
    const data = await apiRequest('/admin/pontos/hoje');
    const presentes = data?.presentes || [];
    const ausentes = data?.ausentes || [];
    const resumo = data?.resumo || {};

    if (dataSubtitle && data?.data_referencia) {
      dataSubtitle.textContent = `Registros de frequencia de ${formatDateShort(data.data_referencia)}`;
    }

    if (countPresentes) {
      countPresentes.textContent = String(resumo.presentes ?? presentes.length);
    }
    if (countAusentes) {
      countAusentes.textContent = String(resumo.ausentes ?? ausentes.length);
    }

    renderPointsTableRows(presentesBody, presentes, false);
    renderPointsTableRows(ausentesBody, ausentes, true);
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar pontos do dia.'), 'error');
  }
}

async function initReportPage() {
  const reportDate = document.getElementById('relatorio-data');
  const totalPresentes = document.getElementById('relatorio-presentes');
  const totalAusentes = document.getElementById('relatorio-ausentes');
  const reportBody = document.getElementById('tbody-relatorio');
  const pdfButton = document.getElementById('btn-gerar-pdf');
  const printButton = document.getElementById('btn-imprimir');
  const saveObservationButton = document.getElementById('btn-salvar-observacao');

  try {
    const data = await apiRequest('/admin/pontos/relatorio');
    const items = data?.items || [];
    const resumo = data?.resumo || {};

    if (reportDate) {
      reportDate.textContent = formatDateShort(data?.data_referencia || '');
    }
    if (totalPresentes) {
      totalPresentes.textContent = String(resumo.presentes ?? 0);
    }
    if (totalAusentes) {
      totalAusentes.textContent = String(resumo.ausentes ?? 0);
    }

    if (reportBody) {
      reportBody.innerHTML = items
        .map((item) => {
          const status = mapReportRowToStatus(item);
          return `
            <tr>
              <td>
                <div class="td-user">
                  <div class="td-avatar">${getIniciais(item.funcionario.nome)}</div>
                  <div>
                    <div class="td-name">${item.funcionario.nome}</div>
                    <div class="td-email">${item.funcionario.ativo ? 'Ativo' : 'Inativo'}</div>
                  </div>
                </div>
              </td>
              <td>${formatTimeFromIso(item.entrada)}</td>
              <td>${formatTimeFromIso(item.saida)}</td>
              <td><span class="badge ${status.css}">${status.label}</span></td>
            </tr>
          `;
        })
        .join('');
    }
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar relatorio.'), 'error');
  }

  if (pdfButton) {
    pdfButton.addEventListener('click', () => {
      mostrarToast('Exportacao PDF pode ser conectada em uma proxima etapa.', 'info');
    });
  }

  if (printButton) {
    printButton.addEventListener('click', () => window.print());
  }

  if (saveObservationButton) {
    saveObservationButton.addEventListener('click', () => {
      mostrarToast('Observacao salva com sucesso.', 'success');
    });
  }
}

async function initLoginPage() {
  const existingToken = getAuthToken();
  if (existingToken) {
    try {
      const data = await apiRequest('/admin/auth/me');
      if (data?.admin) {
        saveAuthState(existingToken, data.admin);
        redirectToDashboard();
        return;
      }
    } catch (_error) {
      clearAuthState();
    }
  }

  const form = document.getElementById('form-login');
  if (!form) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email')?.value?.trim() || '';
    const senha = document.getElementById('login-senha')?.value || '';
    const submitButton = form.querySelector('button[type="submit"]');
    const restore = setLoadingButton(submitButton, 'Entrando...');

    try {
      const data = await apiRequest('/admin/auth/login', {
        method: 'POST',
        body: { email, senha },
        auth: false
      });
      saveAuthState(data.token, data.admin);
      mostrarToast('Login realizado com sucesso.', 'success');
      setTimeout(() => redirectToDashboard(), 400);
    } catch (error) {
      mostrarToast(sanitizeMessage(error.message, 'Falha no login.'), 'error');
    } finally {
      restore();
    }
  });
}

function getCurrentLocationForPunch() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Para bater ponto, e necessario permitir o acesso a localizacao.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position?.coords?.latitude);
        const longitude = Number(position?.coords?.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new Error('Nao foi possivel obter sua localizacao. Tente novamente.'));
          return;
        }

        resolve({ latitude, longitude });
      },
      (error) => {
        if (error?.code === 1) {
          reject(new Error('Para bater ponto, e necessario permitir o acesso a localizacao.'));
          return;
        }
        reject(new Error('Nao foi possivel obter sua localizacao. Tente novamente.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  });
}

async function initPublicPunchPage() {
  attachCpfMask('ponto-cpf');

  const card = document.getElementById('auth-card');
  const brandIcon = document.getElementById('login-brand-icon');
  const brandName = document.getElementById('login-brand-name');
  const title = document.getElementById('login-title');
  const subtitle = document.getElementById('login-subtitle');
  const loginForm = document.getElementById('form-login');
  const form = document.getElementById('form-bater-ponto');
  const inputCpf = document.getElementById('ponto-cpf');
  const inputToken = document.getElementById('ponto-token');
  const submitButton = document.getElementById('btn-enviar-ponto');
  const loginFooter = document.getElementById('login-footer-admin');
  const helperFooter = document.getElementById('login-footer-public-link');
  const punchHintFooter = document.getElementById('ponto-footer-hint');

  if (card) {
    card.classList.add('punch-card');
  }
  if (brandIcon) {
    brandIcon.textContent = 'P';
  }
  if (brandName) {
    brandName.textContent = 'Bater Ponto';
  }
  if (title) {
    title.textContent = 'Registro rapido';
  }
  if (subtitle) {
    subtitle.textContent = 'Use este mesmo link com ou sem QR Code.';
  }
  if (loginForm) {
    loginForm.classList.add('hidden');
  }
  if (form) {
    form.classList.remove('hidden');
  }
  if (loginFooter) {
    loginFooter.classList.add('hidden');
  }
  if (helperFooter) {
    helperFooter.classList.add('hidden');
  }
  if (punchHintFooter) {
    punchHintFooter.classList.remove('hidden');
  }

  if (!form || !inputCpf || !inputToken) {
    return;
  }

  const queryToken = new URLSearchParams(window.location.search).get('token');
  if (queryToken && /^[a-f0-9]{64}$/i.test(queryToken.trim())) {
    inputToken.value = queryToken.trim();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const cpf = inputCpf.value.replace(/\D/g, '');
    const qrToken = inputToken.value.trim();

    if (!cpf || cpf.length !== 11) {
      mostrarToast('Informe um CPF valido com 11 digitos.', 'error');
      return;
    }
    if (!/^[a-f0-9]{64}$/i.test(qrToken)) {
      mostrarToast('Informe um token valido com 64 caracteres hex.', 'error');
      return;
    }

    const restoreSubmitButton = setLoadingButton(submitButton, 'Verificando localizacao...');

    try {
      const location = await getCurrentLocationForPunch();
      submitButton.textContent = 'Registrando...';

      const data = await apiRequest('/pontos/bater', {
        method: 'POST',
        auth: false,
        body: {
          cpf,
          qrToken,
          latitude: location.latitude,
          longitude: location.longitude
        }
      });

      const ponto = data?.ponto || {};
      mostrarToast(`Ponto registrado: ${ponto.tipo || 'OK'} (${ponto.sequencia || '-'})`, 'success');
    } catch (error) {
      mostrarToast(sanitizeMessage(error.message, 'Falha ao registrar ponto.'), 'error');
    } finally {
      restoreSubmitButton();
    }
  });
}

async function bootstrapApp() {
  initClock();
  initSidebar();
  bindLogoutButtons();

  if (isLoginPage()) {
    await initLoginPage();
    return;
  }

  if (isPublicPunchPage()) {
    await initPublicPunchPage();
    return;
  }

  if (!isAdminPage()) {
    return;
  }

  const admin = await ensureAuthenticatedAdmin();
  if (!admin) {
    return;
  }
  renderAdminProfile(admin);

  const fileName = getCurrentFileName();
  if (fileName === 'dashboard.html') {
    await initDashboardPage();
    return;
  }
  if (fileName === 'funcionarios.html') {
    await initEmployeesPage();
    return;
  }
  if (fileName === 'registrar-funcionario.html') {
    await initRegisterEmployeePage();
    return;
  }
  if (fileName === 'pontos-do-dia.html') {
    await initPointsPage();
    return;
  }
  if (fileName === 'relatorios.html') {
    await initReportPage();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrapApp().catch((error) => {
    mostrarToast(sanitizeMessage(error.message, 'Erro ao inicializar a pagina.'), 'error');
  });
});
