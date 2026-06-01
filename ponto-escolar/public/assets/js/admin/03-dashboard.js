/* ============================================================
   ÚLTIMOS REGISTROS (dashboard)
   ============================================================ */

function renderizarUltimosRegistros() {
  const tbody = document.getElementById('tbody-ultimos');
  if (!tbody) return;
  const lista = PONTOS_HOJE.slice(-5).reverse();
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro hoje</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(p => {
    const func = getFuncionarioPorId(p.funcionarioId);
    if (!func) return '';
    return `
      <tr>
        <td>
          <div class="td-user">
            <div class="td-avatar">${getIniciais(func.nome)}</div>
            <div>
              <div class="td-name">${func.nome}</div>
              <div class="td-email">${func.cargo}</div>
            </div>
          </div>
        </td>
        <td class="td-mono">${p.entrada}</td>
        <td class="td-mono">${p.saida ?? '<span style="color:var(--text-300)">—</span>'}</td>
        <td><span class="badge ${p.status==='completo'?'badge-ok':'badge-info'}">${p.status==='completo'?'Completo':'Em andamento'}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="toast('Ajuste registrado com sucesso.','success')">✏️ Ajustar</button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============================================================
   GRÁFICO DE PRESENÇA (CSS bars)
   ============================================================ */

function renderizarGrafico() {
  const container = document.getElementById('grafico-presenca');
  if (!container) return;

  const dados = [
    { dia:'Seg', pct:88 }, { dia:'Ter', pct:94 }, { dia:'Qua', pct:75 },
    { dia:'Qui', pct:100 }, { dia:'Sex', pct:63 }, { dia:'Sáb', pct:12 },
    { dia:'Dom', pct:0 },
  ];

  container.innerHTML = dados.map(d => `
    <div class="presence-bar-wrap" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
      <div style="font-size:10px;font-weight:700;color:${d.pct>0?'var(--text-700)':'var(--text-300)'};">${d.pct>0?d.pct+'%':''}</div>
      <div class="presence-bar" style="width:100%;height:${Math.max(d.pct*0.7,2)}px;background:${d.pct>=80?'var(--green-500)':d.pct>=50?'var(--amber-500)':d.pct>0?'var(--red-500)':'var(--border-light)'};border-radius:3px 3px 0 0;"></div>
      <div style="font-size:10px;color:var(--text-300);">${d.dia}</div>
    </div>
  `).join('');
}

/* ============================================================
   ALERTAS (dashboard)
   ============================================================ */

function renderizarAlertas() {
  const container = document.getElementById('lista-alertas');
  if (!container) return;
  const ausentes = getFuncionariosSemPonto();
  const alertas = [
    ausentes.length > 0 ? { tipo:'amber', icon:'⚠️', titulo:`${ausentes.length} funcionário(s) sem ponto hoje`, desc: ausentes.map(f=>f.nome).join(', ') } : null,
    { tipo:'blue', icon:'ℹ️', titulo:'Relatório mensal disponível', desc:'O relatório do mês atual está pronto para exportação.' },
    FUNCIONARIOS.filter(f=>f.status==='inativo').length > 0 ? { tipo:'red', icon:'🔴', titulo:'Funcionários inativos no sistema', desc:`${FUNCIONARIOS.filter(f=>f.status==='inativo').length} conta(s) inativa(s). Verifique o cadastro.` } : null,
  ].filter(Boolean);

  container.innerHTML = alertas.map(a => `
    <div class="alert-item ${a.tipo}">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${a.titulo}</div>
        <div class="alert-desc">${a.desc}</div>
      </div>
    </div>
  `).join('');
}

