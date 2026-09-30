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
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon"><img src="/assets/icons/clipboard-list.svg" alt="" aria-hidden="true"></div><div class="empty-title">Nenhum registro hoje</div></div></td></tr>`;
  }

  if (tbody && lista.length) {
    tbody.innerHTML = lista.map(p => {
      // Prioriza os dados atualizados de FUNCIONARIOS; usa o funcionário
      // embutido no próprio registro de ponto apenas como fallback.
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
  }

  if (cardsMobile) {
    // Versão compacta da mesma lista, exibida no layout mobile.
    cardsMobile.innerHTML = lista.length ? lista.map(p => {
      const func = getFuncionarioPorId(p.funcionarioId) || p.funcionario;
      if (!func) return '';
      return `
        <div class="func-card-item">
          <div class="func-card-avatar">${getIniciais(func.nome)}</div>
          <div class="func-card-info">
            <div class="func-card-name">${escapeHtml(func.nome)}</div>
            <div class="func-card-cargo mobile-point-meta">
              <span class="mobile-point-entry">Entrada: <b>${p.entrada || '—'}</b></span>
              <span class="badge mobile-point-status ${p.status==='completo'?'badge-ok':'badge-info'}">${p.status==='completo'?'Completo':'Em andamento'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('') : `<div class="empty-state"><div class="empty-icon"><img src="/assets/icons/clipboard-list.svg" alt="" aria-hidden="true"></div><div class="empty-title">Nenhum registro hoje</div></div>`;
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
        <div class="alert-icon"><img src="/assets/icons/info.svg" alt="" aria-hidden="true"></div>
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
      <div class="alert-icon"><img src="/assets/icons/${a.icon}" alt="" aria-hidden="true"></div>
      <div class="alert-content">
        <div class="alert-title">${escapeHtml(a.titulo)}</div>
        <div class="alert-desc">${escapeHtml(a.desc)}</div>
      </div>
    </div>
  `).join('');
}

// A criação de escolas ainda não possui API. Este painel apresenta somente
// a DRE elegível, sem tentar persistir dados pelo navegador.
async function iniciarAcaoAdicionarEscola() {
  const acao = document.getElementById('quick-add-school');
  const painel = document.getElementById('school-setup');
  const fechar = document.getElementById('school-setup-close');
  const introducao = document.getElementById('school-setup-intro');
  const diretoria = document.getElementById('school-setup-dre');
  const feedback = document.getElementById('school-setup-feedback');
  if (!acao || !painel || !fechar || !introducao || !diretoria || !feedback) return;

  let seduc = false;
  let diretoriasProprias = [];
  try {
    const dados = getApiData(await adminApiFetch('/api/admin/acessos/meu'));
    if (!Array.isArray(dados?.acessos)) return;
    seduc = dados.acessos.some((acesso) => acesso?.perfil === 'ADMIN_SEDUC');
    diretoriasProprias = [...new Set(dados.acessos
      .filter((acesso) => acesso?.perfil === 'ADMIN_DIRETORIA')
      .map((acesso) => Number(acesso.diretoria_ensino_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (!seduc && diretoriasProprias.length === 0) return;
  } catch (_erro) {
    return;
  }

  function preencherDiretorias(itens) {
    diretoria.replaceChildren();
    itens.forEach(({ id, nome }) => {
      const opcao = document.createElement('option');
      opcao.value = String(id);
      opcao.textContent = nome;
      diretoria.appendChild(opcao);
    });
    if (itens.length === 0) {
      diretoria.disabled = true;
      feedback.textContent = 'Nenhuma diretoria autorizada está disponível.';
      return;
    }
    diretoria.value = String(itens[0].id);
    diretoria.disabled = itens.length === 1 && !seduc;
    feedback.textContent = seduc
      ? 'Selecione a DRE de destino para a futura escola.'
      : 'A escola ficará vinculada a uma DRE do seu acesso administrativo.';
  }

  async function abrirPainel() {
    painel.hidden = false;
    acao.setAttribute('aria-expanded', 'true');
    introducao.textContent = seduc
      ? 'Selecione a diretoria de ensino à qual a escola ficará vinculada.'
      : 'A escola deverá ficar vinculada a uma diretoria do seu acesso administrativo.';
    if (!seduc) {
      preencherDiretorias(diretoriasProprias.map((id) => ({ id, nome: `DRE ${id}` })));
      if (!diretoria.disabled && !painel.hidden) diretoria.focus();
      return;
    }

    diretoria.disabled = true;
    diretoria.replaceChildren();
    feedback.textContent = 'Carregando diretorias autorizadas...';
    try {
      const dados = getApiData(await adminApiFetch('/api/admin/acessos/opcoes-concessao'));
      const opcoes = dados?.perfis?.find((item) =>
        item?.perfil === 'ADMIN_DIRETORIA' && item.tipo_escopo === 'DRE'
      )?.recursos;
      if (!Array.isArray(opcoes)) throw new Error('Diretorias indisponíveis.');
      preencherDiretorias(opcoes.filter((item) =>
        Number.isSafeInteger(item?.id) && item.id > 0 && typeof item.nome === 'string'
      ));
      if (!diretoria.disabled && !painel.hidden) diretoria.focus();
    } catch (_erro) {
      feedback.textContent = 'Não foi possível carregar as DREs autorizadas.';
    }
  }

  acao.hidden = false;
  acao.addEventListener('click', () => {
    if (painel.hidden) abrirPainel();
    else {
      painel.hidden = true;
      acao.setAttribute('aria-expanded', 'false');
    }
  });
  fechar.addEventListener('click', () => {
    painel.hidden = true;
    acao.setAttribute('aria-expanded', 'false');
    acao.focus();
  });
}
