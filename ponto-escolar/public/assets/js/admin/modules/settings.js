(function () {
  'use strict';

  const aba = document.querySelector('.settings-nav-item[data-panel="panel-permissoes"]');
  const container = document.getElementById('rbac-permissions');
  if (!aba || !container) return;

  const listaAcessos = document.getElementById('admin-access-list');
  const resultadosAcessos = document.getElementById('admin-access-results');
  const paginacaoAcessos = document.getElementById('admin-access-pagination');
  const paginaAcessos = document.getElementById('admin-access-page');
  const anteriorAcessos = document.getElementById('admin-access-prev');
  const proximaAcessos = document.getElementById('admin-access-next');
  const secaoConcessao = document.getElementById('admin-access-create');
  const formularioConcessao = document.getElementById('admin-access-create-form');
  const feedbackConcessao = document.getElementById('admin-access-create-feedback');
  const perfilConcessao = document.getElementById('access-perfil');
  const campoEscopoConcessao = document.getElementById('access-escopo-field');
  const rotuloEscopoConcessao = document.getElementById('access-escopo-label');
  const escopoConcessao = document.getElementById('access-escopo');
  const botaoConcessao = document.getElementById('admin-access-create-submit');

  let carregado = false;
  let carregando = false;
  let paginaAtualAcessos = 1;
  let carregandoAcessos = false;
  let carregandoOpcoes = false;
  let enviandoConcessao = false;
  let opcoesConcessao = [];

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

  function formatarData(data) {
    if (typeof data !== 'string') return '—';
    const partes = data.slice(0, 10).split('-');
    return partes.length === 3 ? partes.reverse().join('/') : '—';
  }

  function descreverEscopo(acesso) {
    if (acesso.perfil === 'ADMIN_SEDUC') return 'SEDUC · Global';
    if (acesso.unidade_escolar_id) {
      return `Escola · ${acesso.unidade_escolar_nome || `Unidade ${acesso.unidade_escolar_id}`}`;
    }
    if (acesso.diretoria_ensino_id) {
      return `DRE · ${acesso.diretoria_ensino_nome || `Diretoria ${acesso.diretoria_ensino_id}`}`;
    }
    return 'Escopo não informado';
  }

  function renderizarAcessos(itens, paginacao) {
    if (itens.length === 0) {
      resultadosAcessos.textContent = 'Nenhum acesso administrativo encontrado no seu escopo.';
    } else {
      const tabela = document.createElement('table');
      tabela.className = 'settings-access-table';
      const cabecalho = document.createElement('thead');
      const linhaCabecalho = document.createElement('tr');
      const colunas = ['Usuário', 'Perfil', 'Escopo', 'Status', 'Vigência'];
      colunas.forEach((titulo) => {
        linhaCabecalho.appendChild(criarCelula('th', titulo, 'col'));
      });
      cabecalho.appendChild(linhaCabecalho);
      tabela.appendChild(cabecalho);

      const corpo = document.createElement('tbody');
      itens.forEach((acesso) => {
        const linha = document.createElement('tr');
        const usuario = criarCelula('td', acesso.usuario?.nome || 'Usuário sem nome');
        if (acesso.usuario?.email) {
          const email = document.createElement('span');
          email.className = 'settings-access-detail';
          email.textContent = acesso.usuario.email;
          usuario.appendChild(email);
        }
        linha.appendChild(usuario);
        linha.appendChild(criarCelula('td', acesso.perfil || '—'));
        linha.appendChild(criarCelula('td', descreverEscopo(acesso)));
        linha.appendChild(criarCelula('td', acesso.status || '—'));
        const vigencia = criarCelula('td', `Desde ${formatarData(acesso.data_inicio)}`);
        const termino = document.createElement('span');
        termino.className = 'settings-access-detail';
        termino.textContent = acesso.data_fim ? `Até ${formatarData(acesso.data_fim)}` : 'Sem término';
        vigencia.appendChild(termino);
        linha.appendChild(vigencia);
        corpo.appendChild(linha);
      });
      tabela.appendChild(corpo);
      resultadosAcessos.replaceChildren(tabela);
    }

    paginaAtualAcessos = paginacao.page;
    const totalPaginas = Math.max(1, Math.ceil(paginacao.total / paginacao.limit));
    paginaAcessos.textContent = `Página ${paginacao.page} de ${totalPaginas} · ${paginacao.total} acesso(s)`;
    anteriorAcessos.disabled = paginacao.page <= 1;
    proximaAcessos.disabled = paginacao.page >= totalPaginas;
    paginacaoAcessos.hidden = false;
  }

  async function carregarAcessos(pagina = paginaAtualAcessos) {
    if (carregandoAcessos || !temCapacidade('acesso.listar')) return;
    carregandoAcessos = true;
    paginacaoAcessos.hidden = true;
    resultadosAcessos.textContent = 'Carregando acessos administrativos...';

    try {
      const resposta = await adminApiFetch(`/api/admin/acessos?page=${pagina}&limit=20`);
      const dados = getApiData(resposta);
      if (!Array.isArray(dados?.items) || !dados.pagination
        || !Number.isInteger(dados.pagination.page)
        || !Number.isInteger(dados.pagination.limit)
        || !Number.isInteger(dados.pagination.total)
        || dados.pagination.limit < 1 || dados.pagination.total < 0) {
        throw new Error('Resposta de acessos inválida.');
      }
      renderizarAcessos(dados.items, dados.pagination);
    } catch (_erro) {
      resultadosAcessos.textContent = 'Não foi possível carregar os acessos. Selecione a aba novamente para tentar de novo.';
    } finally {
      carregandoAcessos = false;
    }
  }

  function criarOpcao(texto, valor) {
    const opcao = document.createElement('option');
    opcao.textContent = texto;
    opcao.value = String(valor);
    return opcao;
  }

  function atualizarEscopoConcessao() {
    const selecionado = opcoesConcessao.find(({ perfil }) => perfil === perfilConcessao.value);
    escopoConcessao.replaceChildren();
    if (!selecionado || selecionado.tipo_escopo === 'SEDUC') {
      campoEscopoConcessao.hidden = true;
      escopoConcessao.disabled = true;
      escopoConcessao.required = false;
      return;
    }

    campoEscopoConcessao.hidden = false;
    escopoConcessao.disabled = false;
    escopoConcessao.required = true;
    rotuloEscopoConcessao.textContent = selecionado.tipo_escopo === 'DRE'
      ? 'Diretoria de ensino'
      : 'Unidade escolar';
    escopoConcessao.appendChild(criarOpcao('Selecione uma opção autorizada...', ''));
    selecionado.recursos.forEach(({ id, nome }) => {
      escopoConcessao.appendChild(criarOpcao(nome, id));
    });
    if (selecionado.recursos.length === 1) {
      escopoConcessao.value = String(selecionado.recursos[0].id);
    }
  }

  async function carregarOpcoesConcessao() {
    if (!secaoConcessao || carregandoOpcoes || enviandoConcessao) return;
    carregandoOpcoes = true;
    secaoConcessao.hidden = false;
    formularioConcessao.hidden = true;
    botaoConcessao.disabled = true;
    feedbackConcessao.textContent = 'Consultando perfis e escopos autorizados...';
    opcoesConcessao = [];

    try {
      const resposta = await adminApiFetch('/api/admin/acessos/opcoes-concessao');
      const perfis = getApiData(resposta)?.perfis;
      if (!Array.isArray(perfis) || perfis.some((item) =>
        !item || typeof item.perfil !== 'string'
        || !['SEDUC', 'DRE', 'ESCOLA'].includes(item.tipo_escopo)
        || !Array.isArray(item.recursos)
        || item.recursos.some((recurso) => !Number.isSafeInteger(recurso.id)
          || recurso.id < 1 || typeof recurso.nome !== 'string')
      )) {
        throw new Error('Opções de concessão inválidas.');
      }
      opcoesConcessao = perfis;
      perfilConcessao.replaceChildren(criarOpcao('Selecione um perfil...', ''));
      perfis.forEach(({ perfil }) => perfilConcessao.appendChild(criarOpcao(perfil, perfil)));
      perfilConcessao.value = '';
      atualizarEscopoConcessao();
      if (perfis.length > 0) {
        formularioConcessao.hidden = false;
        botaoConcessao.disabled = false;
        feedbackConcessao.textContent = '';
      } else {
        feedbackConcessao.textContent = 'Nenhum perfil pode ser concedido no seu escopo.';
      }
    } catch (erro) {
      feedbackConcessao.textContent = erro.message || 'Não foi possível carregar as opções de concessão.';
      if (erro.status === 401) redirecionarAdminParaGovbr();
    } finally {
      carregandoOpcoes = false;
    }
  }

  async function enviarConcessao(evento) {
    evento.preventDefault();
    if (enviandoConcessao || !temCapacidade('acesso.conceder')) return;
    const selecionado = opcoesConcessao.find(({ perfil }) => perfil === perfilConcessao.value);
    if (!selecionado) return;

    const recursoId = Number(escopoConcessao.value);
    if (selecionado.tipo_escopo !== 'SEDUC'
      && !selecionado.recursos.some(({ id }) => id === recursoId)) {
      feedbackConcessao.textContent = 'Selecione um escopo autorizado.';
      return;
    }

    const dadosFormulario = new FormData(formularioConcessao);
    const corpo = {
      cpf: String(dadosFormulario.get('cpf') || '').trim(),
      nome: String(dadosFormulario.get('nome') || '').trim(),
      perfil: selecionado.perfil,
    };
    const email = String(dadosFormulario.get('email') || '').trim();
    const dataInicio = String(dadosFormulario.get('data_inicio') || '');
    const dataFim = String(dadosFormulario.get('data_fim') || '');
    if (email) corpo.email = email;
    if (dataInicio) corpo.data_inicio = dataInicio;
    if (dataFim) corpo.data_fim = dataFim;
    if (selecionado.tipo_escopo === 'DRE') corpo.diretoria_ensino_id = recursoId;
    if (selecionado.tipo_escopo === 'ESCOLA') corpo.unidade_escolar_id = recursoId;

    enviandoConcessao = true;
    botaoConcessao.disabled = true;
    feedbackConcessao.textContent = 'Concedendo acesso...';
    try {
      await adminApiFetch('/api/admin/acessos', {
        method: 'POST',
        body: JSON.stringify(corpo),
      });
      formularioConcessao.reset();
      atualizarEscopoConcessao();
      feedbackConcessao.textContent = 'Acesso administrativo concedido.';
      if (temCapacidade('acesso.listar')) await carregarAcessos(1);
    } catch (erro) {
      feedbackConcessao.textContent = erro.message || 'Não foi possível conceder o acesso.';
      if (erro.status === 401) redirecionarAdminParaGovbr();
    } finally {
      enviandoConcessao = false;
      botaoConcessao.disabled = false;
    }
  }

  aba.addEventListener('click', () => {
    carregarPermissoes();
    if (secaoConcessao) {
      if (temCapacidade('acesso.conceder')) {
        carregarOpcoesConcessao();
      } else {
        secaoConcessao.hidden = true;
        formularioConcessao.hidden = true;
      }
    }
    if (!listaAcessos) return;
    if (!temCapacidade('acesso.listar')) {
      listaAcessos.hidden = true;
      resultadosAcessos.replaceChildren();
      return;
    }
    listaAcessos.hidden = false;
    carregarAcessos(1);
  });
  anteriorAcessos?.addEventListener('click', () => carregarAcessos(paginaAtualAcessos - 1));
  proximaAcessos?.addEventListener('click', () => carregarAcessos(paginaAtualAcessos + 1));
  perfilConcessao?.addEventListener('change', atualizarEscopoConcessao);
  formularioConcessao?.addEventListener('submit', enviarConcessao);
})();
