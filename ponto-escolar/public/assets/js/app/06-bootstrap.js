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

  // Autenticação + carregamento do perfil ocorrem antes de qualquer
  // roteamento específico de página, já que todas as rotas abaixo exigem
  // um admin autenticado.
  const admin = await ensureAuthenticatedAdmin();
  if (!admin) {
    return;
  }
  renderAdminProfile(admin);

  // Roteamento manual baseado no pathname: cada rota de admin dispara a
  // inicialização da tela correspondente. Não há um router genérico,
  // então uma nova página exige um novo bloco `if` aqui.
  const path = getCurrentPath();
  if (path === '/admin' || path === '/admin/dashboard') {
    await initDashboardPage();
    return;
  }
  if (path === '/admin/funcionarios') {
    await initEmployeesPage();
    return;
  }
  if (path === '/admin/funcionarios/novo') {
    await initRegisterEmployeePage();
    return;
  }
  if (path === '/admin/pontos-do-dia') {
    await initPointsPage();
    return;
  }
  if (path === '/admin/relatorios') {
    await initReportPage();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrapApp().catch((error) => {
    mostrarToast(sanitizeMessage(error.message, 'Erro ao inicializar a página.'), 'error');
  });
});