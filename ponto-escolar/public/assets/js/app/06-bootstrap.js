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
