/* ============================================================
   FUNCIONARIOS - LISTA / TABELA
   ============================================================ */

const EMPLOYEE_CARGO_LABELS = Object.freeze({
  FUNCIONARIO: 'Funcionário(a)',
  INSPETOR: 'Inspetor(a)',
  PROFESSOR: 'Professor(a)',
});

function formatarCargoFuncionario(cargo) {
  const normalized = String(cargo || '').trim().toUpperCase();
  return EMPLOYEE_CARGO_LABELS[normalized] || String(cargo || 'Não informado');
}

function formatarCpfFuncionario(cpf) {
  const raw = String(cpf || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return raw || '—';
}

function formatarTelefoneFuncionario(telefone) {
  const digits = String(telefone || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return telefone ? String(telefone) : 'Não informado';
}

function obterPontoHojeFuncionario(funcionario) {
  if (PONTOS_HOJE_DATA_ERROR) {
    return { label: 'Indisponível', className: 'badge-neutral' };
  }

  const point = PONTOS_HOJE.find(
    (item) => Number(item.funcionarioId) === Number(funcionario.id)
  );
  if (point?.status === 'completo') {
    return { label: 'Completo', className: 'badge-ok' };
  }
  if (point) {
    return { label: 'Em andamento', className: 'badge-info' };
  }
  if (!funcionario.ativo) {
    return { label: 'Não se aplica', className: 'badge-neutral' };
  }
  return { label: 'Sem ponto', className: 'badge-absent' };
}

function obterFiltrosFuncionarios() {
  return {
    q: document.getElementById('busca-funcionario')?.value || '',
    status: document.getElementById('filtro-status')?.value || '',
    cargo: document.getElementById('filtro-cargo')?.value || '',
  };
}

function existemFiltrosFuncionarios() {
  const filters = obterFiltrosFuncionarios();
  return Boolean(filters.q.trim() || filters.status || filters.cargo);
}

function obterEstadoErroFuncionarios(error) {
  const status = Number(error?.status || 0);
  if (status === 0) {
    return {
      title: 'Sem conexão com o servidor',
      description: 'Verifique sua conexão e tente carregar a lista novamente.',
    };
  }
  if (status === 401) {
    return {
      title: 'Sessão Gov.br expirada',
      description: 'Você será direcionado para entrar novamente.',
    };
  }
  if (status === 403) {
    return {
      title: 'Acesso não autorizado',
      description: 'Seu perfil Gov.br não possui permissão para consultar funcionários.',
    };
  }
  if (status >= 500) {
    return {
      title: 'Erro interno do servidor',
      description: 'A lista não pôde ser carregada agora. Tente novamente mais tarde.',
    };
  }
  return {
    title: 'Não foi possível carregar funcionários',
    description: error?.message || 'Tente carregar a lista novamente.',
  };
}

function criarEstadoListaFuncionarios({ icon, title, description, retry = false }) {
  return `
    <div class="employees-list-state" role="status">
      <div class="empty-icon"><img src="/assets/icons/${icon}.svg" alt="" aria-hidden="true"></div>
      <div class="empty-title">${escapeHtml(title)}</div>
      ${description ? `<div class="employees-state-description">${escapeHtml(description)}</div>` : ''}
      ${retry ? '<button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" data-employee-reload>Tentar novamente</button>' : ''}
    </div>
  `;
}

function criarLoadingTabelaFuncionarios() {
  return Array.from({ length: 4 }, () => `
    <tr class="employee-loading-row" aria-hidden="true">
      <td><span class="employee-skeleton employee-skeleton-name"></span></td>
      <td><span class="employee-skeleton"></span></td>
      <td><span class="employee-skeleton"></span></td>
      <td><span class="employee-skeleton"></span></td>
      <td><span class="employee-skeleton employee-skeleton-short"></span></td>
      <td><span class="employee-skeleton employee-skeleton-short"></span></td>
      <td><span class="employee-skeleton employee-skeleton-short"></span></td>
    </tr>
  `).join('');
}

function criarMenuAcoesFuncionario(funcionario) {
  const isActive = funcionario.status === 'ativo';
  const statusLabel = isActive ? 'Desativar' : 'Reativar';
  return `
    <details class="employee-actions-menu">
      <summary aria-label="Abrir ações de ${escapeHtml(funcionario.nome)}">Ações <span aria-hidden="true">⌄</span></summary>
      <div class="employee-actions-popover">
        <button type="button" data-employee-edit="${Number(funcionario.id)}">
          <img src="/assets/icons/pencil.svg" alt="" aria-hidden="true"> Editar
        </button>
        <button type="button" data-employee-status="${Number(funcionario.id)}" class="${isActive ? 'action-danger' : 'action-success'}">
          ${statusLabel}
        </button>
      </div>
    </details>
  `;
}

function criarLinhaFuncionario(funcionario) {
  const point = obterPontoHojeFuncionario(funcionario);
  return `
    <tr>
      <td>
        <div class="td-user">
          <div class="td-avatar">${escapeHtml(getIniciais(funcionario.nome))}</div>
          <div>
            <div class="td-name">${escapeHtml(funcionario.nome)}</div>
            <div class="td-email">${escapeHtml(funcionario.email || 'Sem e-mail')}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(formatarCargoFuncionario(funcionario.cargo))}</td>
      <td class="td-mono">${escapeHtml(formatarCpfFuncionario(funcionario.cpf))}</td>
      <td>${escapeHtml(formatarTelefoneFuncionario(funcionario.tel))}</td>
      <td><span class="badge ${funcionario.ativo ? 'badge-active' : 'badge-inactive'}">${funcionario.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td><span class="badge ${point.className}">${point.label}</span></td>
      <td>${criarMenuAcoesFuncionario(funcionario)}</td>
    </tr>
  `;
}

function criarCardFuncionario(funcionario) {
  const point = obterPontoHojeFuncionario(funcionario);
  return `
    <article class="func-card-item fade-in">
      <div class="employee-card-header">
        <div class="func-card-avatar">${escapeHtml(getIniciais(funcionario.nome))}</div>
        <div class="func-card-info">
          <div class="func-card-name">${escapeHtml(funcionario.nome)}</div>
          <div class="func-card-cargo">${escapeHtml(formatarCargoFuncionario(funcionario.cargo))}</div>
        </div>
        ${criarMenuAcoesFuncionario(funcionario)}
      </div>
      <dl class="employee-card-details">
        <div><dt>CPF</dt><dd>${escapeHtml(formatarCpfFuncionario(funcionario.cpf))}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(formatarTelefoneFuncionario(funcionario.tel))}</dd></div>
      </dl>
      <div class="employee-card-statuses">
        <span class="badge ${funcionario.ativo ? 'badge-active' : 'badge-inactive'}">${funcionario.ativo ? 'Ativo' : 'Inativo'}</span>
        <span class="badge ${point.className}">Ponto hoje: ${point.label}</span>
      </div>
    </article>
  `;
}

function atualizarFeedbackFuncionarios() {
  const feedback = document.getElementById('funcionarios-feedback');
  if (!feedback) return;

  if (FUNCIONARIOS_LOADING) {
    feedback.className = 'employees-feedback is-loading';
    feedback.textContent = 'Carregando funcionários…';
    return;
  }
  if (FUNCIONARIOS_DATA_ERROR) {
    const state = obterEstadoErroFuncionarios(FUNCIONARIOS_DATA_ERROR);
    feedback.className = 'employees-feedback is-error';
    feedback.textContent = state.title;
    return;
  }
  if (PONTOS_HOJE_DATA_ERROR) {
    feedback.className = 'employees-feedback is-warning';
    feedback.textContent = 'Funcionários carregados. O ponto de hoje está temporariamente indisponível.';
    return;
  }
  if (existemFiltrosFuncionarios()) {
    feedback.className = 'employees-feedback';
    feedback.textContent = `${FUNCIONARIOS_TOTAL_FILTRADO} resultado(s) para os filtros atuais.`;
    return;
  }
  feedback.className = 'employees-feedback';
  feedback.textContent = '';
}

function renderizarFuncionarios() {
  const tbody = document.getElementById('tbody-funcionarios');
  const cardList = document.getElementById('cards-funcionarios');
  const total = document.getElementById('total-func');
  const tablePanel = document.querySelector('.employees-table-panel');

  if (total) {
    total.textContent = FUNCIONARIOS_TOTAL_SISTEMA === null
      ? '—'
      : String(FUNCIONARIOS_TOTAL_SISTEMA);
  }
  if (tablePanel) tablePanel.setAttribute('aria-busy', String(FUNCIONARIOS_LOADING));
  if (cardList) cardList.setAttribute('aria-busy', String(FUNCIONARIOS_LOADING));
  atualizarFeedbackFuncionarios();

  if (FUNCIONARIOS_LOADING) {
    if (tbody) tbody.innerHTML = criarLoadingTabelaFuncionarios();
    if (cardList) {
      cardList.innerHTML = criarEstadoListaFuncionarios({
        icon: 'clock',
        title: 'Carregando funcionários',
        description: 'Consultando os dados mais recentes do sistema.',
      });
    }
    return;
  }

  if (FUNCIONARIOS_DATA_ERROR) {
    const state = obterEstadoErroFuncionarios(FUNCIONARIOS_DATA_ERROR);
    const markup = criarEstadoListaFuncionarios({
      icon: 'triangle-alert',
      title: state.title,
      description: state.description,
      retry: Number(FUNCIONARIOS_DATA_ERROR.status || 0) !== 401,
    });
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">${markup}</td></tr>`;
    if (cardList) cardList.innerHTML = markup;
    return;
  }

  if (!FUNCIONARIOS.length) {
    const filtered = existemFiltrosFuncionarios();
    const markup = criarEstadoListaFuncionarios({
      icon: 'users',
      title: filtered ? 'Nenhum resultado encontrado' : 'Nenhum funcionário cadastrado',
      description: filtered
        ? 'Revise a busca ou limpe os filtros para ver outros funcionários.'
        : 'Os funcionários cadastrados aparecerão aqui.',
    });
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">${markup}</td></tr>`;
    if (cardList) cardList.innerHTML = markup;
    return;
  }

  if (tbody) tbody.innerHTML = FUNCIONARIOS.map(criarLinhaFuncionario).join('');
  if (cardList) cardList.innerHTML = FUNCIONARIOS.map(criarCardFuncionario).join('');
}

async function recarregarListaFuncionarios() {
  FUNCIONARIOS_LOADING = true;
  FUNCIONARIOS_DATA_ERROR = null;
  renderizarFuncionarios();

  const request = carregarFuncionariosAdmin(obterFiltrosFuncionarios());
  const requestId = FUNCIONARIOS_REQUEST_ID;
  try {
    await request;
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/auth/govbr/login');
    }
  } finally {
    if (requestId === FUNCIONARIOS_REQUEST_ID) {
      FUNCIONARIOS_LOADING = false;
      renderizarFuncionarios();
    }
  }
}

const estadoStatusFuncionario = {
  id: null,
  acao: null,
  enviando: false,
  elementoOrigem: null,
  fechamentoTimer: null,
};

function elementosStatusFuncionario() {
  return {
    overlay: document.getElementById('employee-status-overlay'),
    modal: document.getElementById('employee-status-modal'),
    form: document.getElementById('employee-status-form'),
    close: document.getElementById('employee-status-close'),
    cancel: document.getElementById('employee-status-cancel'),
    icon: document.getElementById('employee-status-icon'),
    eyebrow: document.getElementById('employee-status-eyebrow'),
    title: document.getElementById('employee-status-title'),
    description: document.getElementById('employee-status-description'),
    avatar: document.getElementById('employee-status-avatar'),
    name: document.getElementById('employee-status-name'),
    role: document.getElementById('employee-status-role'),
    cpf: document.getElementById('employee-status-cpf'),
    consequence: document.getElementById('employee-status-consequence-text'),
    gate: document.getElementById('employee-status-gate'),
    confirmation: document.getElementById('employee-status-confirmation'),
    submit: document.getElementById('employee-status-submit'),
    submitLabel: document.getElementById('employee-status-submit-label'),
  };
}

function mascararCpfConfirmacao(cpf) {
  const raw = String(cpf || '');
  const finalCpf = raw.match(/(\d{2})\D*$/)?.[1];
  return `***.***.***-${finalCpf || '**'}`;
}

function modalStatusFuncionarioEstaAberto() {
  const overlay = elementosStatusFuncionario().overlay;
  return Boolean(overlay && !overlay.hidden && overlay.classList.contains('is-open'));
}

function atualizarBotaoStatusFuncionario() {
  const { confirmation, submit } = elementosStatusFuncionario();
  if (!submit) return;
  const isReactivation = estadoStatusFuncionario.acao === 'reativar';
  const exactConfirmation = confirmation?.value === 'DESATIVAR';
  submit.disabled = Boolean(
    estadoStatusFuncionario.enviando || (!isReactivation && !exactConfirmation)
  );
  if (confirmation) {
    const invalid = Boolean(confirmation.value && !exactConfirmation);
    confirmation.setAttribute('aria-invalid', String(invalid));
  }
}

function configurarModalStatusFuncionario(funcionario, isReactivation) {
  const elements = elementosStatusFuncionario();
  const action = isReactivation ? 'reativar' : 'desativar';
  estadoStatusFuncionario.acao = action;
  elements.modal.className = `employee-status-modal is-${action}`;
  elements.eyebrow.textContent = isReactivation ? 'Restaurar acesso' : 'Ação sensível';
  elements.title.textContent = isReactivation
    ? 'Reativar funcionário'
    : 'Desativar funcionário';
  elements.description.textContent = isReactivation
    ? 'Confirme quem voltará a acessar o sistema.'
    : 'Confirme os dados antes de suspender o acesso ao sistema.';
  elements.icon.src = isReactivation
    ? '/assets/icons/circle-check.svg'
    : '/assets/icons/triangle-alert.svg';
  elements.avatar.textContent = getIniciais(funcionario.nome);
  elements.name.textContent = funcionario.nome;
  elements.role.textContent = formatarCargoFuncionario(funcionario.cargo);
  elements.cpf.textContent = mascararCpfConfirmacao(funcionario.cpf);
  elements.consequence.textContent = isReactivation
    ? 'O funcionário recuperará o acesso ao sistema. Seu histórico de pontos permanecerá inalterado.'
    : 'O funcionário perderá o acesso ao sistema. Todos os registros de ponto serão preservados.';
  elements.gate.hidden = isReactivation;
  elements.confirmation.required = !isReactivation;
  elements.confirmation.value = '';
  elements.confirmation.setAttribute('aria-invalid', 'false');
  elements.submit.className = isReactivation
    ? 'ui-btn employee-status-confirm is-reactivate'
    : 'ui-btn employee-status-confirm is-danger';
  elements.submitLabel.textContent = isReactivation
    ? 'Reativar acesso'
    : 'Desativar acesso';
  atualizarBotaoStatusFuncionario();
}

function abrirModalStatusFuncionario(funcionario, trigger) {
  const elements = elementosStatusFuncionario();
  if (!elements.overlay || !elements.modal) return;
  if (estadoStatusFuncionario.fechamentoTimer) {
    window.clearTimeout(estadoStatusFuncionario.fechamentoTimer);
    estadoStatusFuncionario.fechamentoTimer = null;
  }

  const isReactivation = funcionario.status !== 'ativo';
  estadoStatusFuncionario.id = Number(funcionario.id);
  estadoStatusFuncionario.elementoOrigem = trigger || document.activeElement;
  configurarModalStatusFuncionario(funcionario, isReactivation);
  trigger?.closest('details')?.removeAttribute('open');
  elements.overlay.hidden = false;
  document.querySelector('.app-wrap')?.setAttribute('inert', '');
  document.body.classList.add('employee-status-open');
  // Garante que o estado inicial oculto seja calculado antes da transicao,
  // inclusive em navegadores com renderizacao em segundo plano reduzida.
  void elements.overlay.offsetWidth;
  elements.overlay.classList.add('is-open');
  if (isReactivation) elements.cancel?.focus();
  else elements.confirmation?.focus();
}

function fecharModalStatusFuncionario() {
  const elements = elementosStatusFuncionario();
  if (!elements.overlay) return;
  const elementoOrigem = estadoStatusFuncionario.elementoOrigem;
  elements.overlay.classList.remove('is-open');
  document.querySelector('.app-wrap')?.removeAttribute('inert');
  document.body.classList.remove('employee-status-open');
  estadoStatusFuncionario.id = null;
  estadoStatusFuncionario.acao = null;
  estadoStatusFuncionario.fechamentoTimer = window.setTimeout(() => {
    if (!elements.overlay.classList.contains('is-open')) elements.overlay.hidden = true;
    estadoStatusFuncionario.fechamentoTimer = null;
  }, 200);
  if (elementoOrigem?.isConnected) elementoOrigem.focus();
}

function solicitarFechamentoStatusFuncionario() {
  if (!modalStatusFuncionarioEstaAberto() || estadoStatusFuncionario.enviando) return;
  fecharModalStatusFuncionario();
}

function obterElementosFocaveisStatusFuncionario() {
  const modal = elementosStatusFuncionario().modal;
  if (!modal) return [];
  return Array.from(modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function manterFocoNoModalStatusFuncionario(event) {
  if (!modalStatusFuncionarioEstaAberto()) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    solicitarFechamentoStatusFuncionario();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = obterElementosFocaveisStatusFuncionario();
  if (!focusable.length) {
    event.preventDefault();
    elementosStatusFuncionario().modal?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function atualizarStatusFuncionarioNaLista(id, ativo, data = {}) {
  const index = FUNCIONARIOS.findIndex(
    (funcionario) => Number(funcionario.id) === Number(id)
  );
  if (index < 0) return;

  const funcionario = FUNCIONARIOS[index];
  const atualizado = {
    ...funcionario,
    ativo,
    status: ativo ? 'ativo' : 'inativo',
    desativado_em: ativo ? null : data.desativado_em || new Date().toISOString(),
    raw: {
      ...funcionario.raw,
      ativo,
      desativado_em: ativo ? null : data.desativado_em || new Date().toISOString(),
    },
  };
  const statusFilter = obterFiltrosFuncionarios().status;
  const doesNotMatchFilter =
    (statusFilter === 'ativo' && !ativo) ||
    (statusFilter === 'inativo' && ativo);

  if (doesNotMatchFilter) {
    FUNCIONARIOS.splice(index, 1);
    FUNCIONARIOS_TOTAL_FILTRADO = Math.max(FUNCIONARIOS_TOTAL_FILTRADO - 1, 0);
  } else {
    FUNCIONARIOS[index] = atualizado;
  }
  sincronizarFuncionariosNosPontos();
  renderizarFuncionarios();

  const newButtons = Array.from(
    document.querySelectorAll(`[data-employee-status="${Number(id)}"]`)
  );
  estadoStatusFuncionario.elementoOrigem =
    newButtons.find((button) => button.getClientRects().length > 0) ||
    newButtons[0] ||
    document.getElementById('busca-funcionario');
}

async function confirmarAlteracaoStatusFuncionario(event) {
  event.preventDefault();
  if (estadoStatusFuncionario.enviando) return;

  const elements = elementosStatusFuncionario();
  const employeeId = Number(estadoStatusFuncionario.id);
  const isReactivation = estadoStatusFuncionario.acao === 'reativar';
  if (!Number.isInteger(employeeId) || employeeId < 1) return;
  if (!isReactivation && elements.confirmation?.value !== 'DESATIVAR') {
    atualizarBotaoStatusFuncionario();
    elements.confirmation?.focus();
    return;
  }

  const action = isReactivation ? 'reativar' : 'desativar';
  const confirmation = isReactivation ? 'REATIVAR' : 'DESATIVAR';
  estadoStatusFuncionario.enviando = true;
  elements.form.setAttribute('aria-busy', 'true');
  elements.submit.disabled = true;
  elements.submit.classList.add('loading');
  elements.close.disabled = true;
  elements.cancel.disabled = true;
  elements.confirmation.disabled = true;

  try {
    const response = await adminApiFetch(
      `${ADMIN_ENDPOINTS.funcionarios}/${employeeId}/${action}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ confirmacao: confirmation }),
      }
    );
    const updatedStatus = getApiData(response) || {};
    atualizarStatusFuncionarioNaLista(employeeId, isReactivation, updatedStatus);
    fecharModalStatusFuncionario();
    toast(
      `Funcionário ${isReactivation ? 'reativado' : 'desativado'} com sucesso.`,
      'success'
    );
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/auth/govbr/login');
      return;
    }
    toast(
      escapeHtml(error.message || 'Não foi possível alterar o acesso do funcionário.'),
      'error'
    );
  } finally {
    estadoStatusFuncionario.enviando = false;
    elements.form.removeAttribute('aria-busy');
    elements.submit.classList.remove('loading');
    elements.close.disabled = false;
    elements.cancel.disabled = false;
    elements.confirmation.disabled = false;
    atualizarBotaoStatusFuncionario();
  }
}

function iniciarModalStatusFuncionario() {
  const elements = elementosStatusFuncionario();
  if (!elements.overlay || elements.overlay.dataset.initialized === 'true') return;
  elements.overlay.dataset.initialized = 'true';
  elements.close?.addEventListener('click', solicitarFechamentoStatusFuncionario);
  elements.cancel?.addEventListener('click', solicitarFechamentoStatusFuncionario);
  elements.overlay.addEventListener('click', (event) => {
    if (event.target === elements.overlay) solicitarFechamentoStatusFuncionario();
  });
  elements.confirmation?.addEventListener('input', atualizarBotaoStatusFuncionario);
  elements.form?.addEventListener('submit', confirmarAlteracaoStatusFuncionario);
  document.addEventListener('keydown', manterFocoNoModalStatusFuncionario);
}

function alterarAtivacaoFuncionario(id, button) {
  const funcionario = getFuncionarioPorId(id);
  if (!funcionario || button?.disabled || estadoStatusFuncionario.enviando) return;
  iniciarModalStatusFuncionario();
  abrirModalStatusFuncionario(funcionario, button);
}

function iniciarAcoesFuncionarios() {
  if (document.documentElement.dataset.employeeActionsInitialized === 'true') return;
  document.documentElement.dataset.employeeActionsInitialized = 'true';

  document.addEventListener('click', (event) => {
    const reloadButton = event.target.closest('[data-employee-reload]');
    if (reloadButton) {
      recarregarListaFuncionarios();
      return;
    }

    const editButton = event.target.closest('[data-employee-edit]');
    if (editButton) {
      abrirEdicao(Number(editButton.dataset.employeeEdit), editButton);
      return;
    }

    const statusButton = event.target.closest('[data-employee-status]');
    if (statusButton) {
      alterarAtivacaoFuncionario(
        Number(statusButton.dataset.employeeStatus),
        statusButton
      );
    }
  });
}

const CAMPOS_EDITAVEIS_FUNCIONARIO = Object.freeze([
  'nome',
  'email',
  'telefone',
  'cargo',
  'entrada',
  'saida_almoco',
  'retorno_almoco',
  'saida',
]);

const estadoEdicaoFuncionario = {
  id: null,
  carregando: false,
  salvando: false,
  valoresIniciais: null,
  elementoOrigem: null,
  requestId: 0,
  fechamentoTimer: null,
};

function elementosEdicaoFuncionario() {
  return {
    overlay: document.getElementById('employee-edit-overlay'),
    panel: document.getElementById('employee-edit-panel'),
    form: document.getElementById('employee-edit-form'),
    loading: document.getElementById('employee-edit-loading'),
    error: document.getElementById('employee-edit-error'),
    errorMessage: document.getElementById('employee-edit-error-message'),
    retry: document.getElementById('employee-edit-retry'),
    close: document.getElementById('employee-edit-close'),
    cancel: document.getElementById('employee-edit-cancel'),
    save: document.getElementById('employee-edit-save'),
    feedback: document.getElementById('employee-edit-feedback'),
    nome: document.getElementById('employee-edit-name'),
    cpf: document.getElementById('employee-edit-cpf'),
    email: document.getElementById('employee-edit-email'),
    telefone: document.getElementById('employee-edit-phone'),
    cargo: document.getElementById('employee-edit-cargo'),
    entrada: document.getElementById('employee-edit-entry'),
    saidaAlmoco: document.getElementById('employee-edit-lunch-out'),
    retornoAlmoco: document.getElementById('employee-edit-lunch-return'),
    saida: document.getElementById('employee-edit-exit'),
  };
}

function horarioEdicaoEmMinutos(horario) {
  const [horas, minutos] = String(horario || '').split(':').map(Number);
  return (horas * 60) + minutos;
}

function gerarOpcoesHorarioEdicao() {
  const horarios = [];
  for (let minutos = 7 * 60; minutos <= 23 * 60; minutos += 30) {
    const horas = String(Math.floor(minutos / 60)).padStart(2, '0');
    const minutosRestantes = String(minutos % 60).padStart(2, '0');
    horarios.push(`${horas}:${minutosRestantes}`);
  }
  return horarios;
}

const OPCOES_HORARIO_EDICAO = Object.freeze(gerarOpcoesHorarioEdicao());

function preencherHorarioEdicao(select, horarioAnterior = null, valorSelecionado = '') {
  if (!select) return;

  const valorNormalizado = formatarHoraApi(valorSelecionado) || '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione o horário';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.replaceChildren(placeholder);

  if (horarioAnterior === '') {
    select.disabled = true;
    return;
  }

  const limite = horarioAnterior === null
    ? null
    : horarioEdicaoEmMinutos(horarioAnterior);
  OPCOES_HORARIO_EDICAO
    .filter((horario) => limite === null || horarioEdicaoEmMinutos(horario) > limite)
    .forEach((horario) => {
      const option = document.createElement('option');
      option.value = horario;
      option.textContent = horario;
      option.selected = horario === valorNormalizado;
      select.appendChild(option);
    });

  select.disabled = false;
}

function formatarTelefoneEdicao(value) {
  const digits = somenteDigitos(value).slice(0, 11);
  if (digits.length > 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function coletarValoresEdicao() {
  const elements = elementosEdicaoFuncionario();
  return {
    nome: elements.nome?.value.trim() || '',
    email: elements.email?.value.trim() || '',
    telefone: somenteDigitos(elements.telefone?.value || '') || null,
    cargo: elements.cargo?.value || '',
    entrada: elements.entrada?.value || '',
    saida_almoco: elements.saidaAlmoco?.value || '',
    retorno_almoco: elements.retornoAlmoco?.value || '',
    saida: elements.saida?.value || '',
  };
}

function edicaoFuncionarioTemAlteracoes() {
  if (!estadoEdicaoFuncionario.valoresIniciais) return false;
  const valoresAtuais = coletarValoresEdicao();
  return CAMPOS_EDITAVEIS_FUNCIONARIO.some(
    (field) => valoresAtuais[field] !== estadoEdicaoFuncionario.valoresIniciais[field]
  );
}

function definirFeedbackEdicao(message = '', type = '') {
  const feedback = elementosEdicaoFuncionario().feedback;
  if (!feedback) return;
  feedback.className = `employee-edit-feedback${type ? ` is-${type}` : ''}`;
  feedback.textContent = message;
}

function atualizarBotaoSalvarEdicao() {
  const { form, save } = elementosEdicaoFuncionario();
  if (!save) return;
  save.disabled = Boolean(
    estadoEdicaoFuncionario.carregando ||
    estadoEdicaoFuncionario.salvando ||
    form?.hidden ||
    !edicaoFuncionarioTemAlteracoes()
  );
}

function preencherCamposEdicao(funcionario) {
  const elements = elementosEdicaoFuncionario();
  elements.nome.value = String(funcionario.nome || '');
  elements.cpf.value = formatarCpfFuncionario(funcionario.cpf);
  elements.email.value = String(funcionario.email || '');
  elements.telefone.value = formatarTelefoneEdicao(funcionario.telefone);
  elements.cargo.value = String(funcionario.cargo || '').toUpperCase();

  const entrada = formatarHoraApi(funcionario.entrada) || '';
  const saidaAlmoco = formatarHoraApi(funcionario.saida_almoco) || '';
  const retornoAlmoco = formatarHoraApi(funcionario.retorno_almoco) || '';
  const saida = formatarHoraApi(funcionario.saida) || '';
  preencherHorarioEdicao(elements.entrada, null, entrada);
  preencherHorarioEdicao(elements.saidaAlmoco, elements.entrada.value, saidaAlmoco);
  preencherHorarioEdicao(
    elements.retornoAlmoco,
    elements.saidaAlmoco.value,
    retornoAlmoco
  );
  preencherHorarioEdicao(elements.saida, elements.retornoAlmoco.value, saida);
}

function mostrarEstadoCarregandoEdicao() {
  const { form, loading, error, panel } = elementosEdicaoFuncionario();
  estadoEdicaoFuncionario.carregando = true;
  if (form) form.hidden = true;
  if (loading) loading.hidden = false;
  if (error) error.hidden = true;
  if (panel) panel.setAttribute('aria-busy', 'true');
  definirFeedbackEdicao();
  atualizarBotaoSalvarEdicao();
}

function mostrarErroEdicao(error) {
  const { form, loading, error: errorState, errorMessage, panel } = elementosEdicaoFuncionario();
  estadoEdicaoFuncionario.carregando = false;
  if (form) form.hidden = true;
  if (loading) loading.hidden = true;
  if (errorState) errorState.hidden = false;
  if (errorMessage) {
    errorMessage.textContent = error?.message || 'Tente novamente em alguns instantes.';
  }
  if (panel) panel.removeAttribute('aria-busy');
  atualizarBotaoSalvarEdicao();
}

function mostrarFormularioEdicao(funcionario) {
  const { form, loading, error, panel, nome } = elementosEdicaoFuncionario();
  preencherCamposEdicao(funcionario);
  estadoEdicaoFuncionario.carregando = false;
  estadoEdicaoFuncionario.valoresIniciais = coletarValoresEdicao();
  if (loading) loading.hidden = true;
  if (error) error.hidden = true;
  if (form) form.hidden = false;
  if (panel) panel.removeAttribute('aria-busy');
  definirFeedbackEdicao();
  atualizarBotaoSalvarEdicao();
  window.requestAnimationFrame(() => nome?.focus());
}

function painelEdicaoEstaAberto() {
  const overlay = elementosEdicaoFuncionario().overlay;
  return Boolean(overlay && !overlay.hidden && overlay.classList.contains('is-open'));
}

function abrirPainelEdicao() {
  const { overlay, panel } = elementosEdicaoFuncionario();
  if (!overlay || !panel) return false;
  if (estadoEdicaoFuncionario.fechamentoTimer) {
    window.clearTimeout(estadoEdicaoFuncionario.fechamentoTimer);
    estadoEdicaoFuncionario.fechamentoTimer = null;
  }
  overlay.hidden = false;
  document.querySelector('.app-wrap')?.setAttribute('inert', '');
  document.body.classList.add('employee-edit-open');
  window.requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    panel.focus();
  });
  return true;
}

function fecharPainelEdicao() {
  const { overlay } = elementosEdicaoFuncionario();
  if (!overlay) return;
  const elementoOrigem = estadoEdicaoFuncionario.elementoOrigem;
  estadoEdicaoFuncionario.requestId += 1;
  estadoEdicaoFuncionario.id = null;
  estadoEdicaoFuncionario.carregando = false;
  estadoEdicaoFuncionario.valoresIniciais = null;
  overlay.classList.remove('is-open');
  document.querySelector('.app-wrap')?.removeAttribute('inert');
  document.body.classList.remove('employee-edit-open');
  estadoEdicaoFuncionario.fechamentoTimer = window.setTimeout(() => {
    if (!overlay.classList.contains('is-open')) overlay.hidden = true;
    estadoEdicaoFuncionario.fechamentoTimer = null;
  }, 220);
  window.requestAnimationFrame(() => {
    if (elementoOrigem?.isConnected) elementoOrigem.focus();
  });
}

function solicitarFechamentoEdicao() {
  if (!painelEdicaoEstaAberto() || estadoEdicaoFuncionario.salvando) return;
  if (
    edicaoFuncionarioTemAlteracoes() &&
    !window.confirm('Existem alterações não salvas. Deseja descartá-las?')
  ) {
    return;
  }
  fecharPainelEdicao();
}

function obterElementosFocaveisEdicao() {
  const panel = elementosEdicaoFuncionario().panel;
  if (!panel) return [];
  return Array.from(panel.querySelectorAll(
    'button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function manterFocoNoPainelEdicao(event) {
  if (!painelEdicaoEstaAberto()) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    solicitarFechamentoEdicao();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = obterElementosFocaveisEdicao();
  if (!focusable.length) {
    event.preventDefault();
    elementosEdicaoFuncionario().panel?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function carregarFuncionarioEdicao() {
  const employeeId = Number(estadoEdicaoFuncionario.id);
  if (!Number.isInteger(employeeId) || employeeId < 1) return;
  const requestId = ++estadoEdicaoFuncionario.requestId;
  mostrarEstadoCarregandoEdicao();

  try {
    const response = await adminApiFetch(`${ADMIN_ENDPOINTS.funcionarios}/${employeeId}`);
    if (requestId !== estadoEdicaoFuncionario.requestId) return;
    const funcionario = getApiData(response)?.funcionario;
    if (!funcionario) throw new Error('A API não retornou os dados do funcionário.');
    mostrarFormularioEdicao(funcionario);
  } catch (error) {
    if (requestId !== estadoEdicaoFuncionario.requestId) return;
    if (error.status === 401) {
      window.location.replace('/auth/govbr/login');
      return;
    }
    mostrarErroEdicao(error);
  }
}

function horariosEdicaoEstaoEmOrdem(values) {
  const horarios = [
    values.entrada,
    values.saida_almoco,
    values.retorno_almoco,
    values.saida,
  ];
  if (horarios.some((horario) => !/^\d{2}:\d{2}$/.test(horario))) return false;
  const minutos = horarios.map(horarioEdicaoEmMinutos);
  return minutos.every((value, index) => index === 0 || minutos[index - 1] < value);
}

function atualizarFuncionarioEditadoNaLista(funcionarioAtualizado) {
  const index = FUNCIONARIOS.findIndex(
    (funcionario) => Number(funcionario.id) === Number(funcionarioAtualizado.id)
  );
  if (index < 0) return;

  const existente = FUNCIONARIOS[index];
  const raw = {
    ...existente.raw,
    ...funcionarioAtualizado,
    ativo: existente.ativo,
    cargo_id: funcionarioAtualizado.cargo_id ?? existente.cargo_id,
  };
  const normalizado = normalizarFuncionarioApi(raw);
  FUNCIONARIOS[index] = {
    ...existente,
    ...normalizado,
    ativo: existente.ativo,
    status: existente.status,
  };
  sincronizarFuncionariosNosPontos();
  renderizarFuncionarios();

  const novosBotoes = Array.from(
    document.querySelectorAll(`[data-employee-edit="${Number(funcionarioAtualizado.id)}"]`)
  );
  estadoEdicaoFuncionario.elementoOrigem =
    novosBotoes.find((button) => button.getClientRects().length > 0) || novosBotoes[0] || null;
}

async function salvarEdicaoFuncionario(event) {
  event.preventDefault();
  if (estadoEdicaoFuncionario.carregando || estadoEdicaoFuncionario.salvando) return;

  const elements = elementosEdicaoFuncionario();
  if (!elements.form?.checkValidity()) {
    elements.form?.reportValidity();
    definirFeedbackEdicao('Revise os campos obrigatórios antes de salvar.', 'error');
    return;
  }

  const values = coletarValoresEdicao();
  if (values.nome.length < 3) {
    definirFeedbackEdicao('Nome deve possuir ao menos 3 caracteres.', 'error');
    elements.nome?.focus();
    return;
  }
  if (values.telefone && !/^\d{10,11}$/.test(values.telefone)) {
    definirFeedbackEdicao('Telefone deve possuir 10 ou 11 dígitos.', 'error');
    elements.telefone?.focus();
    return;
  }
  if (!horariosEdicaoEstaoEmOrdem(values)) {
    definirFeedbackEdicao(
      'Os horários devem seguir a ordem: entrada, saída para almoço, retorno e saída.',
      'error'
    );
    return;
  }

  const payload = {};
  CAMPOS_EDITAVEIS_FUNCIONARIO.forEach((field) => {
    if (values[field] !== estadoEdicaoFuncionario.valoresIniciais?.[field]) {
      payload[field] = values[field];
    }
  });
  if (!Object.keys(payload).length) {
    definirFeedbackEdicao('Nenhuma alteração para salvar.', 'info');
    atualizarBotaoSalvarEdicao();
    return;
  }
  if (!window.confirm('Confirmar as alterações deste funcionário?')) return;

  estadoEdicaoFuncionario.salvando = true;
  elements.form.setAttribute('aria-busy', 'true');
  elements.save.disabled = true;
  elements.save.classList.add('loading');
  definirFeedbackEdicao('Salvando alterações…', 'info');

  try {
    const response = await adminApiFetch(
      `${ADMIN_ENDPOINTS.funcionarios}/${Number(estadoEdicaoFuncionario.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
    const funcionarioAtualizado = getApiData(response)?.funcionario || {
      id: estadoEdicaoFuncionario.id,
      ...values,
    };
    preencherCamposEdicao(funcionarioAtualizado);
    estadoEdicaoFuncionario.valoresIniciais = coletarValoresEdicao();
    atualizarFuncionarioEditadoNaLista(funcionarioAtualizado);
    definirFeedbackEdicao('Alterações salvas com sucesso.', 'success');
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('/auth/govbr/login');
      return;
    }
    definirFeedbackEdicao(
      error.message || 'Não foi possível salvar as alterações.',
      'error'
    );
  } finally {
    estadoEdicaoFuncionario.salvando = false;
    elements.form.removeAttribute('aria-busy');
    elements.save.classList.remove('loading');
    atualizarBotaoSalvarEdicao();
  }
}

function iniciarPainelEdicaoFuncionarios() {
  const elements = elementosEdicaoFuncionario();
  if (!elements.overlay || elements.overlay.dataset.initialized === 'true') return;
  elements.overlay.dataset.initialized = 'true';

  elements.close?.addEventListener('click', solicitarFechamentoEdicao);
  elements.cancel?.addEventListener('click', solicitarFechamentoEdicao);
  elements.retry?.addEventListener('click', carregarFuncionarioEdicao);
  elements.overlay.addEventListener('click', (event) => {
    if (event.target === elements.overlay) solicitarFechamentoEdicao();
  });
  elements.form?.addEventListener('submit', salvarEdicaoFuncionario);
  elements.form?.addEventListener('input', () => {
    definirFeedbackEdicao();
    atualizarBotaoSalvarEdicao();
  });
  elements.form?.addEventListener('change', () => {
    definirFeedbackEdicao();
    atualizarBotaoSalvarEdicao();
  });
  elements.telefone?.addEventListener('input', (event) => {
    event.target.value = formatarTelefoneEdicao(event.target.value);
  });
  elements.entrada?.addEventListener('change', () => {
    preencherHorarioEdicao(elements.saidaAlmoco, elements.entrada.value);
    preencherHorarioEdicao(elements.retornoAlmoco, '');
    preencherHorarioEdicao(elements.saida, '');
  });
  elements.saidaAlmoco?.addEventListener('change', () => {
    preencherHorarioEdicao(elements.retornoAlmoco, elements.saidaAlmoco.value);
    preencherHorarioEdicao(elements.saida, '');
  });
  elements.retornoAlmoco?.addEventListener('change', () => {
    preencherHorarioEdicao(elements.saida, elements.retornoAlmoco.value);
  });
  document.addEventListener('keydown', manterFocoNoPainelEdicao);
  window.addEventListener('beforeunload', (event) => {
    if (!painelEdicaoEstaAberto() || !edicaoFuncionarioTemAlteracoes()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function abrirEdicao(id, trigger = null) {
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId) || employeeId < 1) return;
  iniciarPainelEdicaoFuncionarios();
  if (!abrirPainelEdicao()) return;

  trigger?.closest('details')?.removeAttribute('open');
  estadoEdicaoFuncionario.id = employeeId;
  estadoEdicaoFuncionario.valoresIniciais = null;
  estadoEdicaoFuncionario.elementoOrigem = trigger || document.activeElement;
  carregarFuncionarioEdicao();
}
