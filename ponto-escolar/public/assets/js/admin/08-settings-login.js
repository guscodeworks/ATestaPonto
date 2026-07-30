/* ============================================================
   PDF / IMPRESSAO
   ============================================================ */
function gerarPDF() {
  const btn = document.getElementById('btn-gerar-pdf');
  if (!btn) return;
  btn.classList.add('loading');
  // Funcionalidade pendente: o setTimeout simula o tempo de geração
  // apenas para dar feedback visual, mas nenhum PDF é gerado de fato.
  setTimeout(() => {
    toast('Geracao de PDF ainda nao integrada. Use imprimir por enquanto.', 'info');
    btn.classList.remove('loading');
  }, 1800);
}

function imprimirRelatorio() {
  toast('Abrindo janela de impressao...', 'info');
  // Pequeno atraso para o toast ser percebido pelo usuário antes que o
  // diálogo de impressão do navegador (bloqueante) seja aberto.
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

function aplicarAdminGovbr(admin) {
  if (!admin || typeof ADMIN === 'undefined') {
    return;
  }

  ADMIN.nome = admin.nome || admin.name || ADMIN.nome;
  // Cargo fixo: nesta tela todo usuário autenticado via gov.br é tratado
  // como Administrador, independente do que a API retorne.
  ADMIN.cargo = 'Administrador';

  if (typeof renderizarPerfil === 'function') {
    renderizarPerfil();
  }

  const configAvatar = document.getElementById('config-avatar');
  const configNome = document.getElementById('config-nome');
  const configNomeField = document.getElementById('cfg-nome');
  const configEmailField = document.getElementById('cfg-email');

  if (configAvatar) configAvatar.textContent = getIniciais(ADMIN.nome);
  if (configNome) configNome.textContent = ADMIN.nome;
  if (configNomeField) configNomeField.value = ADMIN.nome;
  if (configEmailField) configEmailField.value = admin.email || '';
}

async function sincronizarSessaoAdmin() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const payload = await adminApiFetch('/api/admin/auth/me', {
      signal: controller.signal,
    });
    const admin = getApiData(payload)?.admin;
    if (!admin) {
      const error = new Error('Sessão administrativa inválida.');
      error.status = 401;
      throw error;
    }
    aplicarAdminGovbr(admin);
    return admin;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('A validação da sessão demorou mais que o esperado.');
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function validarSessaoAdmin() {
  return sincronizarSessaoAdmin();
}

function iniciarLogoutAdmin() {
  document.querySelectorAll('.btn-logout').forEach((button) => {
    // Remove handlers antigos (inline onclick e listeners anteriores)
    // antes de anexar o novo, evitando duplicidade de logout.
    button.onclick = null;
    button.removeAttribute('onclick');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      redirecionarAdminParaGovbr(
        '/auth/govbr/logout',
        'Encerrando a sessão administrativa...'
      );
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
  let searchTimer = null;

  const reload = () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    recarregarListaFuncionarios();
  };

  if (inputBusca) {
    inputBusca.addEventListener('input', () => {
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(reload, 300);
    });
  }
  if (filtroStatus) filtroStatus.addEventListener('change', reload);
  if (filtroCargo) filtroCargo.addEventListener('change', reload);
}
