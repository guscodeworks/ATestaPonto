/* ============================================================
   ÚLTIMOS REGISTROS (dashboard)
   ============================================================ */

function renderizarUltimosRegistros() {
  const tbody = document.getElementById('tbody-ultimos');
  const cardsMobile = document.getElementById('cards-ultimos-mobile');
  const lista = PONTOS_HOJE.slice(-5).reverse();

  if (tbody && !lista.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro hoje</div></div></td></tr>`;
  }

  if (tbody && lista.length) {
    tbody.innerHTML = lista.map(p => {
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
          <td>
            <button class="btn btn-ghost btn-sm" onclick="toast('Ajuste de ponto ainda nao integrado nesta tela.','info')">✏️ Ajustar</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (cardsMobile) {
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
    }).join('') : `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro hoje</div></div>`;
  }
}

/* ============================================================
   GRÁFICO DE PRESENÇA (CSS bars)
   ============================================================ */

function renderizarGrafico() {
  const container = document.getElementById('grafico-presenca');
  if (!container) return;

  const pendentes = PONTOS_HOJE.filter((ponto) => ponto.status !== 'completo' || !ponto.saida).length;
  const presentesResumo = RESUMO_PONTOS.presentes || PONTOS_HOJE.length;
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
  const ausentes = getFuncionariosSemPonto();
  const inativos = FUNCIONARIOS.filter(f=>f.status==='inativo').length;
  const alertas = [
    ausentes.length > 0 ? { tipo:'amber', icon:'⚠️', titulo:`${ausentes.length} funcionario(s) sem ponto hoje`, desc: ausentes.map(f=>f.nome).join(', ') } : null,
    inativos > 0 ? { tipo:'red', icon:'🔴', titulo:'Funcionarios inativos no sistema', desc:`${inativos} conta(s) inativa(s). Verifique o cadastro.` } : null,
  ].filter(Boolean);

  if (!alertas.length) {
    container.innerHTML = `
      <div class="alert-item blue">
        <div class="alert-icon">ℹ️</div>
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
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${escapeHtml(a.titulo)}</div>
        <div class="alert-desc">${escapeHtml(a.desc)}</div>
      </div>
    </div>
  `).join('');
}
