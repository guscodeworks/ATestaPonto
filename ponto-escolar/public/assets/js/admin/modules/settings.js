(function () {
  'use strict';

  const checkIcon = '<img src="/assets/icons/check.svg" alt="" aria-hidden="true" width="18" height="18">';
  const xIcon = '<img src="/assets/icons/x.svg" alt="" aria-hidden="true" width="18" height="18">';
  // Matriz estática de permissões (Admin x Funcionário) exibida na tela de
  // configurações. Não vem de API: é definida diretamente aqui no front-end.
  const permissoes = [
    ['Dashboard geral', checkIcon, xIcon],
    ['Ver todos os pontos', checkIcon, xIcon],
    ['Bater ponto', checkIcon, checkIcon],
    ['Ver próprios pontos', checkIcon, checkIcon],
    ['Cadastrar funcionários', checkIcon, xIcon],
    ['Editar funcionários', checkIcon, xIcon],
    ['Gerar relatórios', checkIcon, xIcon],
    ['Configurações do sistema', checkIcon, xIcon],
  ];

  function renderizarTabelaPermissoes() {
    const painel = document.getElementById('panel-permissoes');
    if (!painel) {
      return;
    }

    // Localiza o cabeçalho da tabela pelo conteúdo textual das colunas
    // ('Recurso', 'Admin', 'Funcionário'), já que não há um ID ou classe
    // fixa marcando essa linha no HTML.
    const cabecalho = Array.from(painel.querySelectorAll('div')).find((element) => {
      const colunas = Array.from(element.children);
      return colunas.length === 3
        && colunas[0].textContent.trim() === 'Recurso'
        && colunas[1].textContent.trim() === 'Admin'
        && colunas[2].textContent.trim() === 'Funcionário';
    });
    const tabela = cabecalho && cabecalho.parentElement;
    // Guarda de re-renderização: evita duplicar as linhas caso esta função
    // seja chamada mais de uma vez (ex.: reabertura do painel).
    if (!tabela || tabela.dataset.permissoesRenderizadas === '1') {
      return;
    }

    cabecalho.insertAdjacentHTML('afterend', permissoes.map(([r, a, f]) => `
      <div style="display:grid;grid-template-columns:1fr 100px 100px;align-items:center;padding:12px 16px;border-bottom:1px solid color-mix(in srgb, var(--color-text-muted) 24%, transparent);font-size:14px;">
        <span style="color:var(--color-text);font-weight:500;">${r}</span>
        <span style="text-align:center;font-size:17px;">${a}</span>
        <span style="text-align:center;font-size:17px;">${f}</span>
      </div>
    `).join(''));
    tabela.dataset.permissoesRenderizadas = '1';
  }

  renderizarTabelaPermissoes();
})();
