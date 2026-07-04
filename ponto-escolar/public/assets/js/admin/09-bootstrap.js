document.addEventListener('DOMContentLoaded', () => {
  iniciarRelogio();
  renderizarPerfil();
  iniciarSidebar();
  iniciarTabs();
  iniciarLogin();

  // Primeira renderização usa apenas o estado global local (ainda vazio
  // neste ponto); os dados reais chegam depois via recarregarDadosAdminTela()
  // ou chamada equivalente que popula FUNCIONARIOS/PONTOS_HOJE.
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
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });
});