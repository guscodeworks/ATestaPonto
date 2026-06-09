/* ============================================================
   PONTOS DO DIA
   ============================================================ */

function renderizarPontosHoje() {
  const tbodyP = document.getElementById('tbody-presentes');
  const tbodyA = document.getElementById('tbody-ausentes');
  const cardP = document.getElementById('cards-presentes');
  const cardA = document.getElementById('cards-ausentes');

  const lista = PONTOS_HOJE.map((p) => ({
    p,
    func: getFuncionarioPorId(p.funcionarioId) || p.funcionario,
  })).filter(x => x.func);

  if (tbodyP) {
    if (ADMIN_DATA_ERROR && !lista.length) {
      tbodyP.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Nao foi possivel carregar pontos</div><div style="font-size:12px;color:var(--text-300);">${escapeHtml(ADMIN_DATA_ERROR.message)}</div></div></td></tr>`;
    } else {
      tbodyP.innerHTML = lista.length ? lista.map(({ p, func }) => `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(func.nome)}</div>
              <div>
                <div class="td-name">${escapeHtml(func.nome)}</div>
                <div class="td-email">${escapeHtml(func.email || 'Sem e-mail')}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(func.cargo)}</td>
          <td class="td-mono">${p.entrada || '<span style="color:var(--text-300)">—</span>'}</td>
          <td class="td-mono">${p.pausa || '<span style="color:var(--text-300)">—</span>'}</td>
          <td class="td-mono">${p.retorno || '<span style="color:var(--text-300)">—</span>'}</td>
          <td class="td-mono">${p.saida || '<span style="color:var(--text-300)">—</span>'}</td>
          <td><span class="badge ${p.status==='completo'?'badge-ok':'badge-info'}">${p.status==='completo'?'Completo':'Em andamento'}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="toast('Ajuste de ponto ainda nao integrado nesta tela.','info')">✏️ Ajustar</button>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro hoje</div></div></td></tr>`;
    }
  }

  if (cardP) {
    cardP.innerHTML = lista.length ? lista.map(({ p, func }) => `
      <div class="func-card-item fade-in">
        <div class="func-card-avatar">${getIniciais(func.nome)}</div>
        <div class="func-card-info">
          <div class="func-card-name">${escapeHtml(func.nome)}</div>
          <div class="func-card-cargo" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
            <span style="font-size:11px;color:var(--text-300);">Entrada: <strong style="color:var(--text-700)">${p.entrada || '—'}</strong></span>
            ${p.saida ? `<span style="font-size:11px;color:var(--text-300);">Saida: <strong style="color:var(--text-700)">${p.saida}</strong></span>` : ''}
            <span class="badge ${p.status==='completo'?'badge-ok':'badge-info'}" style="padding:1px 7px;font-size:10px;">${p.status==='completo'?'Completo':'Em andamento'}</span>
          </div>
        </div>
      </div>
    `).join('') : `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro hoje</div></div>`;
  }

  const ausentes = getFuncionariosSemPonto();

  if (tbodyA) {
    tbodyA.innerHTML = ausentes.length ? ausentes.map(func => `
      <tr>
        <td>
          <div class="td-user">
            <div class="td-avatar">${getIniciais(func.nome)}</div>
            <div>
              <div class="td-name">${escapeHtml(func.nome)}</div>
              <div class="td-email">${escapeHtml(func.email || 'Sem e-mail')}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(func.cargo)}</td>
        <td class="td-mono">${escapeHtml(func.tel || 'Nao disponivel na API')}</td>
        <td><span class="badge badge-absent">Nao bateu ponto</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="toast('Notificacao de ausente ainda nao integrada.','info')">📨 Notificar</button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Nenhum ausente ativo hoje</div></div></td></tr>`;
  }

  if (cardA) {
    cardA.innerHTML = ausentes.length ? ausentes.map(func => `
      <div class="func-card-item fade-in">
        <div class="func-card-avatar" style="background:linear-gradient(135deg,var(--red-600),var(--red-500));">${getIniciais(func.nome)}</div>
        <div class="func-card-info">
          <div class="func-card-name">${escapeHtml(func.nome)}</div>
          <div class="func-card-cargo">${escapeHtml(func.cargo)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="toast('Notificacao de ausente ainda nao integrada.','info')">📨</button>
      </div>
    `).join('') : `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Nenhum ausente ativo hoje</div></div>`;
  }

  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  set('count-presentes', RESUMO_PONTOS.presentes || lista.length);
  set('count-ausentes', RESUMO_PONTOS.ausentes || ausentes.length);
}
