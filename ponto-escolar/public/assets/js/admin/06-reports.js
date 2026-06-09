/* ============================================================
   RELATORIO
   ============================================================ */

function renderizarGraficoSemanalRelatorio() {
  const container = document.getElementById('chart-presenca-semanal');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state" style="padding:8px 0;">
      <div class="empty-icon">📊</div>
      <div class="empty-title">Resumo semanal sem API real</div>
      <div style="font-size:12px;color:var(--text-300);margin-top:4px;">O backend atual fornece relatorio diario. Agregado semanal fica como pendencia.</div>
    </div>
  `;
}

function renderizarRelatorio() {
  const tbody = document.getElementById('tbody-relatorio');
  const elData = document.getElementById('relatorio-data');
  const elPres = document.getElementById('relatorio-presentes');
  const elAus = document.getElementById('relatorio-ausentes');
  const elGerado = document.getElementById('relatorio-gerado-por');
  const itens = RELATORIO_PONTOS.length ? RELATORIO_PONTOS : FUNCIONARIOS.map((func) => {
    const ponto = PONTOS_HOJE.find(x => Number(x.funcionarioId) === Number(func.id));
    return ponto || {
      id: `${func.id}-ausente`,
      funcionarioId: func.id,
      funcionario: func,
      entrada: null,
      pausa: null,
      retorno: null,
      saida: null,
      status: 'ausente',
    };
  });

  if (elData) elData.textContent = formatarDataReferencia(DATA_REFERENCIA_RELATORIO || DATA_REFERENCIA_PONTOS);
  if (elPres) elPres.textContent = RESUMO_PONTOS.presentes || PONTOS_HOJE.length;
  if (elAus) elAus.textContent = RESUMO_PONTOS.ausentes || getFuncionariosSemPonto().length;
  if (elGerado) elGerado.textContent = ADMIN.nome;

  renderizarGraficoSemanalRelatorio();

  if (!tbody) return;

  if (ADMIN_DATA_ERROR && !itens.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Nao foi possivel carregar relatorio</div><div style="font-size:12px;color:var(--text-300);">${escapeHtml(ADMIN_DATA_ERROR.message)}</div></div></td></tr>`;
    return;
  }

  if (!itens.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum funcionario encontrado</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = itens.map(item => {
    const func = getFuncionarioPorId(item.funcionarioId) || item.funcionario;
    const statusLabel = item.status === 'completo'
      ? 'Completo'
      : item.status === 'ausente'
        ? 'Ausente'
        : 'Em andamento';
    const statusClass = item.status === 'completo'
      ? 'badge-ok'
      : item.status === 'ausente'
        ? 'badge-absent'
        : 'badge-info';

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
        <td class="td-mono">${item.entrada || '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${item.pausa || '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${item.retorno || '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${item.saida || '<span style="color:var(--text-300)">—</span>'}</td>
        <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      </tr>
    `;
  }).join('');
}
