'use strict';

const SCHOOL_LIST_ENDPOINT = '/api/admin/escolas';
const SCHOOL_PAGE_SIZE = 20;

function validarAcessoPaginaEscolas() {
  const page = document.getElementById('schools-page');
  if (!page || temCapacidade('escola.listar')) return true;
  page.remove();
  window.location.replace('/admin/dashboard');
  return false;
}

function estadoListaEscolas(titulo, descricao, permitirRetry = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'schools-state';
  const heading = document.createElement('strong');
  heading.textContent = titulo;
  wrapper.appendChild(heading);
  if (descricao) {
    const text = document.createElement('p');
    text.textContent = descricao;
    wrapper.appendChild(text);
  }
  if (permitirRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'ui-btn ui-btn-secondary ui-btn-sm';
    retry.dataset.schoolsRetry = '';
    retry.textContent = 'Tentar novamente';
    wrapper.appendChild(retry);
  }
  return wrapper;
}

function formatarDataCadastroEscola(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function criarStatusEscola(ativa) {
  const status = document.createElement('span');
  status.className = `schools-status ${ativa ? 'is-active' : 'is-inactive'}`;
  status.textContent = ativa ? 'Ativa' : 'Inativa';
  return status;
}

function criarCardEscola(escola) {
  const card = document.createElement('article');
  card.className = 'schools-mobile-card';
  const name = document.createElement('h3');
  name.textContent = escola.nome || 'Escola sem nome';
  card.appendChild(name);

  const details = [
    ['Diretoria', escola.diretoria_ensino_nome || `DRE ${escola.diretoria_ensino_id}`],
    ['Cidade', escola.cidade || 'Não informada'],
    ['Código INEP', escola.codigo_inep || 'Não informado'],
    ['Cadastro', formatarDataCadastroEscola(escola.criado_em)],
  ];
  details.forEach(([label, value]) => {
    if (!value) return;
    const line = document.createElement('p');
    line.textContent = `${label}: ${value}`;
    card.appendChild(line);
  });
  card.appendChild(criarStatusEscola(escola.ativa));
  return card;
}

function criarLinhaEscola(escola) {
  const row = document.createElement('tr');
  const values = [
    escola.nome || 'Escola sem nome',
    escola.diretoria_ensino_nome || `DRE ${escola.diretoria_ensino_id}`,
    escola.cidade || 'Não informada',
    escola.codigo_inep || '—',
  ];
  values.forEach((value) => {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.appendChild(cell);
  });
  const status = document.createElement('td');
  status.appendChild(criarStatusEscola(escola.ativa));
  row.appendChild(status);
  return row;
}

function inicializarListaEscolas() {
  const page = document.getElementById('schools-page');
  if (!page || page.dataset.initialized === 'true') return;
  page.dataset.initialized = 'true';

  const form = document.getElementById('schools-filter-form');
  const search = document.getElementById('schools-query');
  const status = document.getElementById('schools-status');
  const dreFilter = document.getElementById('schools-dre-filter');
  const dre = document.getElementById('schools-dre');
  const feedback = document.getElementById('schools-feedback');
  const totalLabel = document.getElementById('schools-total');
  const tableBody = document.getElementById('schools-table-body');
  const cards = document.getElementById('schools-cards');
  const pagination = document.getElementById('schools-pagination');
  const pageLabel = document.getElementById('schools-page-label');
  const previous = document.getElementById('schools-prev');
  const next = document.getElementById('schools-next');
  const createLink = document.getElementById('school-create-link');
  if (!form || !search || !status || !feedback || !totalLabel || !tableBody || !cards
    || !pagination || !pageLabel || !previous || !next || !createLink) return;

  const podeCriar = temCapacidade('escola.criar');
  createLink.hidden = !podeCriar;
  let currentPage = 1;
  let totalPages = 1;
  let requestId = 0;
  let controller = null;

  function mostrarEstado(titulo, descricao, retry = false) {
    tableBody.replaceChildren();
    const tableRow = document.createElement('tr');
    const tableCell = document.createElement('td');
    tableCell.colSpan = 5;
    tableCell.appendChild(estadoListaEscolas(titulo, descricao, retry));
    tableRow.appendChild(tableCell);
    tableBody.appendChild(tableRow);
    cards.replaceChildren(estadoListaEscolas(titulo, descricao, retry));
  }

  function atualizarPaginacao(total, page, limit) {
    totalPages = Math.max(Math.ceil(total / limit), 1);
    const start = total === 0 ? 0 : ((page - 1) * limit) + 1;
    const end = Math.min(page * limit, total);
    totalLabel.textContent = total === 0
      ? 'Nenhuma escola encontrada.'
      : `Mostrando ${start}–${end} de ${total} escola(s).`;
    pageLabel.textContent = `Página ${page} de ${totalPages}`;
    previous.disabled = page <= 1;
    next.disabled = page >= totalPages;
    pagination.hidden = totalPages <= 1;
  }

  async function carregarEscolas() {
    const currentRequest = ++requestId;
    controller?.abort();
    controller = new AbortController();
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: String(SCHOOL_PAGE_SIZE),
    });
    const query = search.value.trim();
    if (query) params.set('q', query);
    if (status.value) params.set('ativa', status.value);
    if (dre?.value) params.set('diretoria_ensino_id', dre.value);

    page.setAttribute('aria-busy', 'true');
    feedback.dataset.state = 'loading';
    feedback.textContent = 'Carregando escolas...';
    totalLabel.textContent = 'Carregando escolas...';
    pagination.hidden = true;
    mostrarEstado('Carregando escolas', 'Aguarde enquanto consultamos as unidades do seu escopo.');

    try {
      const payload = await adminApiFetch(`${SCHOOL_LIST_ENDPOINT}?${params}`, {
        signal: controller.signal,
      });
      if (currentRequest !== requestId) return;
      const data = getApiData(payload);
      if (!Array.isArray(data?.items) || !data?.pagination) {
        throw new Error('A resposta da lista de escolas está incompleta.');
      }
      if (data.items.some((school) =>
        !school || !Number.isSafeInteger(Number(school.id)) || Number(school.id) <= 0
        || typeof school.nome !== 'string'
      )) {
        throw new Error('A resposta da lista contém dados de escola inválidos.');
      }

      const total = Number(data.pagination.total);
      const pageFromApi = Number(data.pagination.page);
      const limitFromApi = Number(data.pagination.limit);
      if (!Number.isSafeInteger(total) || total < 0
        || !Number.isSafeInteger(pageFromApi) || pageFromApi < 1
        || !Number.isSafeInteger(limitFromApi) || limitFromApi < 1) {
        throw new Error('A paginação retornada pela lista de escolas é inválida.');
      }

      tableBody.replaceChildren();
      cards.replaceChildren();
      if (data.items.length === 0) {
        const emptyText = query || status.value || dre?.value
          ? 'Nenhuma escola corresponde aos filtros selecionados.'
          : 'Ainda não há escolas disponíveis no seu escopo de acesso.';
        mostrarEstado('Nenhuma escola encontrada', emptyText);
        feedback.textContent = '';
        feedback.dataset.state = 'empty';
      } else {
        const tableFragment = document.createDocumentFragment();
        const cardFragment = document.createDocumentFragment();
        data.items.forEach((school) => {
          tableFragment.appendChild(criarLinhaEscola(school));
          cardFragment.appendChild(criarCardEscola(school));
        });
        tableBody.replaceChildren(tableFragment);
        cards.replaceChildren(cardFragment);
        feedback.textContent = '';
        feedback.dataset.state = '';
      }
      currentPage = pageFromApi;
      atualizarPaginacao(total, pageFromApi, limitFromApi);
    } catch (error) {
      if (currentRequest !== requestId || error?.name === 'AbortError') return;
      if (error?.status === 401) {
        redirecionarAdminParaGovbr();
        return;
      }
      const forbidden = error?.status === 403;
      const description = forbidden
        ? 'Seu acesso não permite listar escolas. Confira seu perfil e escopo administrativo.'
        : (error?.message || 'Não foi possível carregar as escolas. Tente novamente.');
      mostrarEstado(forbidden ? 'Acesso não autorizado' : 'Falha ao carregar escolas', description, !forbidden);
      feedback.dataset.state = 'error';
      feedback.textContent = forbidden ? description : 'A consulta falhou. Seus dados não foram alterados.';
      totalLabel.textContent = 'Lista indisponível.';
      pageLabel.textContent = 'Página não disponível';
      pagination.hidden = true;
    } finally {
      if (currentRequest === requestId) {
        page.removeAttribute('aria-busy');
        controller = null;
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    currentPage = 1;
    carregarEscolas();
  });
  status.addEventListener('change', () => {
    currentPage = 1;
    carregarEscolas();
  });
  dre?.addEventListener('change', () => {
    currentPage = 1;
    carregarEscolas();
  });
  previous.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      carregarEscolas();
    }
  });
  next.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      carregarEscolas();
    }
  });
  page.addEventListener('click', (event) => {
    if (event.target.closest('[data-schools-retry]')) carregarEscolas();
  });

  if (podeCriar && dreFilter && dre) {
    dreFilter.hidden = false;
    adminApiFetch('/api/admin/escolas/diretorias')
      .then((payload) => {
        const items = getApiData(payload)?.items;
        if (!Array.isArray(items)) throw new Error('A resposta de diretorias é inválida.');
        items.forEach((item) => {
          if (!Number.isSafeInteger(Number(item?.id)) || Number(item.id) <= 0
            || typeof item.nome !== 'string') return;
          const option = new Option(item.nome, String(item.id));
          dre.appendChild(option);
        });
      })
      .catch((error) => {
        if (error?.status === 401) {
          redirecionarAdminParaGovbr();
          return;
        }
        dreFilter.hidden = true;
        feedback.dataset.state = 'error';
        feedback.textContent = 'Não foi possível carregar o filtro de DRE. A lista continua limitada ao seu escopo.';
      });
  }

  carregarEscolas();
}
