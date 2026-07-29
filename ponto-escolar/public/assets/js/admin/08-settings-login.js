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

function caminhoLogin() {
  return '/auth/govbr/login';
}

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

function sincronizarSessaoAdmin() {
  fetch('/api/admin/auth/me', {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json'
    }
  })
    .then((response) => {
      // Sessão inválida/expirada: redireciona direto para o login do
      // gov.br em vez de deixar a tela em estado inconsistente.
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
  sincronizarSessaoAdmin();
  return true;
}

function iniciarLogoutAdmin() {
  document.querySelectorAll('.btn-logout').forEach((button) => {
    // Remove handlers antigos (inline onclick e listeners anteriores)
    // antes de anexar o novo, evitando duplicidade de logout.
    button.onclick = null;
    button.removeAttribute('onclick');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = '/auth/govbr/logout';
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
