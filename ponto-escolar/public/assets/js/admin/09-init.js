(function registrarInicializacaoAdmin() {
  if (window.__ADMIN_INIT_REGISTERED__) return;
  window.__ADMIN_INIT_REGISTERED__ = true;

  async function inicializarAdmin() {
    const existe = (selector) => Boolean(document.querySelector(selector));

    if (existe('#topbar-time')) iniciarRelogio();
    const sessaoValida = validarSessaoAdmin();
    if (!sessaoValida) return;

    if (existe('#admin-avatar,#admin-firstname,#admin-role,#sb-avatar,#sb-name,#sb-role')) renderizarPerfil();
    if (existe('.btn-logout')) iniciarLogoutAdmin();
    if (existe('#menu-toggle') && existe('#sidebar')) iniciarSidebar();
    if (existe('.tab-btn[data-tab],.ui-tab[data-tab]')) iniciarTabs();

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

    if (precisaFuncionarios || precisaPontosHoje || precisaResumo || precisaRelatorio) {
      await carregarDadosAdmin({
        includeEmployees: precisaFuncionarios,
        includeToday: precisaPontosHoje,
        includeSummary: precisaResumo,
        includeReport: precisaRelatorio,
      });
    }

    // Erros 401 já são tratados dentro de carregarDadosAdmin (redirecionamento
    // para o login); aqui só é necessário avisar o usuário sobre outras falhas.
    if (ADMIN_DATA_ERROR && ADMIN_DATA_ERROR.status !== 401) {
      toast(ADMIN_DATA_ERROR.message || 'Nao foi possivel carregar dados administrativos.', 'error');
    }

    if (existe('#stat-total,#stat-ativos,#stat-presentes,#stat-ausentes,#stat-taxa,#stat-registros,#hero-presentes,#hero-ausentes,#hero-total')) renderizarStats();
    if (existe('#tbody-ultimos,#cards-ultimos-mobile')) renderizarUltimosRegistros();
    if (existe('#grafico-presenca')) renderizarGrafico();
    if (existe('#lista-alertas')) renderizarAlertas();
    if (existe('#tbody-funcionarios,#cards-funcionarios')) renderizarFuncionarios();
    if (existe('#busca-funcionario,#filtro-status,#filtro-cargo')) iniciarFiltrosFuncionarios();
    if (existe('#tbody-presentes,#tbody-ausentes,#cards-presentes,#cards-ausentes')) renderizarPontosHoje();
    if (existe('#tbody-relatorio')) renderizarRelatorio();
    if (existe('#form-registro')) iniciarFormRegistro();
    if (existe('.settings-nav-item[data-panel]')) iniciarConfiguracoes();

    const btnPDF = document.getElementById('btn-gerar-pdf');
    const btnImprimir = document.getElementById('btn-imprimir');
    if (btnPDF) btnPDF.addEventListener('click', gerarPDF);
    if (btnImprimir) btnImprimir.addEventListener('click', imprimirRelatorio);

    document.querySelectorAll('.ui-dialog-overlay,.modal-overlay').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarAdmin, { once: true });
  } else {
    inicializarAdmin();
  }
})();
