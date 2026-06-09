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
          <td class="td-mono">${p.entrada || '<span style="color:var(--text-300)">—</span>'}</td>
          <td class="td-mono">${p.saida || '<span style="color:var(--text-300)">—</span>'}</td>
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
            <div class="func-card-cargo" style="margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;">
              <span style="font-size:11px;color:var(--text-300);">Entrada: <b style="color:var(--text-700)">${p.entrada || '—'}</b></span>
              <span class="badge ${p.status==='completo'?'badge-ok':'badge-info'}" style="font-size:10px;padding:1px 7px;">${p.status==='completo'?'Completo':'Em andamento'}</span>
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

  container.innerHTML = `
    <div class="empty-state" style="padding:8px 0;">
      <div class="empty-title" style="font-size:12px;">Sem API semanal</div>
      <div style="font-size:11px;color:var(--text-300);margin-top:4px;">Resumo semanal ainda nao possui endpoint real.</div>
    </div>
  `;
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

