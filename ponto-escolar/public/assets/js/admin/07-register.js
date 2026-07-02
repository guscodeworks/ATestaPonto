/* ============================================================
   FORMULARIO - REGISTRAR
   ============================================================ */

function iniciarFormRegistro() {
  const form = document.getElementById('form-registro');
  if (!form) return;

  const inputCPF = document.getElementById('input-cpf');
  const inputTel = document.getElementById('input-tel');

  if (inputCPF) {
    // Máscara aplicada progressivamente: cada replace assume que o
    // anterior já formatou o trecho correspondente do CPF.
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
    // Campo mantido apenas na interface: a API admin atual não tem
    // suporte a telefone no cadastro, então o valor digitado não é enviado.
    inputTel.title = 'Telefone ainda nao e enviado porque nao existe no contrato atual da API admin.';
    inputTel.addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g,'');
      if (v.length>11) v=v.slice(0,11);
      v=v.replace(/(\d{2})(\d)/,'($1) $2');
      v=v.replace(/(\d{5})(\d)/,'$1-$2');
      e.target.value=v;
    });
  }

  function atualizarPreview() {
    const nome = (document.getElementById('input-nome')?.value||'').trim();
    const email = (document.getElementById('input-email')?.value||'').trim();
    const cpf = (document.getElementById('input-cpf')?.value||'').trim();
    const cargo = document.getElementById('input-cargo')?.value||'';
    const tel = (document.getElementById('input-tel')?.value||'').trim();

    const av = document.getElementById('preview-avatar');
    if (av) av.textContent = nome ? getIniciais(nome) : 'FN';
    const pn = document.getElementById('preview-nome');
    if (pn) pn.textContent = nome || 'Nome do Funcionario';
    const pc = document.getElementById('preview-cargo');
    if (pc) pc.textContent = cargo || 'Cargo';
    const pe = document.getElementById('preview-email');
    if (pe) pe.textContent = email || '—';
    const pp = document.getElementById('preview-cpf');
    if (pp) pp.textContent = cpf || '—';
    const pt = document.getElementById('preview-tel');
    if (pt) pt.textContent = tel || '—';
  }

  // Preview em tempo real: qualquer digitação ou seleção nos campos
  // atualiza o card de pré-visualização do funcionário.
  ['input-nome','input-email','input-cpf','input-cargo','input-tel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', atualizarPreview); el.addEventListener('change', atualizarPreview); }
  });

  form.addEventListener('reset', () => {
    // requestAnimationFrame garante que o preview só seja atualizado
    // depois que o navegador já limpou os valores dos campos do form.
    window.requestAnimationFrame(atualizarPreview);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = document.getElementById('input-nome')?.value.trim();
    const email = document.getElementById('input-email')?.value.trim();
    const cpf = document.getElementById('input-cpf')?.value.trim();
    const cpfDigits = somenteDigitos(cpf);
    const cargo = document.getElementById('input-cargo')?.value;
    const tel = document.getElementById('input-tel')?.value.trim();

    if (!nome || !email || !cpf || !cargo) {
      toast('Preencha todos os campos obrigatorios.', 'error');
      return;
    }
    if (cpfDigits.length !== 11) {
      toast('CPF invalido.', 'error');
      return;
    }

    const btn = document.getElementById('btn-registrar');
    if (btn) btn.classList.add('loading');

    try {
      const response = await adminApiFetch(ADMIN_ENDPOINTS.funcionarios, {
        method: 'POST',
        body: JSON.stringify({
          nome,
          email,
          cpf: cpfDigits,
          // Senha inicial definida como o próprio CPF: o funcionário deve
          // trocá-la no primeiro acesso.
          senha: cpfDigits,
          ativo: true,
        }),
      });

      const funcionarioCriado = getApiData(response)?.funcionario;
      if (funcionarioCriado) {
        // Insere no início da lista para que o novo funcionário apareça
        // imediatamente no topo, sem esperar um recarregamento completo.
        FUNCIONARIOS.unshift(normalizarFuncionarioApi(funcionarioCriado));
      }

      toast(`Funcionario "${nome}" cadastrado com sucesso.`, 'success');
      // Avisa o usuário que cargo e telefone foram preenchidos no
      // formulário mas não foram persistidos, já que a API ainda não
      // aceita esses campos no cadastro.
      if (cargo || tel) {
        toast('Cargo por nome e telefone nao foram enviados: a API atual ainda nao expoe esses campos.', 'info');
      }
      form.reset();
      atualizarPreview();
    } catch (error) {
      toast(error.message || 'Nao foi possivel cadastrar o funcionario.', 'error');
    } finally {
      if (btn) btn.classList.remove('loading');
    }
  });
}