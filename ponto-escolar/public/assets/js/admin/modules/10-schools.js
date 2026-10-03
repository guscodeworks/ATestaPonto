/* ============================================================
   GESTAO DE ESCOLAS
   ============================================================ */

function iniciarGestaoEscolas() {
  const page = document.getElementById('schools-page');
  if (!page) return;

  const elements = {
    count: document.getElementById('schools-count'),
    loading: document.getElementById('schools-loading'),
    error: document.getElementById('schools-error'),
    errorMessage: document.getElementById('schools-error-message'),
    empty: document.getElementById('schools-empty'),
    emptyTitle: document.getElementById('schools-empty-title'),
    emptyMessage: document.getElementById('schools-empty-message'),
    table: document.getElementById('schools-table-wrap'),
    tableBody: document.getElementById('schools-table-body'),
    search: document.getElementById('school-search'),
    reload: document.getElementById('schools-reload'),
    retry: document.getElementById('schools-retry'),
    createToggle: document.getElementById('school-create-toggle'),
    createPanel: document.getElementById('school-create-panel'),
    form: document.getElementById('school-form'),
    department: document.getElementById('school-department'),
    cep: document.getElementById('school-cep'),
    cepButton: document.getElementById('school-cep-lookup'),
    cepFeedback: document.getElementById('school-cep-feedback'),
    address: document.getElementById('school-address'),
    city: document.getElementById('school-city'),
    formFeedback: document.getElementById('school-form-feedback'),
    submit: document.getElementById('school-submit'),
  };
  let schools = [];
  let isSubmitting = false;

  function setListState(state) {
    elements.loading.hidden = state !== 'loading';
    elements.error.hidden = state !== 'error';
    elements.empty.hidden = state !== 'empty';
    elements.table.hidden = state !== 'table';
    page.setAttribute('aria-busy', String(state === 'loading'));
  }

  function renderRows() {
    const query = elements.search.value.trim().toLocaleLowerCase('pt-BR');
    const filtered = schools.filter((school) =>
      `${school.nome} ${school.cidade} ${school.codigo_inep || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(query)
    );
    elements.count.textContent = String(filtered.length);

    if (schools.length === 0 || filtered.length === 0) {
      elements.emptyTitle.textContent = schools.length === 0
        ? 'Nenhuma escola cadastrada'
        : 'Nenhum resultado para esta busca';
      elements.emptyMessage.textContent = schools.length === 0
        ? 'Não há unidades disponíveis no seu escopo.'
        : 'Tente outro nome, cidade ou código INEP.';
      setListState('empty');
      return;
    }

    elements.tableBody.innerHTML = filtered.map((school) => `
      <tr>
        <td><div class="td-name">${escapeHtml(school.nome)}</div><div class="td-email">${escapeHtml(school.endereco || 'Endereço não informado')}</div></td>
        <td class="td-mono">${escapeHtml(school.codigo_inep || '—')}</td>
        <td>${escapeHtml(school.cidade || '—')}</td>
        <td><span class="badge ${school.ativa ? 'badge-active' : 'badge-inactive'}">${school.ativa ? 'Ativa' : 'Inativa'}</span></td>
      </tr>
    `).join('');
    setListState('table');
  }

  async function loadSchools() {
    setListState('loading');
    try {
      const payload = await adminApiFetch('/api/admin/escolas');
      const data = getApiData(payload) || {};
      schools = Array.isArray(data.items) ? data.items : [];
      const departments = Array.isArray(data.diretorias) ? data.diretorias : [];
      const canCreate = Boolean(data.capabilities?.canCreate);
      elements.createToggle.hidden = !canCreate;
      elements.department.innerHTML = departments.map((department) =>
        `<option value="${Number(department.id)}">${escapeHtml(department.nome)}</option>`
      ).join('');
      elements.department.disabled = !data.capabilities?.canChooseDepartment && departments.length === 1;
      renderRows();
    } catch (error) {
      elements.errorMessage.textContent = error.message || 'Verifique a conexão e tente novamente.';
      elements.count.textContent = '—';
      setListState('error');
    }
  }

  async function lookupCep() {
    const cep = elements.cep.value.replace(/\D/g, '');
    elements.cepFeedback.className = 'school-field-feedback';
    if (cep.length !== 8) {
      elements.cepFeedback.textContent = 'Informe os 8 dígitos do CEP.';
      elements.cepFeedback.classList.add('is-error');
      return;
    }

    elements.cepButton.disabled = true;
    elements.cepFeedback.textContent = 'Consultando CEP…';
    elements.cepFeedback.classList.add('is-loading');
    try {
      const payload = await adminApiFetch(`/api/admin/escolas/cep/${cep}`);
      const result = getApiData(payload);
      if (!result?.found) {
        elements.cepFeedback.textContent = 'CEP não encontrado. Preencha o endereço manualmente.';
        elements.cepFeedback.className = 'school-field-feedback is-error';
        return;
      }

      const address = [result.data.logradouro, result.data.bairro].filter(Boolean).join(', ');
      elements.address.value = [address, `CEP ${result.data.cep}`, result.data.uf].filter(Boolean).join(' - ');
      elements.city.value = result.data.cidade || '';
      elements.cepFeedback.textContent = 'Endereço localizado. Confira e complete o número da unidade.';
      elements.cepFeedback.className = 'school-field-feedback is-success';
    } catch (_error) {
      elements.cepFeedback.textContent = 'Consulta indisponível. Preencha o endereço manualmente.';
      elements.cepFeedback.className = 'school-field-feedback is-error';
    } finally {
      elements.cepButton.disabled = false;
    }
  }

  elements.search.addEventListener('input', renderRows);
  elements.reload.addEventListener('click', loadSchools);
  elements.retry.addEventListener('click', loadSchools);
  elements.createToggle.addEventListener('click', () => {
    elements.createPanel.hidden = false;
    elements.createToggle.hidden = true;
    document.getElementById('school-name').focus();
  });
  document.getElementById('school-form-cancel').addEventListener('click', () => {
    elements.form.reset();
    elements.formFeedback.textContent = '';
    elements.cepFeedback.textContent = '';
    elements.createPanel.hidden = true;
    elements.createToggle.hidden = false;
  });
  elements.cepButton.addEventListener('click', lookupCep);
  elements.cep.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      lookupCep();
    }
  });
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    isSubmitting = true;
    elements.submit.disabled = true;
    elements.formFeedback.className = 'school-form-feedback';
    elements.formFeedback.textContent = 'Salvando escola…';
    const body = {
      nome: document.getElementById('school-name').value.trim(),
      codigo_inep: document.getElementById('school-inep').value.trim(),
      diretoria_ensino_id: Number(elements.department.value),
      endereco: elements.address.value.trim(),
      cidade: elements.city.value.trim(),
    };

    try {
      await adminApiFetch('/api/admin/escolas', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      elements.form.reset();
      elements.cepFeedback.textContent = '';
      elements.formFeedback.className = 'school-form-feedback is-success';
      elements.formFeedback.textContent = 'Escola cadastrada.';
      await loadSchools();
      window.setTimeout(() => {
        elements.createPanel.hidden = true;
        elements.createToggle.hidden = false;
        elements.formFeedback.textContent = '';
      }, 900);
    } catch (error) {
      elements.formFeedback.className = 'school-form-feedback is-error';
      elements.formFeedback.textContent = error.message || 'Não foi possível cadastrar a escola.';
    } finally {
      isSubmitting = false;
      elements.submit.disabled = false;
    }
  });

  loadSchools();
}

document.addEventListener('DOMContentLoaded', iniciarGestaoEscolas);