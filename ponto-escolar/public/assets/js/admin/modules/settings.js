(function () {
  'use strict';

  const aba = document.querySelector('.settings-nav-item[data-panel="panel-permissoes"]');
  const container = document.getElementById('rbac-permissions');
  if (!aba || !container) return;

  let carregado = false;
  let carregando = false;

  function criarCelula(tag, texto, escopo) {
    const celula = document.createElement(tag);
    celula.textContent = texto;
    if (escopo) celula.scope = escopo;
    return celula;
  }

  function renderizar(perfis) {
    const capacidades = [...new Set(perfis.flatMap(({ capacidades: lista }) => lista))];
    const tabela = document.createElement('table');
    tabela.className = 'settings-rbac-table';

    const cabecalho = document.createElement('thead');
    const linhaCabecalho = document.createElement('tr');
    linhaCabecalho.appendChild(criarCelula('th', 'Capacidade', 'col'));
    perfis.forEach(({ perfil }) => linhaCabecalho.appendChild(criarCelula('th', perfil, 'col')));
    cabecalho.appendChild(linhaCabecalho);
    tabela.appendChild(cabecalho);

    const corpo = document.createElement('tbody');
    capacidades.forEach((capacidade) => {
      const linha = document.createElement('tr');
      linha.appendChild(criarCelula('th', capacidade, 'row'));
      perfis.forEach(({ capacidades: lista }) => {
        const permitida = lista.includes(capacidade);
        const celula = criarCelula('td', permitida ? 'Sim' : 'Não');
        celula.className = permitida ? 'settings-rbac-allowed' : 'settings-rbac-denied';
        linha.appendChild(celula);
      });
      corpo.appendChild(linha);
    });
    tabela.appendChild(corpo);
    container.replaceChildren(tabela);
  }

  async function carregarPermissoes() {
    if (carregado || carregando) return;
    carregando = true;
    container.textContent = 'Carregando capacidades...';

    try {
      const resposta = await adminApiFetch('/api/admin/acessos/capacidades');
      const perfis = getApiData(resposta)?.perfis;
      if (!Array.isArray(perfis) || perfis.length === 0 || perfis.some(({ perfil, capacidades }) =>
        typeof perfil !== 'string' || !Array.isArray(capacidades)
        || capacidades.some((capacidade) => typeof capacidade !== 'string')
      )) {
        throw new Error('Resposta de capacidades inválida.');
      }
      renderizar(perfis);
      carregado = true;
    } catch (_erro) {
      container.textContent = 'Não foi possível carregar as capacidades. Selecione a aba novamente para tentar de novo.';
    } finally {
      carregando = false;
    }
  }

  aba.addEventListener('click', () => {
    carregarPermissoes();
  });
})();
