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
        throw new Error('Sessão expirada. Faça login novamente.');
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
      const message = payload?.error?.message || `Erro na requisição (${response.status})`;
      if (response.status === 401 && auth) {
        clearAuthState();
      }
      throw new Error(message);
    }

    return payload?.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tempo de requisição excedido. Tente novamente.');
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
      throw new Error('Sessão inválida');
    }
    saveAuthState(token, admin);
    renderAdminProfile(admin);
    return admin;
  } catch (error) {
    clearAuthState();
    mostrarToast(sanitizeMessage(error.message, 'Sessão expirada.'), 'error');
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

