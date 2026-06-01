document.addEventListener('DOMContentLoaded', () => {
  iniciarRelogio();
  iniciarLogin(); // mantida por compatibilidade; não faz mais nada

  // Guard de rota: se não houver sessão GOV.BR válida, redireciona para ponto-login.html
  const sessaoValida = validarSessaoAdmin();
  if (!sessaoValida) return;

  renderizarPerfil();
  iniciarLogoutAdmin();
  iniciarSidebar();
  iniciarTabs();

  renderizarStats();
  renderizarUltimosRegistros();
  renderizarGrafico();
  renderizarAlertas();
  renderizarFuncionarios();
  iniciarFiltrosFuncionarios();
  renderizarPontosHoje();
  renderizarRelatorio();
  iniciarFormRegistro();
  iniciarConfiguracoes();

  const btnPDF      = document.getElementById('btn-gerar-pdf');
  const btnImprimir = document.getElementById('btn-imprimir');
  if (btnPDF)      btnPDF.addEventListener('click', gerarPDF);
  if (btnImprimir) btnImprimir.addEventListener('click', imprimirRelatorio);

  // Modal fechar ao clicar fora
  document.querySelectorAll('.ui-dialog-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });
});
