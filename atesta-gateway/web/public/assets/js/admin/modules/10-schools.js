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

const CAPACIDADE_QR_ESCOLA = 'escola.acesso_funcionario.visualizar';

function criarBotaoQrEscola(escola) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-btn ui-btn-secondary ui-btn-sm schools-qr-button';
  button.textContent = 'QR de acesso';
  button.setAttribute('aria-label', `QR de acesso da escola ${escola.nome || ''}`.trim());
  button.addEventListener('click', () => abrirQrAcessoEscola(escola, button));
  return button;
}

// Desenha o QR (nivel M) em canvas com quiet zone de 4 modulos; branco/preto fixos para leitura.
function desenharQrEscola(canvas, texto, tamanho) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const modulos = qr.getModuleCount();
  const celula = Math.max(1, Math.floor(tamanho / (modulos + 8)));
  canvas.width = canvas.height = celula * (modulos + 8);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < modulos; r += 1) {
    for (let c = 0; c < modulos; c += 1) {
      if (qr.isDark(r, c)) ctx.fillRect((c + 4) * celula, (r + 4) * celula, celula, celula);
    }
  }
}

function mensagemErroQrEscola(erro) {
  if (erro && erro.status === 403) return 'Você não tem permissão para ver o QR de acesso desta escola.';
  if (erro && (erro.status === 0 || erro.code === 'NETWORK_ERROR')) return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  return 'Não foi possível gerar o QR de acesso agora. Tente novamente.';
}

async function abrirQrAcessoEscola(escola, button) {
  if (button.disabled) return;
  button.disabled = true;
  let dados;
  try {
    dados = getApiData(await adminApiFetch(`/api/admin/escolas/${encodeURIComponent(escola.id)}/acesso-funcionario`));
    if (!dados || typeof dados.url !== 'string' || !dados.url) throw new Error('Resposta inválida');
  } catch (erro) {
    if (erro && erro.status === 401) { redirecionarAdminParaGovbr(); return; }
    toast(mensagemErroQrEscola(erro), 'error');
    return;
  } finally {
    button.disabled = false;
  }
  const nome = dados.escola_nome || escola.nome || 'Escola';
  const url = dados.url;

  const dialogo = document.createElement('dialog');
  dialogo.className = 'qr-acesso-dialog';
  dialogo.setAttribute('aria-labelledby', 'qr-acesso-titulo');
  dialogo.innerHTML = `<h2 id="qr-acesso-titulo">QR de acesso</h2>
    <p class="qr-acesso-escola" data-nome></p>
    <canvas class="qr-acesso-canvas" role="img"></canvas>
    <p class="qr-acesso-link"><a data-link target="_blank" rel="noopener noreferrer"></a></p>
    <div class="qr-acesso-acoes">
      <button type="button" class="ui-btn ui-btn-primary" data-imprimir>Imprimir</button>
      <button type="button" class="ui-btn ui-btn-secondary" data-baixar>Baixar PNG</button>
      <button type="button" class="ui-btn ui-btn-secondary" data-copiar>Copiar link</button>
      <button type="button" class="ui-btn ui-btn-secondary" data-fechar autofocus>Fechar</button>
    </div>`;
  dialogo.querySelector('[data-nome]').textContent = nome;
  const link = dialogo.querySelector('[data-link]');
  link.textContent = url;
  link.href = url;
  const canvas = dialogo.querySelector('canvas');
  canvas.setAttribute('aria-label', `QR code de acesso ao ponto da escola ${nome}`);
  try {
    desenharQrEscola(canvas, url, 280);
  } catch (erro) {
    toast('Não foi possível gerar o QR de acesso agora. Tente novamente.', 'error');
    return;
  }

  const fechar = () => dialogo.close();
  dialogo.querySelector('[data-fechar]').addEventListener('click', fechar);
  dialogo.addEventListener('close', () => dialogo.remove());

  dialogo.querySelector('[data-baixar]').addEventListener('click', () => {
    const grande = document.createElement('canvas');
    desenharQrEscola(grande, url, 1024);
    grande.toBlob((blob) => {
      if (!blob) { dialogo.close(); toast('Não foi possível gerar o PNG.', 'error'); return; }
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'escola';
      a.href = href;
      a.download = `qr-acesso-${slug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }, 'image/png');
  });

  const copiar = dialogo.querySelector('[data-copiar]');
  copiar.addEventListener('click', async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch (erro) {
      const area = document.createElement('textarea');
      area.value = url;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      dialogo.appendChild(area);
      area.select();
      try { ok = document.execCommand('copy'); } catch (falha) { ok = false; }
      area.remove();
    }
    // Feedback inline: toast ficaria sob o dialog modal aberto.
    copiar.textContent = ok ? 'Link copiado!' : 'Não foi possível copiar';
    setTimeout(() => { copiar.textContent = 'Copiar link'; }, 2000);
  });

  dialogo.querySelector('[data-imprimir]').addEventListener('click', () => {
    const area = document.createElement('section');
    area.id = 'qr-print-area';
    const titulo = document.createElement('h1');
    titulo.textContent = nome;
    const grande = document.createElement('canvas');
    desenharQrEscola(grande, url, 1000);
    const legenda = document.createElement('p');
    legenda.textContent = 'Aponte a câmera para registrar o ponto';
    area.append(titulo, grande, legenda);
    document.body.appendChild(area);
    document.body.classList.add('qr-printing');
    const limpar = () => {
      document.body.classList.remove('qr-printing');
      area.remove();
      window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);
    window.print();
  });

  document.body.appendChild(dialogo);
  dialogo.showModal();
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
  if (temCapacidade(CAPACIDADE_QR_ESCOLA)) card.appendChild(criarBotaoQrEscola(escola));
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
  if (temCapacidade(CAPACIDADE_QR_ESCOLA)) {
    const actions = document.createElement('td');
    actions.appendChild(criarBotaoQrEscola(escola));
    row.appendChild(actions);
  }
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
  const actionsHead = document.getElementById('schools-actions-head');
  if (actionsHead) actionsHead.hidden = !temCapacidade(CAPACIDADE_QR_ESCOLA);
  let currentPage = 1;
  let totalPages = 1;
  let requestId = 0;
  let controller = null;

  function mostrarEstado(titulo, descricao, retry = false) {
    tableBody.replaceChildren();
    const tableRow = document.createElement('tr');
    const tableCell = document.createElement('td');
    tableCell.colSpan = temCapacidade(CAPACIDADE_QR_ESCOLA) ? 6 : 5;
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
