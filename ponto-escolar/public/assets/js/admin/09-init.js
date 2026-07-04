document.addEventListener('DOMContentLoaded', async () => {
  iniciarRelogio();
  iniciarLogin();

  const sessaoValida = validarSessaoAdmin();
  if (!sessaoValida) return;

  renderizarPerfil();
  iniciarLogoutAdmin();
  iniciarSidebar();
  iniciarTabs();

  // Cada seção de dados só é carregada se algum elemento da tela atual
  // realmente precisar dela, evitando chamadas de API desnecessárias em
  // páginas que não exibem todos os blocos (ex.: uma tela sem relatório
  // não dispara a busca do relatório).
  const precisaFuncionarios = Boolean(document.querySelector(
    '#tbody-funcionarios,#cards-funcionarios,#tbody-presentes,#tbody-ausentes,#tbody-relatorio,#tbody-ultimos,#stat-total,#form-registro,#grafico-presenca'
  ));
  const precisaPontosHoje = Boolean(document.querySelector(
    '#tbody-presentes,#tbody-ausentes,#tbody-ultimos,#stat-presentes,#count-presentes,#tbody-funcionarios,#grafico-presenca'
  ));
  const precisaResumo = Boolean(document.querySelector(
    '#stat-total,#hero-presentes,#relatorio-presentes,#grafico-presenca'
  ));
  const precisaRelatorio = Boolean(document.getElementById('tbody-relatorio'));

  await carregarDadosAdmin({
    includeEmployees: precisaFuncionarios,
    includeToday: precisaPontosHoje,
    includeSummary: precisaResumo,
    includeReport: precisaRelatorio,
  });

  // Erros 401 já são tratados dentro de carregarDadosAdmin (redirecionamento
  // para o login); aqui só é necessário avisar o usuário sobre outras falhas.
  if (ADMIN_DATA_ERROR && ADMIN_DATA_ERROR.status !== 401) {
    toast(ADMIN_DATA_ERROR.message || 'Nao foi possivel carregar dados administrativos.', 'error');
  }

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

  const btnPDF = document.getElementById('btn-gerar-pdf');
  const btnImprimir = document.getElementById('btn-imprimir');
  if (btnPDF) btnPDF.addEventListener('click', gerarPDF);
  if (btnImprimir) btnImprimir.addEventListener('click', imprimirRelatorio);

  document.querySelectorAll('.ui-dialog-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });
});