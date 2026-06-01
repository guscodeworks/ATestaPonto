/* ============================================================
   FUNCIONÁRIOS — LISTA / TABELA
   ============================================================ */

function renderizarFuncionarios(filtro = '') {
  const tbody   = document.getElementById('tbody-funcionarios');
  const cardList = document.getElementById('cards-funcionarios');
  const elTotal = document.getElementById('total-func');

  let lista = FUNCIONARIOS.filter(f =>
    f.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    f.cpf.includes(filtro) ||
    f.email.toLowerCase().includes(filtro.toLowerCase()) ||
    f.cargo.toLowerCase().includes(filtro.toLowerCase())
  );

  const filtroStatus = document.getElementById('filtro-status');
  const filtroCargo  = document.getElementById('filtro-cargo');
  if (filtroStatus && filtroStatus.value) lista = lista.filter(f => f.status === filtroStatus.value);
  if (filtroCargo  && filtroCargo.value)  lista = lista.filter(f => f.cargo  === filtroCargo.value);

  if (elTotal) elTotal.textContent = lista.length;

  if (tbody) {
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum funcionário encontrado</div></div></td></tr>`;
    } else {
      tbody.innerHTML = lista.map(f => `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(f.nome)}</div>
              <div>
                <div class="td-name">${f.nome}</div>
                <div class="td-email">${f.email}</div>
              </div>
            </div>
          </td>
          <td>${f.cargo}</td>
          <td class="td-mono">${f.cpf}</td>
          <td>${f.tel}</td>
          <td><span class="badge ${f.status==='ativo'?'badge-active':'badge-inactive'}">${f.status==='ativo'?'Ativo':'Inativo'}</span></td>
          <td><span class="badge ${funcionarioBateuPonto(f.id)?'badge-ok':'badge-absent'}">${funcionarioBateuPonto(f.id)?'Presente':'Ausente'}</span></td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-ghost btn-sm" onclick="abrirEdicao(${f.id})">✏️ Editar</button>
              <button class="btn btn-danger btn-sm" onclick="confirmarExclusao(${f.id},'${f.nome}')">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  if (cardList) {
    if (!lista.length) {
      cardList.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum funcionário encontrado</div></div>`;
    } else {
      cardList.innerHTML = lista.map(f => `
        <div class="func-card-item fade-in">
          <div class="func-card-avatar">${getIniciais(f.nome)}</div>
          <div class="func-card-info">
            <div class="func-card-name">${f.nome}</div>
            <div class="func-card-cargo">${f.cargo} · <span class="${funcionarioBateuPonto(f.id)?'':''}" style="color:${funcionarioBateuPonto(f.id)?'var(--green-600)':'var(--red-600)'}">${funcionarioBateuPonto(f.id)?'Presente':'Ausente'}</span></div>
          </div>
          <div class="func-card-actions">
            <button class="btn btn-ghost btn-sm" onclick="abrirEdicao(${f.id})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="confirmarExclusao(${f.id},'${f.nome}')">🗑️</button>
          </div>
        </div>
      `).join('');
    }
  }
}

function confirmarExclusao(id, nome) {
  if (confirm(`Remover "${nome}" do sistema? Esta ação não pode ser desfeita.`)) {
    FUNCIONARIOS = FUNCIONARIOS.filter(f => f.id !== id);
    renderizarFuncionarios();
    toast(`Funcionário "${nome}" removido.`, 'success');
  }
}

function abrirEdicao(id) {
  const f = getFuncionarioPorId(id);
  if (!f) return;

  const modal = document.getElementById('modal-editar');
  if (!modal) { toast('Redirecionando para edição...','info'); return; }

  document.getElementById('edit-id').value    = f.id;
  document.getElementById('edit-nome').value  = f.nome;
  document.getElementById('edit-email').value = f.email;
  document.getElementById('edit-cpf').value   = f.cpf;
  document.getElementById('edit-cargo').value = f.cargo;
  document.getElementById('edit-tel').value   = f.tel;
  document.getElementById('edit-status').value = f.status;

  modal.classList.add('show');
}

function salvarEdicao() {
  const id = parseInt(document.getElementById('edit-id').value);
  const idx = FUNCIONARIOS.findIndex(f => f.id === id);
  if (idx < 0) return;
  FUNCIONARIOS[idx].nome   = document.getElementById('edit-nome').value.trim();
  FUNCIONARIOS[idx].email  = document.getElementById('edit-email').value.trim();
  FUNCIONARIOS[idx].cargo  = document.getElementById('edit-cargo').value;
  FUNCIONARIOS[idx].tel    = document.getElementById('edit-tel').value.trim();
  FUNCIONARIOS[idx].status = document.getElementById('edit-status').value;

  fecharModal('modal-editar');
  renderizarFuncionarios();
  toast('Funcionário atualizado com sucesso!', 'success');
}

function fecharModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('show');
}

