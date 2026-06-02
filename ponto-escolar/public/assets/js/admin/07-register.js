/* ============================================================
   FORMULÁRIO — REGISTRAR
   ============================================================ */

function iniciarFormRegistro() {
  const form = document.getElementById('form-registro');
  if (!form) return;

  const inputCPF = document.getElementById('input-cpf');
  const inputTel = document.getElementById('input-tel');

  if (inputCPF) {
    inputCPF.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g,'');
      if (v.length>11) v=v.slice(0,11);
      v=v.replace(/(\d{3})(\d)/,'$1.$2');
      v=v.replace(/(\d{3})\.(\d{3})(\d)/,'$1.$2.$3');
      v=v.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/,'$1.$2.$3-$4');
      e.target.value=v;
    });
  }

  if (inputTel) {
    inputTel.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g,'');
      if (v.length>11) v=v.slice(0,11);
      v=v.replace(/(\d{2})(\d)/,'($1) $2');
      v=v.replace(/(\d{5})(\d)/,'$1-$2');
      e.target.value=v;
    });
  }

  // Preview em tempo real
  function atualizarPreview() {
    const nome  = (document.getElementById('input-nome')?.value||'').trim();
    const email = (document.getElementById('input-email')?.value||'').trim();
    const cpf   = (document.getElementById('input-cpf')?.value||'').trim();
    const cargo = document.getElementById('input-cargo')?.value||'';
    const tel   = (document.getElementById('input-tel')?.value||'').trim();

    const av = document.getElementById('preview-avatar');
    if (av) av.textContent = nome ? getIniciais(nome) : 'FN';
    const pn = document.getElementById('preview-nome');
    if (pn) pn.textContent = nome || 'Nome do Funcionário';
    const pc = document.getElementById('preview-cargo');
    if (pc) pc.textContent = cargo || 'Cargo';
    const pe = document.getElementById('preview-email');
    if (pe) pe.textContent = email || '—';
    const pp = document.getElementById('preview-cpf');
    if (pp) pp.textContent = cpf || '—';
    const pt = document.getElementById('preview-tel');
    if (pt) pt.textContent = tel || '—';
  }

  ['input-nome','input-email','input-cpf','input-cargo','input-tel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', atualizarPreview); el.addEventListener('change', atualizarPreview); }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const nome  = document.getElementById('input-nome')?.value.trim();
    const email = document.getElementById('input-email')?.value.trim();
    const cpf   = document.getElementById('input-cpf')?.value.trim();
    const cargo = document.getElementById('input-cargo')?.value;
    const tel   = document.getElementById('input-tel')?.value.trim();

    if (!nome || !email || !cpf || !cargo) { toast('Preencha todos os campos obrigatórios.','error'); return; }
    if (cpf.length < 14) { toast('CPF inválido.','error'); return; }

    const btn = document.getElementById('btn-registrar');
    btn.classList.add('loading');

    setTimeout(() => {
      const novoId = Math.max(...FUNCIONARIOS.map(f=>f.id)) + 1;
      FUNCIONARIOS.push({ id:novoId, nome, email, cpf, cargo, tel:tel||'—', status:'ativo', admissao:formatarData(new Date()) });
      toast(`Funcionário "${nome}" cadastrado com sucesso!`, 'success');
      form.reset();
      btn.classList.remove('loading');
      atualizarPreview();
    }, 1000);
  });
}

