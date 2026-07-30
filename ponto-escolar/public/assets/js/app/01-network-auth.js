async function apiRequest(endpoint, options = {}) {
  const {
    method = 'GET',
    body = undefined,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  } = options;

  // AbortController garante que a requisição seja cancelada caso
  // ultrapasse o tempo limite configurado, evitando chamadas penduradas.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      Accept: 'application/json'
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      credentials: 'same-origin',
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
      throw new Error(message);
    }

    return payload?.data;
  } catch (error) {
    // AbortError vem do timeout do AbortController; traduzido para uma
    // mensagem amigável em vez do erro técnico original.
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
    // Cargo fixo: todo admin autenticado é exibido como 'Administrador',
    // independente do que a API retornar.
    role.textContent = 'Administrador';
  }

  const generatedBy = document.getElementById('relatorio-gerado-por');
  if (generatedBy && admin?.nome) {
    generatedBy.textContent = admin.nome;
  }
}

async function ensureAuthenticatedAdmin() {
  try {
    const data = await apiRequest('/admin/auth/me');
    const admin = data?.admin || null;
    if (!admin) {
      throw new Error('Sessão inválida');
    }
    renderAdminProfile(admin);
    return admin;
  } catch (error) {
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
