/* ============================================================
   ÚLTIMOS REGISTROS (dashboard)
   ============================================================ */

function renderizarUltimosRegistros() {
  const tbody = document.getElementById('tbody-ultimos');
  const cardsMobile = document.getElementById('cards-ultimos-mobile');
  const error = PONTOS_HOJE_DATA_ERROR || FUNCIONARIOS_DATA_ERROR;
  if (error) {
    const state = criarEstadoErroDadosAdmin(
      'Não foi possível carregar os registros',
      error.message,
      ![401, 403].includes(Number(error.status || 0))
    );
    if (tbody) tbody.innerHTML = `<tr><td colspan="4">${state}</td></tr>`;
    if (cardsMobile) cardsMobile.innerHTML = state;
    return;
  }
  // Mostra apenas os 5 registros mais recentes, do mais novo para o mais antigo.
  const lista = PONTOS_HOJE.slice(-5).reverse();

  if (tbody && !lista.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon"><img src="/icons/clipboard-list.svg" alt="" aria-hidden="true"></div><div class="empty-title">Nenhum registro hoje</div></div></td></tr>`;
  }

  if (tbody && lista.length) {
    const rows = lista.map((p) => {
      const func = getFuncionarioPorId(p.funcionarioId) || p.funcionario;
      if (!func) return '';
      return `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(func.nome)}</div>
              <div>
                <div class="td-name">${escapeHtml(func.nome)}</div>
                <div class="td-email">${escapeHtml(func.cargo)}</div>
              </div>
            </div>
          </td>
          <td class="td-mono">${p.entrada || '<span class="muted-dash">—</span>'}</td>
          <td class="td-mono">${p.saida || '<span class="muted-dash">—</span>'}</td>
          <td><span class="badge ${p.status==='completo'?'badge-ok':'badge-info'}">${p.status==='completo'?'Completo':'Em andamento'}</span></td>
        </tr>
      `;
    }).join('');
    tbody.innerHTML = rows;
  }

  if (cardsMobile) {
    // Versão compacta da mesma lista, exibida no layout mobile, montada em
    // um fragmento para reduzir reflow e melhor usar o DOM em telas pequenas.
    if (lista.length) {
      const fragment = document.createDocumentFragment();
      lista.forEach((p) => {
        const func = getFuncionarioPorId(p.funcionarioId) || p.funcionario;
        if (!func) return;

        const item = document.createElement('div');
        item.className = 'func-card-item';
        item.innerHTML = `
          <div class="func-card-avatar">${getIniciais(func.nome)}</div>
          <div class="func-card-info">
            <div class="func-card-name">${escapeHtml(func.nome)}</div>
            <div class="func-card-cargo mobile-point-meta">
              <span class="mobile-point-entry">Entrada: <b>${p.entrada || '—'}</b></span>
              <span class="badge mobile-point-status ${p.status==='completo'?'badge-ok':'badge-info'}">${p.status==='completo'?'Completo':'Em andamento'}</span>
            </div>
          </div>
        `;
        fragment.appendChild(item);
      });
      cardsMobile.replaceChildren(fragment);
    } else {
      cardsMobile.innerHTML = `<div class="empty-state"><div class="empty-icon"><img src="/icons/clipboard-list.svg" alt="" aria-hidden="true"></div><div class="empty-title">Nenhum registro hoje</div></div>`;
    }
  }
}

/* ============================================================
   GRÁFICO DE PRESENÇA (CSS bars)
   ============================================================ */

function renderizarGrafico() {
  const container = document.getElementById('grafico-presenca');
  if (!container) return;
  const error = PONTOS_HOJE_DATA_ERROR || FUNCIONARIOS_DATA_ERROR || RESUMO_DATA_ERROR;
  if (error) {
    container.innerHTML = criarEstadoErroDadosAdmin(
      'Não foi possível carregar a presença',
      error.message,
      ![401, 403].includes(Number(error.status || 0))
    );
    return;
  }

  // "Pendente" = bateu ponto hoje mas ainda não concluiu o expediente
  // (sem saída registrada ou status diferente de 'completo').
  const pendentes = PONTOS_HOJE.filter((ponto) => ponto.status !== 'completo' || !ponto.saida).length;
  const presentesResumo = RESUMO_PONTOS.presentes || PONTOS_HOJE.length;
  // "Presentes" do gráfico exclui os pendentes, pois estes já estão
  // contabilizados como presença mas são exibidos em categoria própria.
  const presentes = Math.max(presentesResumo - pendentes, 0);
  const ausentes = RESUMO_PONTOS.ausentes || getFuncionariosSemPonto().length;
  const total = presentes + pendentes + ausentes;

  if (!total) {
    container.innerHTML = `
      <div class="daily-presence-empty">
        <div class="daily-presence-empty-title">Sem dados para hoje</div>
        <div class="daily-presence-empty-desc">Os registros do dia aparecerao aqui assim que houver funcionarios ativos ou marcacoes de ponto.</div>
      </div>
    `;
    return;
  }

  const categorias = [
    { label: 'Presentes', value: presentes, tone: 'success' },
    { label: 'Pendentes', value: pendentes, tone: 'warning' },
    { label: 'Ausentes', value: ausentes, tone: 'danger' },
  ];

  container.innerHTML = `
    <div class="daily-presence-chart" role="img" aria-label="Distribuicao de presenca de hoje: ${presentes} presentes, ${pendentes} pendentes e ${ausentes} ausentes.">
      <div class="daily-presence-summary">
        <div>
          <div class="daily-presence-total">${total}</div>
          <div class="daily-presence-caption">funcionarios ativos</div>
        </div>
        <div class="daily-presence-caption">${DATA_REFERENCIA_PONTOS ? formatarDataReferencia(DATA_REFERENCIA_PONTOS) : 'Hoje'}</div>
      </div>
      <div class="daily-presence-bars">
        ${categorias.map((item) => {
          const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return `
            <div class="daily-presence-row">
              <div class="daily-presence-label">${item.label}</div>
              <div class="daily-presence-track" aria-hidden="true">
                <span class="daily-presence-fill ${item.tone}" data-width="${percent}%"></span>
              </div>
              <div class="daily-presence-value">${item.value}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="daily-presence-legend" aria-hidden="true">
        ${categorias.map((item) => `
          <span class="daily-presence-legend-item ${item.tone}">
            <span class="daily-presence-dot"></span>
            ${item.label}
          </span>
        `).join('')}
      </div>
    </div>
  `;

  // A largura da barra é aplicada em um segundo frame para garantir que a
  // transição CSS de 0% até o valor final seja de fato animada pelo navegador.
  requestAnimationFrame(() => {
    container.querySelectorAll('.daily-presence-fill').forEach((bar) => {
      bar.style.width = bar.dataset.width || '0%';
    });
  });
}

/* ============================================================
   ALERTAS (dashboard)
   ============================================================ */

function renderizarAlertas() {
  const container = document.getElementById('lista-alertas');
  if (!container) return;
  const error = PONTOS_HOJE_DATA_ERROR || FUNCIONARIOS_DATA_ERROR;
  if (error) {
    container.innerHTML = criarEstadoErroDadosAdmin(
      'Não foi possível carregar os alertas',
      error.message,
      ![401, 403].includes(Number(error.status || 0))
    );
    return;
  }
  const ausentes = getFuncionariosSemPonto();
  const inativos = FUNCIONARIOS.filter(f=>f.status==='inativo').length;
  // Cada regra de alerta é avaliada isoladamente e resulta em null quando
  // a condição não se aplica, para depois filtrar apenas os relevantes.
  const alertas = [
    ausentes.length > 0 ? { tipo:'amber', icon:'triangle-alert.svg', titulo:`${ausentes.length} funcionario(s) sem ponto hoje`, desc: ausentes.map(f=>f.nome).join(', ') } : null,
    inativos > 0 ? { tipo:'red', icon:'circle-x.svg', titulo:'Funcionarios inativos no sistema', desc:`${inativos} conta(s) inativa(s). Verifique o cadastro.` } : null,
  ].filter(Boolean);

  if (!alertas.length) {
    container.innerHTML = `
      <div class="alert-item blue">
        <div class="alert-icon"><img src="/icons/info.svg" alt="" aria-hidden="true"></div>
        <div class="alert-content">
          <div class="alert-title">Nenhum alerta com dados atuais</div>
          <div class="alert-desc">Os alertas exibidos aqui dependem das APIs reais de funcionarios e pontos.</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = alertas.map(a => `
    <div class="alert-item ${a.tipo}">
      <div class="alert-icon"><img src="/icons/${a.icon}" alt="" aria-hidden="true"></div>
      <div class="alert-content">
        <div class="alert-title">${escapeHtml(a.titulo)}</div>
        <div class="alert-desc">${escapeHtml(a.desc)}</div>
      </div>
    </div>
  `).join('');
}

function atualizarBotaoConfirmacaoEscola({ visivel = false, habilitado = false, emAndamento = false } = {}) {
  const botao = document.getElementById('school-create-confirm');
  if (!botao) return;
  botao.hidden = !visivel;
  botao.disabled = !habilitado || emAndamento;
  botao.textContent = emAndamento ? 'Criando escola...' : 'Confirmar criação';
  botao.setAttribute('aria-busy', String(emAndamento));
}

function mensagemErroCriacaoEscola(status, payload) {
  if (status === 400) {
    const detalhe = payload?.detail || payload?.error?.message || 'Dados da escola inválidos.';
    return `${detalhe} Revise o formulário e consulte o preview novamente.`;
  }
  if (status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (status === 403) return 'Seu acesso não permite criar uma escola nesta DRE. Confira suas permissões.';
  if (status === 404) return 'DRE ou CEP não encontrado. Revise os dados e consulte o preview novamente.';
  if (status === 409) {
    const mensagem = [payload?.detail, payload?.error?.message, payload?.message]
      .find(valor => typeof valor === 'string' && valor.trim());
    return mensagem?.trim()
      || 'Já existe uma escola com dados conflitantes nesta diretoria de ensino.';
  }
  return 'Não foi possível determinar se a criação foi concluída. A escola pode ter sido criada. Verifique a lista de escolas antes de tentar novamente, para evitar um cadastro duplicado.';
}

function mensagemErroPreviewEscola(error) {
  if (error?.status === 400) {
    return error.payload?.error?.details?.[0]?.message
      || error.payload?.detail
      || error.message
      || 'Revise os dados informados.';
  }
  if (error?.code === 'CEP_NAO_ENCONTRADO') {
    return 'CEP não encontrado. Confira os oito dígitos e tente novamente.';
  }
  if (error?.status === 404) {
    return error.payload?.detail || error.message
      || 'CEP ou diretoria não encontrados. Confira os dados e tente novamente.';
  }
  if ([502, 503, 504].includes(Number(error?.status))
    || String(error?.code || '').startsWith('CEP_')) {
    return 'Não foi possível consultar o CEP agora. Tente novamente em instantes; nenhuma escola foi criada.';
  }
  return error?.message || 'Não foi possível consultar os dados da escola. Tente novamente.';
}

function renderizarConferenciaEscola(dados, criada = false) {
  const resultado = document.getElementById('school-preview-result');
  const lista = document.getElementById('school-preview-data');
  const titulo = document.getElementById('school-preview-title');
  const campos = [
    ...(criada ? [['ID da escola', dados.id]] : []),
    ['Nome', dados.nome],
    ['Diretoria de ensino', dados.diretoria_ensino_nome || `DRE ${dados.diretoria_ensino_id}`],
    ['ID da DRE', dados.diretoria_ensino_id],
    ['Código INEP', dados.codigo_inep],
    ...(!criada ? [['CEP', dados.cep]] : []),
    ['Endereço', dados.endereco],
    ['Cidade', dados.cidade],
    ['Latitude', dados.latitude],
    ['Longitude', dados.longitude],
    ['Raio permitido (metros)', dados.raio_permitido_metros],
    ['Ativa', dados.ativa ? 'Sim' : 'Não'],
    ...(!criada ? [['Origem das coordenadas', dados.origem_coordenadas]] : []),
  ];
  lista.replaceChildren();
  campos.forEach(([rotulo, valor]) => {
    const item = document.createElement('div');
    if (rotulo === 'Nome' || rotulo === 'Endereço') item.className = 'school-preview-wide';
    const termo = document.createElement('dt');
    const conteudo = document.createElement('dd');
    termo.textContent = rotulo;
    conteudo.textContent = valor == null || valor === '' ? 'Não informado' : String(valor);
    item.append(termo, conteudo);
    lista.appendChild(item);
  });
  resultado.dataset.state = criada ? 'success'
    : (dados.latitude == null || dados.longitude == null ? 'warning' : 'ready');
  titulo.textContent = criada ? 'Escola criada' : 'Dados para conferência';
  document.getElementById('school-preview-location').textContent = criada
    ? 'Endereço e coordenadas retornados após a criação.'
    : (dados.latitude == null || dados.longitude == null
      ? 'A localização precisa ser definida antes da criação da escola. O CEP não retornou coordenadas completas.'
      : 'Confira nome, DRE, INEP, endereço, cidade, coordenadas e raio antes de confirmar.');
  if (criada) {
    atualizarBotaoConfirmacaoEscola();
    document.getElementById('school-setup-feedback').dataset.state = 'success';
    document.getElementById('school-setup-feedback').textContent = 'Escola criada com sucesso.';
    document.getElementById('school-setup-notice').textContent = 'Os dados acima são os retornados pelo cadastro da escola.';
  }
  resultado.hidden = false;
  titulo.focus();
}

// Preview e confirmacao usam somente a API Node da mesma origem.
async function iniciarAcaoAdicionarEscola() {
  const painel = document.getElementById('school-setup');
  const fechar = document.getElementById('school-setup-close');
  const introducao = document.getElementById('school-setup-intro');
  const diretoria = document.getElementById('school-setup-dre');
  const cep = document.getElementById('school-setup-cep');
  const erroCep = document.getElementById('school-cep-error');
  const inep = document.getElementById('school-setup-inep');
  const erroInep = document.getElementById('school-inep-error');
  const raio = document.getElementById('school-setup-radius');
  const erroRaio = document.getElementById('school-radius-error');
  const feedback = document.getElementById('school-setup-feedback');
  const form = document.getElementById('school-preview-form');
  const consultar = document.getElementById('school-preview-submit');
  const resultado = document.getElementById('school-preview-result');
  const dadosPreview = document.getElementById('school-preview-data');
  const localizacao = document.getElementById('school-preview-location');
  const confirmar = document.getElementById('school-create-confirm');
  const aviso = document.getElementById('school-setup-notice');
  if (!painel || !fechar || !introducao || !diretoria || !cep || !erroCep || !inep || !erroInep || !raio || !erroRaio || !feedback
    || !form || !consultar || !resultado || !dadosPreview || !localizacao || !confirmar || !aviso) return;
  painel.hidden = true;
  if (!temCapacidade('escola.criar')) return;

  let requisicaoPreview = null;
  let dadosOriginaisPreview = null;
  let criacaoEmAndamento = false;

  function atualizarDisponibilidadePreview() {
    consultar.disabled = !diretoria.value || !/^[0-9]{5}-[0-9]{3}$/.test(cep.value)
      || !inep.validity.valid || !raio.validity.valid || Boolean(requisicaoPreview) || criacaoEmAndamento;
  }

  function atualizarCep(mostrarErro) {
    const cursor = cep.selectionStart;
    const digitosAntes = cep.value.slice(0, cursor ?? cep.value.length).replace(/[^0-9]/g, '').length;
    const digitos = cep.value.replace(/[^0-9]/g, '').slice(0, 8);
    cep.value = digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
    if (cursor != null) {
      const posicao = Math.min(digitosAntes + (digitosAntes > 5 ? 1 : 0), cep.value.length);
      cep.setSelectionRange(posicao, posicao);
    }
    const valido = digitos.length === 8;
    const mensagem = valido ? '' : 'Informe um CEP com 8 dígitos.';
    cep.setCustomValidity(mensagem);
    erroCep.textContent = mostrarErro ? mensagem : '';
    cep.setAttribute('aria-invalid', String(mostrarErro && !valido));
    atualizarDisponibilidadePreview();
  }

  cep.addEventListener('beforeinput', (event) => {
    const inicio = cep.selectionStart;
    if (inicio == null || inicio !== cep.selectionEnd) return;
    // Ao apagar junto à máscara, remova também o dígito adjacente.
    if (event.inputType === 'deleteContentBackward' && cep.value[inicio - 1] === '-') {
      cep.setSelectionRange(inicio - 2, inicio);
    } else if (event.inputType === 'deleteContentForward' && cep.value[inicio] === '-') {
      cep.setSelectionRange(inicio, inicio + 2);
    }
  });
  cep.addEventListener('input', () => atualizarCep(true));
  cep.addEventListener('blur', () => atualizarCep(true));
  function atualizarInep(mostrarErro) {
    const cursor = inep.selectionStart;
    const posicao = inep.value.slice(0, cursor ?? inep.value.length).replace(/[^0-9]/g, '').length;
    inep.value = inep.value.replace(/[^0-9]/g, '').slice(0, 8);
    if (cursor != null) inep.setSelectionRange(Math.min(posicao, inep.value.length), Math.min(posicao, inep.value.length));
    inep.setCustomValidity('');
    const invalido = inep.validity.patternMismatch;
    const mensagem = invalido ? 'Informe os 8 dígitos do código INEP ou deixe o campo vazio.' : '';
    inep.setCustomValidity(mensagem);
    erroInep.textContent = mostrarErro ? mensagem : '';
    inep.setAttribute('aria-invalid', String(mostrarErro && invalido));
    atualizarDisponibilidadePreview();
  }
  inep.addEventListener('input', () => atualizarInep(true));
  inep.addEventListener('blur', () => atualizarInep(true));
  function atualizarRaio(mostrarErro) {
    raio.setCustomValidity('');
    let mensagem = '';
    if (raio.validity.badInput || (raio.value && !/^[0-9]+$/.test(raio.value))) {
      mensagem = 'Use apenas números inteiros, sem sinais ou casas decimais.';
    } else if (!raio.value) {
      mensagem = 'Informe o raio permitido em metros.';
    } else if (raio.validity.rangeUnderflow) {
      mensagem = 'O raio mínimo permitido é 10 metros.';
    } else if (raio.validity.rangeOverflow) {
      mensagem = 'O raio máximo permitido é 1.000 metros.';
    }
    raio.setCustomValidity(mensagem);
    erroRaio.textContent = mostrarErro ? mensagem : '';
    raio.setAttribute('aria-invalid', String(mostrarErro && Boolean(mensagem)));
    atualizarDisponibilidadePreview();
  }
  function bloquearEntradaRaio(event) {
    event.preventDefault();
    const mensagem = 'Use apenas números inteiros, sem sinais ou casas decimais.';
    raio.setCustomValidity(mensagem);
    erroRaio.textContent = mensagem;
    raio.setAttribute('aria-invalid', 'true');
    atualizarDisponibilidadePreview();
  }
  raio.addEventListener('beforeinput', (event) => {
    if (event.data && !/^[0-9]+$/.test(event.data)) bloquearEntradaRaio(event);
  });
  raio.addEventListener('paste', (event) => {
    if (event.clipboardData && !/^[0-9]+$/.test(event.clipboardData.getData('text'))) {
      bloquearEntradaRaio(event);
    }
  });
  raio.addEventListener('input', () => atualizarRaio(true));
  raio.addEventListener('blur', () => atualizarRaio(true));

  [cep, inep].forEach((campo) => {
    campo.addEventListener('paste', (event) => {
      if (!event.clipboardData) return;
      event.preventDefault();
      const digitos = event.clipboardData.getData('text').replace(/[^0-9]/g, '');
      campo.setRangeText(digitos, campo.selectionStart ?? 0, campo.selectionEnd ?? campo.value.length, 'end');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  function dadosFormulario() {
    return {
      nome: document.getElementById('school-setup-name').value,
      diretoria_ensino_id: Number(diretoria.value),
      cep: cep.value.replace(/[^0-9]/g, ''),
      codigo_inep: inep.value || null,
      raio_permitido_metros: raio.valueAsNumber,
    };
  }

  function limparPreview() {
    if (criacaoEmAndamento) return;
    requisicaoPreview?.abort();
    requisicaoPreview = null;
    dadosOriginaisPreview = null;
    atualizarBotaoConfirmacaoEscola();
    resultado.hidden = true;
    dadosPreview.replaceChildren();
    localizacao.textContent = '';
    atualizarDisponibilidadePreview();
    consultar.textContent = 'Consultar preview';
    form.removeAttribute('aria-busy');
    aviso.textContent = 'A escola será criada somente após a confirmação. O endereço e as coordenadas serão consultados novamente.';
  }

  function preencherDiretorias(itens) {
    const ajuda = document.getElementById('school-dre-help');
    if (ajuda) ajuda.textContent = itens.length === 1
      ? 'Preenchida automaticamente: única DRE autorizada para seu acesso.'
      : (itens.length > 1 ? 'Selecione uma das DREs autorizadas para seu acesso.' : '');
    diretoria.replaceChildren();
    itens.forEach(({ id, nome }) => {
      const opcao = document.createElement('option');
      opcao.value = String(id);
      opcao.textContent = nome;
      diretoria.appendChild(opcao);
    });
    if (itens.length === 0) {
      diretoria.disabled = true;
      consultar.disabled = true;
      feedback.dataset.state = 'error';
      feedback.textContent = 'Nenhuma diretoria autorizada está disponível.';
      return;
    }
    diretoria.value = String(itens[0].id);
    diretoria.disabled = itens.length === 1;
    atualizarDisponibilidadePreview();
    feedback.dataset.state = 'info';
    feedback.textContent = 'A escola ficará vinculada a uma das DREs autorizadas para seu acesso.';
  }

  async function abrirPainel() {
    if (!temCapacidade('escola.criar') || criacaoEmAndamento) return;
    limparPreview();
    painel.hidden = false;
    introducao.textContent = 'Selecione uma diretoria de ensino autorizada para vincular a escola.';
    diretoria.disabled = true;
    diretoria.replaceChildren();
    consultar.disabled = true;
    feedback.dataset.state = 'loading';
    feedback.textContent = 'Carregando diretorias autorizadas...';
    try {
      const dados = getApiData(await adminApiFetch('/api/admin/escolas/diretorias'));
      const opcoes = dados?.items;
      if (!Array.isArray(opcoes)) throw new Error('Diretorias indisponíveis.');
      preencherDiretorias(opcoes.filter((item) =>
        Number.isSafeInteger(item?.id) && item.id > 0 && typeof item.nome === 'string'
      ));
      if (!diretoria.disabled && !painel.hidden) diretoria.focus();
    } catch (_erro) {
      feedback.dataset.state = 'error';
      feedback.textContent = 'Não foi possível carregar as DREs autorizadas.';
    }
  }

  if (!temCapacidade('escola.criar')) return;
  form.addEventListener('input', () => {
    if (criacaoEmAndamento) return;
    limparPreview();
    feedback.dataset.state = 'info';
    feedback.textContent = 'Consulte o preview para conferir os dados atuais.';
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!temCapacidade('escola.criar') || requisicaoPreview || criacaoEmAndamento) return;
    atualizarCep(true);
    atualizarInep(true);
    atualizarRaio(true);
    if (!form.reportValidity() || !diretoria.value) return;
    limparPreview();
    const controller = new AbortController();
    requisicaoPreview = controller;
    consultar.disabled = true;
    consultar.textContent = 'Consultando...';
    form.setAttribute('aria-busy', 'true');
    feedback.dataset.state = 'loading';
    feedback.textContent = 'Validando dados e consultando o CEP...';
    const dadosOriginais = Object.freeze(dadosFormulario());
    try {
      const payload = await adminApiFetch('/api/admin/escolas/preview', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify(dadosOriginais),
      });
      if (requisicaoPreview !== controller) return;
      const dados = getApiData(payload);
      renderizarConferenciaEscola(dados);
      const localizacaoCompleta = dados.latitude != null && dados.longitude != null;
      dadosOriginaisPreview = localizacaoCompleta ? dadosOriginais : null;
      atualizarBotaoConfirmacaoEscola({ visivel: temCapacidade('escola.criar'), habilitado: localizacaoCompleta });
      feedback.dataset.state = localizacaoCompleta ? 'success' : 'warning';
      feedback.textContent = 'Preview disponível para conferência. Nenhuma escola foi criada.';
    } catch (error) {
      if (requisicaoPreview !== controller || error.name === 'AbortError') return;
      feedback.dataset.state = 'error';
      feedback.textContent = mensagemErroPreviewEscola(error);
    } finally {
      if (requisicaoPreview === controller) {
        requisicaoPreview = null;
        atualizarDisponibilidadePreview();
        consultar.textContent = 'Consultar preview';
        form.removeAttribute('aria-busy');
      }
    }
  });
  confirmar.addEventListener('click', async () => {
    if (!temCapacidade('escola.criar') || criacaoEmAndamento || !dadosOriginaisPreview) return;
    if (JSON.stringify(dadosFormulario()) !== JSON.stringify(dadosOriginaisPreview)) {
      limparPreview();
      feedback.dataset.state = 'error';
      feedback.textContent = 'O formulário mudou. Consulte o preview novamente antes de confirmar.';
      return;
    }

    const dadosOriginais = dadosOriginaisPreview;
    dadosOriginaisPreview = null;
    criacaoEmAndamento = true;
    const controles = [...form.querySelectorAll('input, select, button'), fechar];
    const estadosAnteriores = controles.map(controle => controle.disabled);
    controles.forEach(controle => { controle.disabled = true; });
    atualizarBotaoConfirmacaoEscola({ visivel: true, emAndamento: true });
    form.setAttribute('aria-busy', 'true');
    feedback.dataset.state = 'loading';
    feedback.textContent = 'Criando escola. Aguarde a resposta antes de sair desta tela.';
    let criada = false;
    try {
      const response = await fetch('/api/admin/escolas', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosOriginais),
        signal: AbortSignal.timeout(20000),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 201) {
        criada = true;
        const dados = getApiData(payload);
        if (dados && typeof dados === 'object' && dados.id != null) {
          renderizarConferenciaEscola(dados, true);
        } else {
          resultado.hidden = true;
          feedback.dataset.state = 'info';
          feedback.textContent = 'Escola criada, mas não foi possível exibir os dados retornados. Confira o cadastro antes de qualquer novo envio.';
        }
      } else {
        feedback.dataset.state = 'error';
        feedback.textContent = mensagemErroCriacaoEscola(response.status, payload);
      }
    } catch (_error) {
      feedback.dataset.state = 'error';
      feedback.textContent = mensagemErroCriacaoEscola(0);
    } finally {
      criacaoEmAndamento = false;
      controles.forEach((controle, index) => { controle.disabled = estadosAnteriores[index]; });
      form.removeAttribute('aria-busy');
      // Sucesso ou falha consomem a confirmacao; outro envio exige um novo preview.
      atualizarBotaoConfirmacaoEscola({ visivel: !criada && temCapacidade('escola.criar') });
    }
  });
  fechar.addEventListener('click', () => {
    if (!criacaoEmAndamento) {
      window.location.assign(
        temCapacidade('escola.listar') ? '/admin/escolas' : '/admin/dashboard'
      );
    }
  });
  atualizarRaio(false);
  atualizarInep(false);
  atualizarCep(false);
  await abrirPainel();
}
