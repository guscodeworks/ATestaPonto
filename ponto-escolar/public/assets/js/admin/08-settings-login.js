/* ============================================================
   PDF / IMPRESSÃO
   ============================================================ */

function gerarPDF() {
  const btn = document.getElementById('btn-gerar-pdf');
  if (!btn) return;
  btn.classList.add('loading');
  setTimeout(() => { toast('PDF gerado com sucesso!', 'success'); btn.classList.remove('loading'); }, 1800);
}

function imprimirRelatorio() {
  toast('Abrindo janela de impressão…','info');
  setTimeout(() => window.print(), 600);
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */

function iniciarConfiguracoes() {
  const navItems = document.querySelectorAll('.settings-nav-item[data-panel]');
  if (!navItems.length) return;
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
      const target = document.getElementById(item.dataset.panel);
      if (target) target.style.display = 'block';
    });
  });
}

/* ============================================================
   LOGIN
   ============================================================ */

const ADMIN_AUTH_STORAGE_KEY = 'ponto_escolar_auth';

function carregarAuthAdmin() {
  try {
    const auth = JSON.parse(localStorage.getItem(ADMIN_AUTH_STORAGE_KEY) || '{}');
    return typeof auth.token === 'string' && auth.token ? auth : null;
  } catch (_error) {
    return null;
  }
}

function salvarAuthAdmin(token, admin) {
  localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify({ token, admin }));
}

function limparAuthAdmin() {
  localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
}

async function validarSessaoAdmin() {
  const path = window.location.pathname || '';

  if (path === '/admin/login') {
    limparAuthAdmin();
    return true;
  }

  if (!path.startsWith('/admin')) {
    return true;
  }

  const auth = carregarAuthAdmin();
  const headers = { Accept: 'application/json' };

  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  try {
    const response = await fetch('/api/admin/auth/me', {
      credentials: 'same-origin',
      headers
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.data?.admin) {
      throw new Error('Sessao invalida');
    }

    ADMIN.nome = payload.data.admin.nome || ADMIN.nome;
    if (auth?.token) {
      salvarAuthAdmin(auth.token, payload.data.admin);
    }
    return true;
  } catch (_error) {
    limparAuthAdmin();
    window.location.href = '/admin/login';
    return false;
  }
}

function iniciarLogin() {
  const form = document.getElementById('form-login');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('#btn-login');
    const email = document.getElementById('login-user')?.value?.trim() || '';
    const senha = document.getElementById('login-senha')?.value || '';

    limparAuthAdmin();

    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
    }

    try {
      const response = await fetch('/auth/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, senha })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || 'E-mail ou senha incorretos');
      }

      if (!payload.token) {
        throw new Error('Resposta de login invalida');
      }

      salvarAuthAdmin(payload.token, { email });
      window.location.href = '/admin/dashboard';
    } catch (error) {
      await fetch('/auth/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      toast(error.message || 'E-mail ou senha incorretos', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }
  });
}

function iniciarLogoutAdmin() {
  document.querySelectorAll('.btn-logout').forEach((button) => {
    button.onclick = null;
    button.removeAttribute('onclick');
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      limparAuthAdmin();

      try {
        await fetch('/auth/admin/logout', { method: 'POST', credentials: 'same-origin' });
      } finally {
        window.location.href = '/admin/login';
      }
    });
  });
}

/* ============================================================
   BUSCA E FILTROS — FUNCIONÁRIOS
   ============================================================ */

function iniciarFiltrosFuncionarios() {
  const inputBusca = document.getElementById('busca-funcionario');
  const filtroStatus = document.getElementById('filtro-status');
  const filtroCargo  = document.getElementById('filtro-cargo');

  const atualizar = () => renderizarFuncionarios(inputBusca?.value || '');

  if (inputBusca)   inputBusca.addEventListener('input', atualizar);
  if (filtroStatus) filtroStatus.addEventListener('change', atualizar);
  if (filtroCargo)  filtroCargo.addEventListener('change', atualizar);
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

