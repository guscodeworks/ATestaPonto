(function () {
  'use strict';

  const checkIcon = '<img src="/icons/check.svg" alt="" aria-hidden="true" width="18" height="18">';
  const xIcon = '<img src="/icons/x.svg" alt="" aria-hidden="true" width="18" height="18">';
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

  function salvarSenha() {
    const atual = document.getElementById('pw-atual').value;
    const nova = document.getElementById('pw-nova').value;
    const conf = document.getElementById('pw-confirm').value;
    if (!atual || !nova) { toast('Preencha todos os campos', 'warning'); return; }
    if (nova.length < 8) { toast('Senha deve ter ao menos 8 caracteres', 'warning'); return; }
    if (nova !== conf) { toast('As senhas não coincidem', 'error'); return; }
    toast('Senha alterada com sucesso!', 'success');
    ['pw-atual', 'pw-nova', 'pw-confirm'].forEach(id => document.getElementById(id).value = '');
  }

  function fazerLogoutAdmin() {
    // Limpa toda a sessionStorage (não só chaves específicas) e apenas as
    // chaves conhecidas da localStorage, antes de redirecionar ao logout gov.br.
    sessionStorage.clear();
    ['admin_logged_in', 'admin_nome', 'admin_cargo'].forEach(k => localStorage.removeItem(k));
    window.location.replace('/auth/govbr/logout');
  }

  window.salvarSenha = salvarSenha;
  window.fazerLogoutAdmin = fazerLogoutAdmin;
  renderizarTabelaPermissoes();
})();