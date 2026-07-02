function updateEmployeePreview() {
  const nome = document.getElementById('input-nome')?.value?.trim() || '';
  const email = document.getElementById('input-email')?.value?.trim() || '';
  const cpf = document.getElementById('input-cpf')?.value?.trim() || '';
  const cargo = document.getElementById('input-cargo')?.value?.trim() || '';

  const avatar = document.getElementById('preview-avatar');
  const nomePreview = document.getElementById('preview-nome');
  const cargoPreview = document.getElementById('preview-cargo');
  const emailPreview = document.getElementById('preview-email');
  const cpfPreview = document.getElementById('preview-cpf');

  if (avatar) {
    avatar.textContent = nome ? getIniciais(nome) : '?';
  }
  if (nomePreview) {
    nomePreview.textContent = nome || 'Nome do Funcionário';
  }
  if (cargoPreview) {
    cargoPreview.textContent = cargo || 'Cargo';
  }
  if (emailPreview) {
    emailPreview.textContent = email || '—';
  }
  if (cpfPreview) {
    cpfPreview.textContent = cpf || '—';
  }
}

// Mapeia o status bruto do item de relatório para o estilo visual (badge)
// e o rótulo exibido ao usuário.
function mapReportRowToStatus(item) {
  if (item.status === 'COMPLETO') {
    return { css: 'badge-success', label: 'Ponto completo' };
  }
  if (item.status === 'EM_ANDAMENTO') {
    return { css: 'badge-warning', label: 'Em andamento' };
  }
  return { css: 'badge-danger', label: 'Não bateu ponto' };
}

function bindTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn[data-tab]');
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.tab;
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      // Usa a classe 'hidden' para ocultar os painéis não selecionados,
      // em vez de alternar 'active' como em outras implementações de tabs.
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.id !== targetId);
      });
    });
  });
}