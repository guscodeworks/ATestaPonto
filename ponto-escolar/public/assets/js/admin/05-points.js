/* ============================================================
   PONTOS DO DIA
   ============================================================ */

function renderizarPontosHoje() {
  const tbodyP = document.getElementById('tbody-presentes');
  const tbodyA = document.getElementById('tbody-ausentes');
  const cardP = document.getElementById('cards-presentes');
  const cardA = document.getElementById('cards-ausentes');
  const icon = (name) => `<img src="/assets/icons/${name}.svg" alt="" aria-hidden="true" width="18" height="18">`;

  // Junta cada registro de ponto com seus dados de funcionário e descarta
  // entradas cujo funcionário não pôde ser resolvido (dado inconsistente).
  const lista = PONTOS_HOJE.map((p) => ({
    p,
    func: getFuncionarioPorId(p.funcionarioId) || p.funcionario,
  })).filter(x => x.func);

  if (tbodyP) {
    if (ADMIN_DATA_ERROR && !lista.length) {
      // Diferencia "erro ao carregar" de "sem presentes hoje": só mostra a
      // mensagem de erro da API quando não há nenhum dado disponível.
      tbodyP.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">${icon('triangle-alert')}</div><div class="empty-title">Nao foi possivel carregar pontos</div><div class="pontos-empty-desc">${escapeHtml(ADMIN_DATA_ERROR.message)}</div></div></td></tr>`;
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
          <td class="td-mono">${p.entrada || '<span class="td-muted">—</span>'}</td>
          <td class="td-mono">${p.pausa || '<span class="td-muted">—</span>'}</td>
          <td class="td-mono">${p.retorno || '<span class="td-muted">—</span>'}</td>
          <td class="td-mono">${p.saida || '<span class="td-muted">—</span>'}</td>
          <td><span class="badge ${p.status==='completo'?'badge-ok':'badge-info'}">${p.status==='completo'?'Completo':'Em andamento'}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="toast('Ajuste de ponto ainda nao integrado nesta tela.','info')">${icon('pencil')} Ajustar</button>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">${icon('clipboard-list')}</div><div class="empty-title">Nenhum registro hoje</div></div></td></tr>`;
    }
  }

  if (cardP) {
    // Versão em cards da mesma lista de presentes, para o layout mobile.
    cardP.innerHTML = lista.length ? lista.map(({ p, func }) => `
      <div class="func-card-item fade-in">
        <div class="func-card-avatar">${getIniciais(func.nome)}</div>
        <div class="func-card-info">
          <div class="func-card-name">${escapeHtml(func.nome)}</div>
          <div class="func-card-cargo pontos-card-meta">
            <span class="pontos-card-meta-item">Entrada: <strong class="pontos-card-meta-value">${p.entrada || '—'}</strong></span>
            ${p.saida ? `<span class="pontos-card-meta-item">Saida: <strong class="pontos-card-meta-value">${p.saida}</strong></span>` : ''}
            <span class="badge badge-compact ${p.status==='completo'?'badge-ok':'badge-info'}">${p.status==='completo'?'Completo':'Em andamento'}</span>
          </div>
        </div>
      </div>
    `).join('') : `<div class="empty-state"><div class="empty-icon">${icon('clipboard-list')}</div><div class="empty-title">Nenhum registro hoje</div></div>`;
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
          <button class="btn btn-ghost btn-sm" onclick="toast('Notificacao de ausente ainda nao integrada.','info')">${icon('mail')} Notificar</button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">${icon('circle-check')}</div><div class="empty-title">Nenhum ausente ativo hoje</div></div></td></tr>`;
  }

  if (cardA) {
    cardA.innerHTML = ausentes.length ? ausentes.map(func => `
      <div class="func-card-item fade-in">
        <div class="func-card-avatar func-card-avatar-absent">${getIniciais(func.nome)}</div>
        <div class="func-card-info">
          <div class="func-card-name">${escapeHtml(func.nome)}</div>
          <div class="func-card-cargo">${escapeHtml(func.cargo)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="toast('Notificacao de ausente ainda nao integrada.','info')">${icon('mail')}</button>
      </div>
    `).join('') : `<div class="empty-state"><div class="empty-icon">${icon('circle-check')}</div><div class="empty-title">Nenhum ausente ativo hoje</div></div>`;
  }

  // Prioriza os totais já calculados pela API; usa o tamanho das listas
  // locais como fallback caso o resumo não esteja disponível.
  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  set('count-presentes', RESUMO_PONTOS.presentes || lista.length);
  set('count-ausentes', RESUMO_PONTOS.ausentes || ausentes.length);
}