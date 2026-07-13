function renderEmployeesGrid(container, employees, presentIds) {
  if (!container) {
    return;
  }
  if (!employees.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum funcionário encontrado</div></div>';
    return;
  }
  container.innerHTML = employees
    .map((employee) => {
      const punchedToday = presentIds.has(employee.id);
      return `
        <div class="func-item-card animate-in">
          <div class="func-item-avatar">${getIniciais(employee.nome)}</div>
          <div class="func-item-info">
            <div class="func-item-name">${employee.nome}</div>
            <div class="func-item-cargo">${employee.ativo ? 'Ativo' : 'Inativo'}</div>
          </div>
          <span class="badge ${punchedToday ? 'badge-success' : 'badge-danger'}">
            ${punchedToday ? '✓' : '✕'}
          </span>
        </div>
      `;
    })
    .join('');
}

function renderEmployeesTable(tableBody, employees, presentIds) {
  if (!tableBody) {
    return;
  }
  tableBody.innerHTML = employees
    .map((employee) => {
      const punchedToday = presentIds.has(employee.id);
      const statusClass = punchedToday ? 'badge-success' : 'badge-danger';
      const statusLabel = punchedToday ? 'Ponto batido' : 'Sem ponto';
      return `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(employee.nome)}</div>
              <div>
                <div class="td-name">${employee.nome}</div>
                <div class="td-email">${employee.email}</div>
              </div>
            </div>
          </td>
          <td>${employee.ativo ? 'Ativo' : 'Inativo'}</td>
          <td style="font-family:monospace; font-size:13px;">${employee.cpf}</td>
          <td><span class="badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-ghost btn-sm js-toggle-status" data-id="${employee.id}" data-ativo="${employee.ativo ? '1' : '0'}">
                ${employee.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function initEmployeesPage() {
  const listContainer = document.getElementById('lista-funcionarios');
  const totalEmployees = document.getElementById('total-funcionarios');
  const tableBody = document.getElementById('tbody-func-tabela');
  const searchInput = document.getElementById('busca-funcionario');

  let employees = [];
  let presentIds = new Set();

  async function loadData() {
    // Busca funcionários e pontos de hoje em paralelo, já que uma
    // requisição não depende do resultado da outra.
    const [employeeData, pointsData] = await Promise.all([
      apiRequest('/admin/funcionarios?page=1&limit=100'),
      apiRequest('/admin/pontos/hoje')
    ]);

    employees = employeeData?.items || [];
    // presentIds guarda apenas os IDs (não os objetos completos) para
    // permitir checagem O(1) de "bateu ponto hoje" via Set.has().
    presentIds = new Set((pointsData?.presentes || []).map((item) => item.funcionario.id));
    if (totalEmployees) {
      totalEmployees.textContent = String(employeeData?.pagination?.total ?? employees.length);
    }
  }

  function applyRender(filterValue = '') {
    const query = filterValue.trim().toLowerCase();
    const filtered = !query
      ? employees
      : employees.filter((employee) => {
          return (
            employee.nome.toLowerCase().includes(query) ||
            employee.email.toLowerCase().includes(query) ||
            employee.cpf.toLowerCase().includes(query)
          );
        });
    renderEmployeesGrid(listContainer, filtered, presentIds);
    renderEmployeesTable(tableBody, filtered, presentIds);
    // Reanexa os listeners dos botões de status a cada renderização,
    // já que os elementos foram recriados via innerHTML.
    bindEmployeeStatusButtons();
  }

  async function toggleEmployeeStatus(employeeId, currentActive) {
    const nextActive = !currentActive;
    await apiRequest(`/admin/funcionarios/${employeeId}/status`, {
      method: 'PATCH',
      body: { ativo: nextActive }
    });
    mostrarToast(`Funcionário ${nextActive ? 'ativado' : 'desativado'} com sucesso.`, 'success');
    // Recarrega e re-renderiza tudo para refletir o novo status e manter
    // a lista consistente com o backend.
    await loadData();
    applyRender(searchInput?.value || '');
  }

  function bindEmployeeStatusButtons() {
    const buttons = document.querySelectorAll('.js-toggle-status');
    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        const employeeId = Number(button.dataset.id);
        const isActive = button.dataset.ativo === '1';
        const restore = setLoadingButton(button, 'Salvando...');
        try {
          await toggleEmployeeStatus(employeeId, isActive);
        } catch (error) {
          mostrarToast(sanitizeMessage(error.message, 'Falha ao atualizar status.'), 'error');
        } finally {
          restore();
        }
      });
    });
  }

  try {
    await loadData();
    applyRender();

    if (searchInput) {
      searchInput.addEventListener('input', () => applyRender(searchInput.value));
    }
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar funcionários.'), 'error');
  }
}

async function initRegisterEmployeePage() {
  attachCpfMask('input-cpf');
  ['input-nome', 'input-email', 'input-cpf', 'input-cargo'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', updateEmployeePreview);
      input.addEventListener('change', updateEmployeePreview);
    }
  });
  updateEmployeePreview();

  const form = document.getElementById('form-registro');
  if (!form) {
    return;
  }

  const clearButton = document.getElementById('btn-limpar-registro');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      form.reset();
      updateEmployeePreview();
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nome = document.getElementById('input-nome')?.value?.trim() || '';
    const email = document.getElementById('input-email')?.value?.trim() || '';
    const cpf = (document.getElementById('input-cpf')?.value || '').replace(/\D/g, '');
    const senha = document.getElementById('input-senha')?.value || '';

    const submitButton = document.getElementById('btn-registrar');
    const restore = setLoadingButton(submitButton, 'Registrando...');

    try {
      await apiRequest('/admin/funcionarios', {
        method: 'POST',
        body: {
          nome,
          email,
          cpf,
          senha,
          ativo: true
        }
      });
      mostrarToast('Funcionário registrado com sucesso.', 'success');
      form.reset();
      updateEmployeePreview();
    } catch (error) {
      mostrarToast(sanitizeMessage(error.message, 'Falha ao registrar funcionário.'), 'error');
    } finally {
      restore();
    }
  });
}