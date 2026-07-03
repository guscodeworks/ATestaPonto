/* ============================================================
   FUNCIONARIOS - LISTA / TABELA
   ============================================================ */

function atualizarFiltroCargo() {
  const filtroCargo = document.getElementById('filtro-cargo');
  if (!filtroCargo) return;

  // Preserva a seleção atual do usuário ao reconstruir as opções,
  // já que a lista de cargos é derivada dinamicamente dos funcionários.
  const valorAtual = filtroCargo.value;
  const cargos = [...new Set(FUNCIONARIOS.map(f => f.cargo).filter(Boolean))].sort();
  filtroCargo.innerHTML = [
    '<option value="">Todos os cargos</option>',
    ...cargos.map(cargo => `<option value="${escapeHtml(cargo)}">${escapeHtml(cargo)}</option>`),
  ].join('');
  if (cargos.includes(valorAtual)) {
    filtroCargo.value = valorAtual;
  }
}

function funcionarioPassaNoFiltro(funcionario, filtro) {
  const termo = String(filtro || '').toLowerCase();
  if (!termo) return true;

  // Busca livre: o termo é comparado contra múltiplos campos do
  // funcionário, bastando bater em um deles para passar no filtro.
  return [
    funcionario.nome,
    funcionario.cpf,
    funcionario.email,
    funcionario.cargo,
  ].some((campo) => String(campo || '').toLowerCase().includes(termo));
}

function renderizarFuncionarios(filtro = '') {
  const tbody = document.getElementById('tbody-funcionarios');
  const cardList = document.getElementById('cards-funcionarios');
  const elTotal = document.getElementById('total-func');

  atualizarFiltroCargo();

  // Filtros combinados: busca livre (parâmetro) + status e cargo
  // selecionados nos selects da tela, aplicados em sequência.
  let lista = FUNCIONARIOS.filter(f => funcionarioPassaNoFiltro(f, filtro));
  const filtroStatus = document.getElementById('filtro-status');
  const filtroCargo = document.getElementById('filtro-cargo');

  if (filtroStatus && filtroStatus.value) lista = lista.filter(f => f.status === filtroStatus.value);
  if (filtroCargo && filtroCargo.value) lista = lista.filter(f => f.cargo === filtroCargo.value);

  if (elTotal) elTotal.textContent = lista.length;

  if (tbody) {
    if (ADMIN_DATA_ERROR && !FUNCIONARIOS.length) {
      // Distingue "erro ao carregar" de "lista vazia por filtro", exibindo
      // a mensagem de erro da API somente quando não há dados nenhum.
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Nao foi possivel carregar funcionarios</div><div style="font-size:12px;color:var(--text-300);">${escapeHtml(ADMIN_DATA_ERROR.message)}</div></div></td></tr>`;
    } else if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum funcionario encontrado</div></div></td></tr>`;
    } else {
      tbody.innerHTML = lista.map(f => `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(f.nome)}</div>
              <div>
                <div class="td-name">${escapeHtml(f.nome)}</div>
                <div class="td-email">${escapeHtml(f.email || 'Sem e-mail')}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(f.cargo)}</td>
          <td class="td-mono">${escapeHtml(f.cpf || '—')}</td>
          <td>${escapeHtml(f.tel || 'Nao disponivel na API')}</td>
          <td><span class="badge ${f.status==='ativo'?'badge-active':'badge-inactive'}">${f.status==='ativo'?'Ativo':'Inativo'}</span></td>
          <td><span class="badge ${funcionarioBateuPonto(f.id)?'badge-ok':'badge-absent'}">${funcionarioBateuPonto(f.id)?'Presente':'Ausente'}</span></td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-ghost btn-sm" onclick="abrirEdicao(${Number(f.id)})">✏️ Editar</button>
              <button class="btn ${f.status==='ativo'?'btn-danger':'btn-ghost'} btn-sm" onclick="confirmarExclusao(${Number(f.id)})">${f.status==='ativo'?'Desativar':'Ativar'}</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  if (cardList) {
    // Mesma lista renderizada em formato de cards para o layout mobile.
    if (!lista.length) {
      cardList.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum funcionario encontrado</div></div>`;
    } else {
      cardList.innerHTML = lista.map(f => `
        <div class="func-card-item fade-in">
          <div class="func-card-avatar">${getIniciais(f.nome)}</div>
          <div class="func-card-info">
            <div class="func-card-name">${escapeHtml(f.nome)}</div>
            <div class="func-card-cargo">${escapeHtml(f.cargo)} · <span style="color:${funcionarioBateuPonto(f.id)?'var(--green-600)':'var(--red-600)'}">${funcionarioBateuPonto(f.id)?'Presente':'Ausente'}</span></div>
          </div>
          <div class="func-card-actions">
            <button class="btn btn-ghost btn-sm" onclick="abrirEdicao(${Number(f.id)})">✏️</button>
            <button class="btn ${f.status==='ativo'?'btn-danger':'btn-ghost'} btn-sm" onclick="confirmarExclusao(${Number(f.id)})">${f.status==='ativo'?'Desativar':'Ativar'}</button>
          </div>
        </div>
      `).join('');
    }
  }
}

async function confirmarExclusao(id) {
  const funcionario = getFuncionarioPorId(id);
  if (!funcionario) return;

  // "Excluir" aqui é, na verdade, alternar ativo/inativo (soft delete),
  // por isso o rótulo do botão e da confirmação muda conforme o status atual.
  const ativar = funcionario.status !== 'ativo';
  const acao = ativar ? 'ativar' : 'desativar';
  const confirmado = confirm(`Deseja ${acao} "${funcionario.nome}"?`);
  if (!confirmado) return;

  try {
    await adminApiFetch(`${ADMIN_ENDPOINTS.funcionarios}/${Number(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: ativar }),
    });
    toast(`Funcionario ${ativar ? 'ativado' : 'desativado'} com sucesso.`, 'success');
    await recarregarDadosAdminTela();
  } catch (error) {
    toast(error.message || 'Nao foi possivel alterar o status.', 'error');
  }
}

function abrirEdicao(id) {
  const f = getFuncionarioPorId(id);
  if (!f) return;

  const modal = document.getElementById('modal-editar');
  if (!modal) { toast('Tela de edicao indisponivel.','info'); return; }

  document.getElementById('edit-id').value = f.id;
  document.getElementById('edit-nome').value = f.nome;
  document.getElementById('edit-email').value = f.email;
  document.getElementById('edit-cpf').value = f.cpf;
  document.getElementById('edit-status').value = f.status;

  const cargoSelect = document.getElementById('edit-cargo');
  if (cargoSelect) {
    const option = [...cargoSelect.options].find((item) => item.value === f.cargo || item.textContent === f.cargo);
    if (option) cargoSelect.value = option.value;
    // Campo desabilitado por limitação da API: ela espera cargo_id, mas
    // não existe endpoint para listar/editar cargos por nome nesta tela.
    cargoSelect.disabled = true;
    cargoSelect.title = 'A API admin atual aceita cargo_id, mas nao expoe endpoint de cargos para editar por nome.';
  }

  const telInput = document.getElementById('edit-tel');
  if (telInput) {
    telInput.value = f.tel || 'Nao disponivel na API';
    // Campo somente leitura: o telefone ainda não é editável porque não
    // faz parte do contrato atual da API de funcionários.
    telInput.readOnly = true;
    telInput.title = 'Telefone ainda nao existe no contrato da API de funcionarios.';
  }

  modal.classList.add('show');
}

async function salvarEdicao() {
  const id = Number(document.getElementById('edit-id')?.value);
  if (!id) return;

  const payload = {
    nome: document.getElementById('edit-nome')?.value.trim(),
    email: document.getElementById('edit-email')?.value.trim(),
    ativo: document.getElementById('edit-status')?.value === 'ativo',
  };

  if (!payload.nome || !payload.email) {
    toast('Nome e e-mail sao obrigatorios.', 'warning');
    return;
  }

  try {
    const response = await adminApiFetch(`${ADMIN_ENDPOINTS.funcionarios}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const funcionarioAtualizado = getApiData(response)?.funcionario;
    if (funcionarioAtualizado) {
      // Atualiza a lista local imediatamente com o retorno da API,
      // evitando esperar o recarregamento completo para refletir a mudança.
      const idx = FUNCIONARIOS.findIndex(f => Number(f.id) === id);
      const normalizado = normalizarFuncionarioApi(funcionarioAtualizado);
      if (idx >= 0) FUNCIONARIOS[idx] = normalizado;
    }

    fecharModal('modal-editar');
    toast('Funcionario atualizado com sucesso.', 'success');
    await recarregarDadosAdminTela();
  } catch (error) {
    toast(error.message || 'Nao foi possivel atualizar o funcionario.', 'error');
  }
}

function fecharModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('show');
}