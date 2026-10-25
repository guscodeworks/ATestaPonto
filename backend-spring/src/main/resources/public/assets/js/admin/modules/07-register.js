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

function validarAcessoPaginaRegistroFuncionario() {
  const pagina = document.querySelector('.register-page');
  if (!pagina || temCapacidade('funcionario.criar')) return true;

  const form = document.getElementById('form-registro');
  form?.querySelectorAll('input, select, button').forEach((controle) => {
    controle.disabled = true;
  });
  form?.remove();
  window.location.replace('/admin/dashboard');
  return false;
}

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
  if (!temCapacidade('funcionario.criar')) {
    form.remove();
    return;
  }
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
  const inputUnidade = document.getElementById('input-unidade');
  const feedbackUnidade = document.getElementById('unidade-feedback');
  const btnRegistrar = document.getElementById('btn-registrar');
  let unidadesAutorizadas = new Set();

  async function carregarUnidadesParaCadastro() {
    btnRegistrar.disabled = true;
    inputUnidade.disabled = true;
    if (feedbackUnidade) feedbackUnidade.textContent = 'Consultando unidades autorizadas...';

    try {
      const payload = await adminApiFetch(`${ADMIN_ENDPOINTS.funcionarios}/unidades`);
      const items = getApiData(payload)?.items;
      if (!Array.isArray(items)) throw new Error('Não foi possível obter as unidades autorizadas.');

      const unidades = items.filter((item) =>
        Number.isSafeInteger(Number(item?.id)) && Number(item.id) > 0 && item.nome
      );
      unidadesAutorizadas = new Set(unidades.map((item) => Number(item.id)));
      inputUnidade.replaceChildren();

      if (unidades.length > 1) {
        const placeholder = new Option('Selecione a unidade escolar...', '', true, true);
        placeholder.disabled = true;
        inputUnidade.add(placeholder);
      }
      unidades.forEach((item) => {
        const option = new Option(String(item.nome), String(item.id));
        option.defaultSelected = unidades.length === 1;
        option.selected = unidades.length === 1;
        inputUnidade.add(option);
      });

      inputUnidade.disabled = unidades.length <= 1;
      btnRegistrar.disabled = unidades.length === 0;
      if (feedbackUnidade) {
        feedbackUnidade.textContent = unidades.length === 0
          ? 'Nenhuma unidade autorizada para cadastro.'
          : unidades.length === 1
            ? 'Sua unidade foi selecionada automaticamente.'
            : 'Selecione uma das unidades autorizadas para o cadastro.';
      }
    } catch (error) {
      unidadesAutorizadas = new Set();
      inputUnidade.replaceChildren(new Option('Unidades indisponíveis', ''));
      if (feedbackUnidade) feedbackUnidade.textContent = error.message || 'Não foi possível carregar as unidades.';
      if (error.status === 401) redirecionarAdminParaGovbr();
    }
  }

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
    if (!temCapacidade('funcionario.criar')) return;
    // Bloqueia cliques/envios repetidos enquanto o POST atual ainda esta em
    // andamento. Assim, cada tentativa possui uma unica resposta e um toast.
    if (form.dataset.cadastroEmAndamento === 'true') return;
    const nome = document.getElementById('input-nome')?.value.trim();
    const email = document.getElementById('input-email')?.value.trim();
    const cpf = document.getElementById('input-cpf')?.value.trim();
    const cpfDigits = somenteDigitos(cpf);
    const cargo = document.getElementById('input-cargo')?.value;
    const unidadeEscolarId = Number(inputUnidade.value);
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
    if (!unidadesAutorizadas.has(unidadeEscolarId)) {
      toast('Selecione uma unidade escolar autorizada.', 'error');
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
    form.dataset.cadastroEmAndamento = 'true';
    form.setAttribute('aria-busy', 'true');
    const carregamento = iniciarCarregamento(btn, {
      tamanho: 'sm',
      mensagem: 'Registrando...',
      mostrarMensagem: true,
    });

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
          unidade_escolar_id: unidadeEscolarId,
          entrada,
          saida_almoco: saidaAlmoco,
          retorno_almoco: retornoAlmoco,
          saida,
        }),
      });

      const dadosCriados = getApiData(response);
      const funcionarioCriado = dadosCriados?.funcionario;
      const emailAcesso = dadosCriados?.email_acesso;
      if (funcionarioCriado) {
        // Insere no início da lista para que o novo funcionário apareça
        // imediatamente no topo, sem esperar um recarregamento completo.
        FUNCIONARIOS.unshift(normalizarFuncionarioApi(funcionarioCriado));
      }

      form.reset();
      atualizarPreview();
      if (emailAcesso?.enviado) {
        toast(`Funcionario "${nome}" cadastrado. As instrucoes de acesso foram enviadas para o e-mail informado.`, 'success');
      } else {
        toast('Funcionario cadastrado, mas o e-mail com as instrucoes de acesso nao foi enviado.', 'error');
      }
    } catch (error) {
      toast(error.message || 'Nao foi possivel cadastrar o funcionario.', 'error');
      if (error.status === 401) {
        redirecionarAdminParaGovbr();
      }
    } finally {
      await finalizarCarregamento(carregamento);
      delete form.dataset.cadastroEmAndamento;
      form.removeAttribute('aria-busy');
    }
  });

  carregarUnidadesParaCadastro();
}
