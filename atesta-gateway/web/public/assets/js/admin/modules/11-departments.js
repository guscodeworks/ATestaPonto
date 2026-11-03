'use strict';

function inicializarDiretorias() {
  const page = document.getElementById('departments-page');
  if (!page || page.dataset.initialized) return;
  if (!temCapacidade('diretoria.gerenciar')) {
    page.remove();
    window.location.replace('/admin/dashboard');
    return;
  }
  page.dataset.initialized = 'true';
  const form = document.getElementById('department-form');
  const fields = document.getElementById('department-fields');
  const table = document.getElementById('departments-body');
  const feedback = document.getElementById('departments-feedback');
  const heading = document.getElementById('department-form-title');
  const save = document.getElementById('department-save');
  const cancel = document.getElementById('department-cancel');
  const reload = document.getElementById('departments-reload');
  const search = document.getElementById('departments-search');
  const status = document.getElementById('departments-status');
  let items = [];
  let editId = null;
  let busy = false;

  function message(text, error = false) {
    feedback.textContent = text;
    feedback.dataset.state = error ? 'error' : 'success';
  }

  function resetForm() {
    editId = null;
    form.reset();
    heading.textContent = 'Cadastrar DRE';
    save.textContent = 'Cadastrar DRE';
    cancel.hidden = true;
  }

  function setBusy(value) {
    busy = value;
    fields.disabled = value;
    reload.disabled = value;
    page.setAttribute('aria-busy', String(value));
    table.querySelectorAll('button').forEach(button => { button.disabled = value; });
  }

  function render() {
    table.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase('pt-BR');
    const visible = items.filter(item => (!status.value || String(item.ativo) === status.value)
      && [item.nome, item.codigo, item.cidade_sede].some(value => value.toLocaleLowerCase('pt-BR').includes(query)));
    document.getElementById('departments-total').textContent = `${visible.length} de ${items.length} DREs`;
    if (!visible.length) {
      const row = table.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.textContent = 'Nenhuma DRE encontrada. Ajuste os filtros ou cadastre uma nova DRE.';
    }
    visible.forEach(item => {
      const row = table.insertRow();
      for (const value of [item.nome, item.codigo, item.cidade_sede, item.ativo ? 'Ativa' : 'Inativa']) {
        row.insertCell().textContent = value;
      }
      const actions = row.insertCell();
      for (const [action, label] of [['edit', 'Editar'], ['status', item.ativo ? 'Desativar' : 'Ativar']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ui-btn ui-btn-secondary ui-btn-sm';
        button.dataset.action = action;
        button.dataset.id = item.id;
        button.textContent = label;
        button.setAttribute('aria-label', `${label} ${item.nome}`);
        button.disabled = busy;
        actions.append(button);
      }
    });
  }

  async function load() {
    const payload = await adminApiFetch('/api/admin/diretorias');
    const data = getApiData(payload);
    if (!Array.isArray(data?.items)) throw new Error('Resposta inválida ao carregar DREs.');
    items = data.items;
    render();
  }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    message('Carregando DREs...');
    try { await load(); message('Lista atualizada.'); }
    catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  }

  async function mutate(path, method, body, success) {
    setBusy(true);
    message('Salvando alteração...');
    try {
      await adminApiFetch(path, { method, body: JSON.stringify(body) });
      resetForm();
      message(success);
      try { await load(); }
      catch (_error) { message(`${success} Não foi possível atualizar a lista; use Atualizar.`, true); }
    } catch (error) {
      message(error.status === 0 || error.status >= 500
        ? 'O resultado da gravação não pôde ser confirmado. Atualize a lista antes de tentar novamente.'
        : error.message, true);
    } finally { setBusy(false); }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const body = Object.fromEntries(['nome', 'codigo', 'cidade_sede']
      .map(field => [field, form.elements[field].value.trim()]));
    mutate(editId ? `/api/admin/diretorias/${editId}` : '/api/admin/diretorias',
      editId ? 'PUT' : 'POST', body, editId ? 'DRE atualizada.' : 'DRE cadastrada.');
  });
  table.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy) return;
    const item = items.find(row => row.id === Number(button.dataset.id));
    if (!item) return;
    if (button.dataset.action === 'edit') {
      editId = item.id;
      for (const field of ['nome', 'codigo', 'cidade_sede']) form.elements[field].value = item[field];
      heading.textContent = `Editar DRE: ${item.nome}`;
      save.textContent = 'Salvar alterações';
      cancel.hidden = false;
      form.elements.nome.focus();
    } else if (window.confirm(`${item.ativo ? 'Desativar' : 'Ativar'} a DRE ${item.nome}?`)) {
      mutate(`/api/admin/diretorias/${item.id}/status`, 'PUT', { ativo: !item.ativo },
        item.ativo ? 'DRE desativada.' : 'DRE ativada.');
    }
  });
  cancel.addEventListener('click', resetForm);
  reload.addEventListener('click', refresh);
  search.addEventListener('input', render);
  status.addEventListener('change', render);
  refresh();
}
