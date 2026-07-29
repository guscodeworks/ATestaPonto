/* ============================================================
   FORMULARIO - REGISTRAR
   ============================================================ */

function horarioEmMinutos(horario) {
  const [horas, minutos] = String(horario || '').split(':').map(Number);
  return (horas * 60) + minutos;
}

function horariosEstaoEmOrdem({ entrada, saidaAlmoco, retornoAlmoco, saida }) {
  const valores = [entrada, saidaAlmoco, retornoAlmoco, saida];
  if (valores.some((horario) => !/^\d{2}:\d{2}$/.test(horario))) return false;

  const minutos = valores.map(horarioEmMinutos);
  return minutos.every((valor, indice) => indice === 0 || minutos[indice - 1] < valor);
}

function gerarOpcoesDeHorario() {
  const horarios = [];
  const inicio = 7 * 60;
  const fim = 23 * 60;

  for (let minutos = inicio; minutos <= fim; minutos += 30) {
    const horas = String(Math.floor(minutos / 60)).padStart(2, '0');
    const minutosRestantes = String(minutos % 60).padStart(2, '0');
    horarios.push(`${horas}:${minutosRestantes}`);
  }

  return horarios;
}

const OPCOES_DE_HORARIO = gerarOpcoesDeHorario();

function preencherSelectDeHorario(select, horarioAnterior = null) {
  if (!select) return;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione o horário';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.replaceChildren(placeholder);

  if (!horarioAnterior && select.id !== 'input-entrada') {
    select.disabled = true;
    return;
  }

  const limiteEmMinutos = horarioAnterior
    ? horarioEmMinutos(horarioAnterior)
    : null;
  OPCOES_DE_HORARIO
    .filter((horario) => limiteEmMinutos === null || horarioEmMinutos(horario) > limiteEmMinutos)
    .forEach((horario) => {
      const option = document.createElement('option');
      option.value = horario;
      option.textContent = horario;
      select.appendChild(option);
    });

  select.disabled = false;
}

function iniciarFormRegistro() {
  const form = document.getElementById('form-registro');
  if (!form) return;
  // Impede que uma reinicializacao da pagina registre novamente os mesmos
  // listeners e transforme uma unica resposta de erro em toasts duplicados.
  if (form.dataset.registroInicializado === 'true') return;
  form.dataset.registroInicializado = 'true';

  const inputCPF = document.getElementById('input-cpf');
  const inputTel = document.getElementById('input-tel');
  const inputEntrada = document.getElementById('input-entrada');
  const inputSaidaAlmoco = document.getElementById('input-saida-almoco');
  const inputRetornoAlmoco = document.getElementById('input-retorno-almoco');
  const inputSaida = document.getElementById('input-saida');
  const modalSenha = document.getElementById('modal-senha-temporaria');
  const inputSenhaTemporaria = document.getElementById('senha-temporaria-valor');

  function reiniciarHorarios() {
    preencherSelectDeHorario(inputEntrada);
    preencherSelectDeHorario(inputSaidaAlmoco);
    preencherSelectDeHorario(inputRetornoAlmoco);
    preencherSelectDeHorario(inputSaida);
  }

  reiniciarHorarios();

  inputEntrada?.addEventListener('change', () => {
    preencherSelectDeHorario(inputSaidaAlmoco, inputEntrada.value);
    preencherSelectDeHorario(inputRetornoAlmoco);
    preencherSelectDeHorario(inputSaida);
  });

  inputSaidaAlmoco?.addEventListener('change', () => {
    preencherSelectDeHorario(inputRetornoAlmoco, inputSaidaAlmoco.value);
    preencherSelectDeHorario(inputSaida);
  });

  inputRetornoAlmoco?.addEventListener('change', () => {
    preencherSelectDeHorario(inputSaida, inputRetornoAlmoco.value);
  });

  function ocultarSenhaTemporaria() {
    if (inputSenhaTemporaria) inputSenhaTemporaria.value = '';
    const nomeFuncionario = document.getElementById('senha-temporaria-funcionario');
    if (nomeFuncionario) nomeFuncionario.textContent = '';
    if (modalSenha) modalSenha.classList.remove('show');
  }

  function mostrarSenhaTemporaria(nome, senhaTemporaria) {
    if (!modalSenha || !inputSenhaTemporaria) return false;
    inputSenhaTemporaria.value = senhaTemporaria;
    const nomeFuncionario = document.getElementById('senha-temporaria-funcionario');
    if (nomeFuncionario) nomeFuncionario.textContent = nome;
    modalSenha.classList.add('show');
    inputSenhaTemporaria.focus();
    inputSenhaTemporaria.select();
    return true;
  }

  document.getElementById('btn-fechar-senha-temporaria')?.addEventListener('click', ocultarSenhaTemporaria);
  modalSenha?.addEventListener('click', (event) => {
    if (event.target === modalSenha) ocultarSenhaTemporaria();
  });
  document.getElementById('btn-copiar-senha-temporaria')?.addEventListener('click', async () => {
    const senha = inputSenhaTemporaria?.value;
    if (!senha) return;

    try {
      await navigator.clipboard.writeText(senha);
    } catch (_error) {
      inputSenhaTemporaria.focus();
      inputSenhaTemporaria.select();
      if (!document.execCommand('copy')) {
        toast('Nao foi possivel copiar automaticamente. Selecione e copie a senha.', 'error');
        return;
      }
    }
    toast('Senha temporaria copiada.', 'success');
  });

  if (inputCPF) {
    inputCPF.addEventListener('input', e => {
      e.target.value = formatarCpfCadastroAdmin(e.target.value);
    });

    // Intercepta a colagem antes de o maxlength do campo truncar o texto
    // bruto. Assim, prefixos, espacos e pontuacao sao removidos primeiro.
    inputCPF.addEventListener('paste', e => {
      e.preventDefault();
      const texto = e.clipboardData?.getData('text') || '';
      inputCPF.value = formatarCpfCadastroAdmin(texto);
      inputCPF.dispatchEvent(new Event('input', { bubbles: true }));
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

  function atualizarPreview() {
    const nome = (document.getElementById('input-nome')?.value||'').trim();
    const email = (document.getElementById('input-email')?.value||'').trim();
    const cpf = (document.getElementById('input-cpf')?.value||'').trim();
    const cargoSelect = document.getElementById('input-cargo');
    const cargo = cargoSelect?.value
      ? (cargoSelect.selectedOptions[0]?.textContent || '').trim()
      : '';
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
    window.requestAnimationFrame(() => {
      reiniciarHorarios();
      atualizarPreview();
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    // Bloqueia cliques/envios repetidos enquanto o POST atual ainda esta em
    // andamento. Assim, cada tentativa possui uma unica resposta e um toast.
    if (form.dataset.cadastroEmAndamento === 'true') return;
    const nome = document.getElementById('input-nome')?.value.trim();
    const email = document.getElementById('input-email')?.value.trim();
    const cpf = document.getElementById('input-cpf')?.value.trim();
    const cpfDigits = somenteDigitos(cpf);
    const cargo = document.getElementById('input-cargo')?.value;
    const tel = document.getElementById('input-tel')?.value.trim();
    const entrada = document.getElementById('input-entrada')?.value;
    const saidaAlmoco = document.getElementById('input-saida-almoco')?.value;
    const retornoAlmoco = document.getElementById('input-retorno-almoco')?.value;
    const saida = document.getElementById('input-saida')?.value;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (!nome || !email || !cpf || !cargo) {
      toast('Preencha todos os campos obrigatorios.', 'error');
      return;
    }
    const validacaoCpf = validarCpfCadastroAdmin(cpfDigits);
    if (validacaoCpf.motivo === 'tamanho') {
      toast('CPF deve possuir 11 dígitos.', 'error');
      return;
    }
    if (!validacaoCpf.valido) {
      toast('CPF inválido. Verifique os dígitos informados.', 'error');
      return;
    }
    if (!horariosEstaoEmOrdem({ entrada, saidaAlmoco, retornoAlmoco, saida })) {
      toast('Os horarios devem seguir a ordem: entrada, saida para almoco, retorno e saida.', 'error');
      return;
    }

    const btn = document.getElementById('btn-registrar');
    const botaoEstavaDesabilitado = Boolean(btn?.disabled);
    form.dataset.cadastroEmAndamento = 'true';
    form.setAttribute('aria-busy', 'true');
    if (btn) btn.disabled = true;
    if (btn) btn.classList.add('loading');

    try {
      const response = await adminApiFetch(ADMIN_ENDPOINTS.funcionarios, {
        method: 'POST',
        body: JSON.stringify({
          nome,
          email,
          cpf: cpfDigits,
          telefone: tel ? somenteDigitos(tel) : null,
          ativo: true,
          cargo,
          entrada,
          saida_almoco: saidaAlmoco,
          retorno_almoco: retornoAlmoco,
          saida,
        }),
      });

      const dadosCriados = getApiData(response);
      const funcionarioCriado = dadosCriados?.funcionario;
      const senhaTemporaria = dadosCriados?.senha_temporaria;
      if (funcionarioCriado) {
        // Insere no início da lista para que o novo funcionário apareça
        // imediatamente no topo, sem esperar um recarregamento completo.
        FUNCIONARIOS.unshift(normalizarFuncionarioApi(funcionarioCriado));
      }

      toast(`Funcionario "${nome}" cadastrado com sucesso.`, 'success');
      form.reset();
      atualizarPreview();
      if (!senhaTemporaria || !mostrarSenhaTemporaria(nome, senhaTemporaria)) {
        toast('Funcionario cadastrado, mas nao foi possivel exibir a senha temporaria.', 'error');
      }
    } catch (error) {
      toast(error.message || 'Nao foi possivel cadastrar o funcionario.', 'error');
      if (error.status === 401) {
        window.location.replace('/auth/govbr/login');
      }
    } finally {
      if (btn) btn.classList.remove('loading');
      if (btn) btn.disabled = botaoEstavaDesabilitado;
      delete form.dataset.cadastroEmAndamento;
      form.removeAttribute('aria-busy');
    }
  });
}
