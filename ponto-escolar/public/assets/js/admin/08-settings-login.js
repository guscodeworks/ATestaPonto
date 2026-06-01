/* ============================================================
   PDF / IMPRESSAO
   ============================================================ */

function gerarPDF() {
  const btn = document.getElementById('btn-gerar-pdf');
  if (!btn) return;
  btn.classList.add('loading');
  setTimeout(() => {
    toast('PDF gerado com sucesso!', 'success');
    btn.classList.remove('loading');
  }, 1800);
}

function imprimirRelatorio() {
  toast('Abrindo janela de impressao...', 'info');
  setTimeout(() => window.print(), 600);
}

/* ============================================================
   CONFIGURACOES
   ============================================================ */

function iniciarConfiguracoes() {
  const navItems = document.querySelectorAll('.settings-nav-item[data-panel]');
  if (!navItems.length) return;
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach((p) => {
        p.style.display = 'none';
      });
      const target = document.getElementById(item.dataset.panel);
      if (target) target.style.display = 'block';
    });
  });
}

/* ============================================================
   AUTENTICACAO GOV.BR
   A rota real ja e protegida pelo backend com req.session.admin.
   ============================================================ */

const ADMIN_AUTH_STORAGE_KEY = 'ponto_escolar_auth';

function carregarAuthAdmin() {
  try {
    const raw = localStorage.getItem(ADMIN_AUTH_STORAGE_KEY)
      || sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY)
      || '{}';
    const auth = JSON.parse(raw);
    return auth && auth.admin ? auth : null;
  } catch (_error) {
    return null;
  }
}

function salvarAuthAdmin(token, admin) {
  const payload = JSON.stringify({ token, admin });
  localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, payload);
  sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, payload);
}

function limparAuthAdmin() {
  localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  sessionStorage.removeItem('admin_logged_in');
  localStorage.removeItem('admin_logged_in');
  localStorage.removeItem('admin_nome');
  localStorage.removeItem('admin_cargo');
}

function caminhoLogin() {
  return '/admin/auth/start';
}

function aplicarAdminGovbr(admin) {
  if (!admin || typeof ADMIN === 'undefined') {
    return;
  }

  ADMIN.nome = admin.nome || admin.name || ADMIN.nome;
  ADMIN.cargo = 'Administrador';

  if (typeof renderizarPerfil === 'function') {
    renderizarPerfil();
  }
}

function sincronizarSessaoAdmin() {
  fetch('/api/admin/auth/me')
    .then((response) => {
      if (response.status === 401) {
        window.location.replace(caminhoLogin());
        return null;
      }
      return response.ok ? response.json() : null;
    })
    .then((payload) => {
      const admin = payload && payload.data && payload.data.admin;
      if (admin) {
        aplicarAdminGovbr(admin);
      }
    })
    .catch(() => {});
}

function validarSessaoAdmin() {
  const auth = carregarAuthAdmin();
  if (auth) {
    aplicarAdminGovbr(auth.admin);
  }

  sincronizarSessaoAdmin();
  return true;
}

function iniciarLogin() {
  // Login local removido. O fluxo comeca em /admin/auth/start.
}

function iniciarLogoutAdmin() {
  document.querySelectorAll('.btn-logout').forEach((button) => {
    button.onclick = null;
    button.removeAttribute('onclick');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      limparAuthAdmin();
      window.location.href = '/admin/auth/logout';
    });
  });
}

/* ============================================================
   BUSCA E FILTROS - FUNCIONARIOS
   ============================================================ */

function iniciarFiltrosFuncionarios() {
  const inputBusca = document.getElementById('busca-funcionario');
  const filtroStatus = document.getElementById('filtro-status');
  const filtroCargo = document.getElementById('filtro-cargo');

  const atualizar = () => renderizarFuncionarios(inputBusca?.value || '');

  if (inputBusca) inputBusca.addEventListener('input', atualizar);
  if (filtroStatus) filtroStatus.addEventListener('change', atualizar);
  if (filtroCargo) filtroCargo.addEventListener('change', atualizar);
}
