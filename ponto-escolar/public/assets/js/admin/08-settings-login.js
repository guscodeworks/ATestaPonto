/* ============================================================
   PDF / IMPRESSAO
   ============================================================ */
function gerarPDF() {
  const btn = document.getElementById('btn-gerar-pdf');
  if (!btn) return;
  btn.classList.add('loading');
  // Funcionalidade pendente: o setTimeout simula o tempo de geração
  // apenas para dar feedback visual, mas nenhum PDF é gerado de fato.
  setTimeout(() => {
    toast('Geracao de PDF ainda nao integrada. Use imprimir por enquanto.', 'info');
    btn.classList.remove('loading');
  }, 1800);
}

function imprimirRelatorio() {
  toast('Abrindo janela de impressao...', 'info');
  // Pequeno atraso para o toast ser percebido pelo usuário antes que o
  // diálogo de impressão do navegador (bloqueante) seja aberto.
  setTimeout(() => window.print(), 600);
}

// Exportação real: o PDF e a impressão usam os dados recebidos da API, não
// uma captura da tela administrativa.
function obterDadosExportacaoRelatorio() {
  if (RELATORIO_DATA_ERROR) {
    throw new Error('O relatório não foi carregado. Atualize os dados antes de exportar.');
  }

  const resumo = RESUMO_PONTOS || {};
  return {
    data: DATA_REFERENCIA_RELATORIO || DATA_REFERENCIA_PONTOS || '',
    periodo: formatarDataReferencia(DATA_REFERENCIA_RELATORIO || DATA_REFERENCIA_PONTOS),
    geradoPor: ADMIN?.nome || 'Administrador',
    geradoEm: new Date().toLocaleString('pt-BR'),
    presentes: Number(resumo.presentes || 0),
    ausentes: Number(resumo.ausentes || 0),
    itens: (Array.isArray(RELATORIO_PONTOS) ? RELATORIO_PONTOS : []).map((item) => ({
      nome: item.funcionario?.nome || 'Funcionário não identificado',
      cargo: item.funcionario?.cargo || 'Cargo não informado',
      entrada: item.entrada || '-',
      pausa: item.pausa || '-',
      retorno: item.retorno || '-',
      saida: item.saida || '-',
      status: item.status === 'completo' ? 'Completo' : item.status === 'ausente' ? 'Ausente' : 'Em andamento',
    })),
  };
}

function textoPdf(value) {
  const troca = { '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...' };
  const texto = String(value ?? '').replace(/[–—“”‘’…]/g, (char) => troca[char]);
  let hex = '';
  for (const char of texto) {
    const codigo = char.charCodeAt(0);
    hex += (codigo <= 255 ? codigo : 63).toString(16).padStart(2, '0');
  }
  return `<${hex}>`;
}

function encurtarTextoPdf(value, limite) {
  const texto = String(value ?? '');
  return texto.length > limite ? `${texto.slice(0, limite - 3)}...` : texto;
}

function criarPdfRelatorio(relatorio) {
  const itens = relatorio.itens.length ? relatorio.itens : [{
    nome: 'Nenhum registro encontrado', cargo: '-', entrada: '-', pausa: '-', retorno: '-', saida: '-', status: '-',
  }];
  const porPagina = 24;
  const paginas = [];
  const colunas = [
    ['FUNCIONÁRIO', 40, 31], ['CARGO', 238, 18], ['ENTRADA', 370, 8], ['PAUSA', 446, 8],
    ['RETORNO', 512, 8], ['SAÍDA', 586, 8], ['STATUS', 658, 17],
  ];

  for (let inicio = 0; inicio < itens.length; inicio += porPagina) {
    const comandos = [];
    const escrever = (fonte, tamanho, x, y, valor) => comandos.push(`BT /F${fonte} ${tamanho} Tf ${x} ${y} Td ${textoPdf(valor)} Tj ET`);
    const linha = (x1, y1, x2, y2, espessura = 0.5) => comandos.push(`${espessura} w ${x1} ${y1} m ${x2} ${y2} l S`);
    const paginaItens = itens.slice(inicio, inicio + porPagina);

    comandos.push('0.05 0.18 0.38 rg', '36 536 770 28 re f', '1 1 1 rg');
    escrever(2, 15, 50, 547, 'ATestaPonto | Relatório de frequência');
    escrever(1, 9, 700, 547, `Página ${paginas.length + 1}`);
    comandos.push('0 0 0 rg');
    escrever(2, 11, 36, 510, `Período: ${relatorio.periodo}`);
    escrever(1, 9, 36, 494, `Gerado por: ${relatorio.geradoPor} em ${relatorio.geradoEm}`);
    escrever(2, 10, 410, 510, `Presentes: ${relatorio.presentes}`);
    escrever(2, 10, 520, 510, `Ausentes: ${relatorio.ausentes}`);
    comandos.push('0.93 0.95 0.97 rg', '36 462 770 20 re f', '0 0 0 rg');
    colunas.forEach(([titulo, x]) => escrever(2, 7, x + 4, 469, titulo));
    linha(36, 462, 806, 462);

    paginaItens.forEach((item, indice) => {
      const y = 445 - (indice * 16);
      const valores = [item.nome, item.cargo, item.entrada, item.pausa, item.retorno, item.saida, item.status];
      colunas.forEach(([, x, limite], colIndex) => escrever(1, 8, x + 4, y, encurtarTextoPdf(valores[colIndex], limite)));
      linha(36, y - 5, 806, y - 5, 0.25);
    });
    escrever(1, 7, 36, 26, 'Documento gerado a partir dos registros do sistema ATestaPonto.');
    paginas.push(comandos.join('\n'));
  }

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${paginas.map((_pagina, indice) => `${5 + indice * 2} 0 R`).join(' ')}] /Count ${paginas.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  paginas.forEach((conteudo, indice) => {
    const paginaId = 5 + indice * 2;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${paginaId + 1} 0 R >>`);
    objetos.push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
  });

  let arquivo = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objetos.forEach((objeto, indice) => {
    offsets.push(arquivo.length);
    arquivo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = arquivo.length;
  arquivo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { arquivo += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  arquivo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([new Uint8Array(Array.from(arquivo, (char) => char.charCodeAt(0)))], { type: 'application/pdf' });
}

function gerarPDF() {
  const btn = document.getElementById('btn-gerar-pdf');
  if (!btn) return;
  try {
    btn.classList.add('loading');
    const relatorio = obterDadosExportacaoRelatorio();
    const url = URL.createObjectURL(criarPdfRelatorio(relatorio));
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-frequencia-${relatorio.data || new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('PDF do relatório gerado com sucesso.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível gerar o PDF do relatório.', 'error');
  } finally {
    btn.classList.remove('loading');
  }
}

function criarHtmlImpressaoRelatorio(relatorio) {
  const linhas = relatorio.itens.length ? relatorio.itens.map((item) => `
    <tr><td><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml(item.cargo)}</small></td><td>${escapeHtml(item.entrada)}</td><td>${escapeHtml(item.pausa)}</td><td>${escapeHtml(item.retorno)}</td><td>${escapeHtml(item.saida)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('') :
    '<tr><td colspan="6">Nenhum registro encontrado para o período.</td></tr>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de frequência</title><style>
    @page { size: A4 landscape; margin: 14mm; } * { box-sizing: border-box; } body { font: 11px Arial, sans-serif; color: #172033; margin: 0; } header { border-bottom: 2px solid #0d2e61; padding-bottom: 11px; margin-bottom: 16px; } h1 { color: #0d2e61; font-size: 21px; margin: 0 0 5px; } p { color: #475569; margin: 3px 0; } .summary { display: flex; gap: 12px; margin-bottom: 16px; } .card { border: 1px solid #cbd5e1; border-radius: 4px; min-width: 130px; padding: 9px 12px; } .card b { color: #0d2e61; display: block; font-size: 16px; margin-top: 3px; } table { border-collapse: collapse; width: 100%; } thead { display: table-header-group; } th { background: #0d2e61; color: white; font-size: 10px; padding: 8px; text-align: left; } td { border-bottom: 1px solid #dbe3ed; padding: 8px; vertical-align: top; } td:not(:first-child) { white-space: nowrap; } small { color: #64748b; display: block; margin-top: 2px; } footer { color: #64748b; font-size: 9px; margin-top: 16px; }
  </style></head><body><header><h1>Relatório de frequência</h1><p><strong>Período:</strong> ${escapeHtml(relatorio.periodo)}</p><p>Gerado por ${escapeHtml(relatorio.geradoPor)} em ${escapeHtml(relatorio.geradoEm)}</p></header><section class="summary"><div class="card">Presentes<b>${relatorio.presentes}</b></div><div class="card">Ausentes<b>${relatorio.ausentes}</b></div><div class="card">Registros no relatório<b>${relatorio.itens.length}</b></div></section><table><thead><tr><th>Funcionário</th><th>Entrada</th><th>Pausa</th><th>Retorno</th><th>Saída</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table><footer>Documento gerado a partir dos registros do sistema ATestaPonto.</footer></body></html>`;
}

function imprimirRelatorio() {
  try {
    const janela = window.open('', '_blank');
    if (!janela) throw new Error('O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
    janela.document.write(criarHtmlImpressaoRelatorio(obterDadosExportacaoRelatorio()));
    janela.document.close();
    janela.focus();
    window.setTimeout(() => janela.print(), 150);
  } catch (error) {
    toast(error.message || 'Não foi possível preparar a impressão.', 'error');
  }
}

/* ============================================================
   CONFIGURACOES
   ============================================================ */

function iniciarConfiguracoes() {
  const navItems = document.querySelectorAll('.settings-nav-item[data-panel]');
  if (!navItems.length) return;
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach((p) => {
        p.style.display = 'none';
      });
      const target = document.getElementById(item.dataset.panel);
      if (target) target.style.display = 'block';
    });
  });
}

/* ============================================================
   AUTENTICACAO GOV.BR
   A rota real ja e protegida pelo backend com req.session.admin.
   ============================================================ */

function aplicarAdminGovbr(admin) {
  if (!admin || typeof ADMIN === 'undefined') {
    return;
  }

  ADMIN.nome = admin.nome || admin.name || ADMIN.nome;
  // Cargo fixo: nesta tela todo usuário autenticado via gov.br é tratado
  // como Administrador, independente do que a API retorne.
  ADMIN.cargo = 'Administrador';

  if (typeof renderizarPerfil === 'function') {
    renderizarPerfil();
  }

  const configAvatar = document.getElementById('config-avatar');
  const configNome = document.getElementById('config-nome');
  const configNomeField = document.getElementById('cfg-nome');
  const configEmailField = document.getElementById('cfg-email');

  if (configAvatar) configAvatar.textContent = getIniciais(ADMIN.nome);
  if (configNome) configNome.textContent = ADMIN.nome;
  if (configNomeField) configNomeField.value = ADMIN.nome;
  if (configEmailField) configEmailField.value = admin.email || '';
}

async function sincronizarSessaoAdmin() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const payload = await adminApiFetch('/api/admin/auth/me', {
      signal: controller.signal,
    });
    const admin = getApiData(payload)?.admin;
    if (!admin) {
      const error = new Error('Sessão administrativa inválida.');
      error.status = 401;
      throw error;
    }
    aplicarAdminGovbr(admin);
    return admin;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('A validação da sessão demorou mais que o esperado.');
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function validarSessaoAdmin() {
  return sincronizarSessaoAdmin();
}

function iniciarLogoutAdmin() {
  document.querySelectorAll('.btn-logout').forEach((button) => {
    // Remove handlers antigos (inline onclick e listeners anteriores)
    // antes de anexar o novo, evitando duplicidade de logout.
    button.onclick = null;
    button.removeAttribute('onclick');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      redirecionarAdminParaGovbr(
        '/auth/govbr/logout',
        'Encerrando a sessão administrativa...'
      );
    });
  });
}

/* ============================================================
   BUSCA E FILTROS - FUNCIONARIOS
   ============================================================ */

function iniciarFiltrosFuncionarios() {
  const inputBusca = document.getElementById('busca-funcionario');
  const filtroStatus = document.getElementById('filtro-status');
  const filtroCargo = document.getElementById('filtro-cargo');
  let searchTimer = null;

  const reload = () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    recarregarListaFuncionarios();
  };

  if (inputBusca) {
    inputBusca.addEventListener('input', () => {
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(reload, 300);
    });
  }
  if (filtroStatus) filtroStatus.addEventListener('change', reload);
  if (filtroCargo) filtroCargo.addEventListener('change', reload);
}
