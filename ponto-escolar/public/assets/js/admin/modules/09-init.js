(function registrarInicializacaoAdmin() {
  if (window.__ADMIN_INIT_REGISTERED__) return;
  window.__ADMIN_INIT_REGISTERED__ = true;
  let atualizacaoPaginaId = 0;
  let inicializacaoAdminEmAndamento = false;

  function iniciarLoadingDosComponentes() {
    const seletores = [
      '.dashboard-page .stat-card',
      '.dashboard-records-panel',
      '.dashboard-presence-panel',
      '.dashboard-alerts-panel',
      '.pontos-page .stat-card',
      '.pontos-page .pontos-records-panel',
      '.reports-page .report-summary-card',
      '.reports-page .reports-chart-panel',
      '.reports-page .reports-results-panel',
      '.employees-page .employees-table-panel',
      '.employees-page #cards-funcionarios',
    ];
    return seletores
      .flatMap((seletor) => Array.from(document.querySelectorAll(seletor)))
      .map((elemento) => iniciarCarregamento(elemento, {
        tamanho: 'md',
        mensagem: 'Carregando',
      }));
  }

  function renderizarDadosAdminAtuais() {
    const existe = (selector) => Boolean(document.querySelector(selector));
    if (existe('#stat-total,#stat-ativos,#stat-presentes,#stat-ausentes,#stat-taxa,#stat-registros,#hero-presentes,#hero-ausentes,#hero-total')) renderizarStats();
    if (existe('#tbody-ultimos,#cards-ultimos-mobile')) renderizarUltimosRegistros();
    if (existe('#grafico-presenca')) renderizarGrafico();
    if (existe('#lista-alertas')) renderizarAlertas();
    if (existe('#tbody-funcionarios,#cards-funcionarios')) renderizarFuncionarios();
    if (existe('#tbody-presentes,#tbody-ausentes,#cards-presentes,#cards-ausentes')) renderizarPontosHoje();
    if (existe('#tbody-relatorio')) renderizarRelatorio();
  }

  async function atualizarDadosDaPagina(options, paginaListaFuncionarios) {
    const updateId = ++atualizacaoPaginaId;
    const carregamentos = iniciarLoadingDosComponentes();
    if (paginaListaFuncionarios) FUNCIONARIOS_LOADING = true;

    try {
      return await carregarDadosAdmin(options);
    } finally {
      if (updateId !== atualizacaoPaginaId) return;
      await Promise.all(carregamentos.map(finalizarCarregamento));
      if (paginaListaFuncionarios) FUNCIONARIOS_LOADING = false;
      renderizarDadosAdminAtuais();
    }
  }

  function iniciarRecarregamentoDeDados(options, paginaListaFuncionarios) {
    if (document.documentElement.dataset.adminDataRetryInitialized === 'true') return;
    document.documentElement.dataset.adminDataRetryInitialized = 'true';
    document.addEventListener('click', (event) => {
      const retry = event.target.closest('[data-admin-data-retry]');
      if (!retry || ADMIN_DATA_LOADING) return;
      atualizarDadosDaPagina(options, paginaListaFuncionarios);
    });
  }

  async function inicializarAdmin() {
    if (inicializacaoAdminEmAndamento) return;
    inicializacaoAdminEmAndamento = true;
    const existe = (selector) => Boolean(document.querySelector(selector));
    document.documentElement.setAttribute('data-admin-session', 'pending');
    const overlaySessao = iniciarCarregamentoGlobal({
      titulo: 'Validando acesso',
      mensagem: 'Confirmando sua sessão administrativa...',
    });

    if (existe('#topbar-time')) iniciarRelogio();
    try {
      await validarSessaoAdmin();
    } catch (error) {
      inicializacaoAdminEmAndamento = false;
      if (error.status === 401) {
        redirecionarAdminParaGovbr();
        return;
      }

      const semPermissao = error.status === 403;
      atualizarCarregamentoGlobal(overlaySessao, {
        estado: 'erro',
        titulo: semPermissao ? 'Acesso não autorizado' : 'Não foi possível validar a sessão',
        mensagem: semPermissao
          ? 'Seu perfil não possui permissão administrativa.'
          : (error.message || 'Verifique sua conexão e tente novamente.'),
        aoTentarNovamente: semPermissao ? undefined : inicializarAdmin,
        aoSair: () => redirecionarAdminParaGovbr(
          '/auth/govbr/logout',
          'Encerrando a sessão administrativa...'
        ),
      });
      return;
    }

    await finalizarCarregamentoGlobal(overlaySessao);
    document.documentElement.removeAttribute('data-admin-session');
    inicializacaoAdminEmAndamento = false;

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
    const paginaListaFuncionarios = Boolean(
      document.getElementById('tbody-funcionarios')
    );

    const dataOptions = {
      includeEmployees: precisaFuncionarios,
      includeToday: precisaPontosHoje,
      includeSummary: precisaResumo,
      includeReport: precisaRelatorio,
    };
    iniciarRecarregamentoDeDados(dataOptions, paginaListaFuncionarios);
    if (precisaFuncionarios || precisaPontosHoje || precisaResumo || precisaRelatorio) {
      await atualizarDadosDaPagina(dataOptions, paginaListaFuncionarios);
    } else {
      renderizarDadosAdminAtuais();
    }

    if (existe('#busca-funcionario,#filtro-status,#filtro-cargo')) {
      iniciarFiltrosFuncionarios();
      iniciarAcoesFuncionarios();
    }
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
