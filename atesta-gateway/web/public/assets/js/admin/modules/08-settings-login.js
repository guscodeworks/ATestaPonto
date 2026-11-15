/* ============================================================
   PDF / IMPRESSAO
   ============================================================ */
// Exportação real: o PDF e a impressão usam os dados recebidos da API, não
// uma captura da tela administrativa.
function obterDadosExportacaoRelatorio() {
  if (RELATORIO_PERIODO_CARREGANDO || RELATORIO_PERIODO_ERRO || !RELATORIO_PERIODO) {
    throw new Error('Aguarde uma consulta concluída antes de exportar.');
  }
  const report = RELATORIO_PERIODO;
  const nominal = temCapacidade('relatorio.visualizar');
  const filtros = [report.filtros?.funcionario_id ? `Funcionário ID ${report.filtros.funcionario_id}` : null,
    report.filtros?.status ? `Status: ${report.filtros.status}` : null].filter(Boolean).join('; ') || 'Sem filtros nominais';
  const linhas = nominal ? report.items.map(item => [
    item.data_referencia.split('-').reverse().join('/'), item.ponto.funcionario.nome,
    `${item.ponto.unidade_escolar_nome} / vínculo ${item.ponto.vinculo_funcional_id}`,
    ...horariosRelatorio(item), statusRelatorioTexto(item),
  ]) : report.diretorias.flatMap(department => [
    [department.diretoria_ensino_nome, department.resumo.total_funcionarios, department.resumo.presentes,
      department.resumo.ausentes, `${department.resumo.taxa_presenca_percent}%`],
    ...department.escolas.map(school => [school.unidade_escolar_nome, school.resumo.total_funcionarios,
      school.resumo.presentes, school.resumo.ausentes, `${school.resumo.taxa_presenca_percent}%`]),
  ]);
  return {
    data: report.data_referencia,
    periodo: periodoRelatorioTexto(report), filtros,
    geradoPor: ADMIN?.nome || 'Administrador', geradoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    presentes: report.resumo.total_presencas, ausentes: report.resumo.total_ausencias,
    colunas: nominal ? ['Data', 'Funcionário', 'Escola / vínculo', 'Entrada', 'Pausa', 'Retorno', 'Saída', 'Status']
      : ['DRE / escola', 'Pessoas/dia', 'Presentes', 'Ausentes', 'Presença'],
    linhas,
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

function criarPdfRelatorio(relatorio) {
  const itens = relatorio.linhas.length ? relatorio.linhas : [relatorio.colunas.map((_coluna, index) => index ? '—' : 'Nenhum registro encontrado')];
  const paginas = [];
  const posicoes = relatorio.colunas.length === 8 ? [36, 104, 258, 462, 518, 574, 630, 686, 806]
    : [36, 390, 494, 598, 702, 806];
  const colunas = relatorio.colunas.map((titulo, index) => [titulo.toUpperCase(), posicoes[index],
    Math.floor((posicoes[index + 1] - posicoes[index] - 8) / 4.3)]);

  const blocos = [[]];
  let alturaPagina = 0;
  itens.forEach(item => {
    const celulas = item.map((valor, index) => String(valor ?? '').match(new RegExp(`.{1,${colunas[index][2]}}`, 'gu')) || ['']);
    const altura = Math.max(...celulas.map(celula => celula.length)) * 11 + 6;
    if (alturaPagina + altura > 390 && blocos.at(-1).length) { blocos.push([]); alturaPagina = 0; }
    blocos.at(-1).push({ celulas, altura });
    alturaPagina += altura;
  });
  for (const paginaItens of blocos) {
    const comandos = [];
    const escrever = (fonte, tamanho, x, y, valor) => comandos.push(`BT /F${fonte} ${tamanho} Tf ${x} ${y} Td ${textoPdf(valor)} Tj ET`);
    const linha = (x1, y1, x2, y2, espessura = 0.5) => comandos.push(`${espessura} w ${x1} ${y1} m ${x2} ${y2} l S`);

    comandos.push('0.05 0.18 0.38 rg', '36 536 770 28 re f', '1 1 1 rg');
    escrever(2, 15, 50, 547, 'ATestaPonto | Relatório de frequência');
    escrever(1, 9, 700, 547, `Página ${paginas.length + 1}`);
    comandos.push('0 0 0 rg');
    escrever(2, 11, 36, 510, `Período: ${relatorio.periodo}`);
    escrever(1, 9, 36, 497, `Gerado por: ${relatorio.geradoPor} em ${relatorio.geradoEm} (Brasília)`);
    escrever(1, 8, 36, 486, relatorio.filtros);
    escrever(2, 10, 410, 510, `Presentes: ${relatorio.presentes}`);
    escrever(2, 10, 520, 510, `Ausentes: ${relatorio.ausentes}`);
    comandos.push('0.93 0.95 0.97 rg', '36 462 770 20 re f', '0 0 0 rg');
    colunas.forEach(([titulo, x]) => escrever(2, 7, x + 4, 469, titulo));
    linha(36, 462, 806, 462);

    let y = 445;
    paginaItens.forEach(({ celulas, altura }) => {
      celulas.forEach((linhas, colIndex) => linhas.forEach((valor, index) =>
        escrever(1, 8, colunas[colIndex][1] + 4, y - index * 11, valor)));
      y -= altura;
      linha(36, y + 9, 806, y + 9, 0.25);
    });
    escrever(1, 7, 36, 26, 'Indicadores por pessoa e dia; dias futuros fora dos totais previstos.');
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
  if (!btn || !temCapacidade('relatorio.hierarquico.visualizar')) return;
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
  const linhas = relatorio.linhas.length ? relatorio.linhas.map(linha => `<tr>${linha.map(valor => `<td>${escapeHtml(String(valor))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${relatorio.colunas.length}">Nenhum registro encontrado para o período.</td></tr>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de frequência</title><style>
    @page { size: A4 landscape; margin: 14mm; } body { font: 11px Inter, Arial, sans-serif; color: #141414; margin: 0; }
    h1 { font-size: 21px; } p { margin: 6px 0; } table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border-bottom: 1px solid #E4E9F3; padding: 8px; text-align: left; } thead { display: table-header-group; }
  </style></head><body><header><h1>Relatório de frequência</h1><p>Período: ${escapeHtml(relatorio.periodo)}</p>
    <p>${escapeHtml(relatorio.filtros)}</p><p>Gerado por ${escapeHtml(relatorio.geradoPor)} em ${escapeHtml(relatorio.geradoEm)} (Brasília)</p>
    <p>Presentes: ${relatorio.presentes} · Ausentes: ${relatorio.ausentes} (pessoas/dia; dias futuros fora dos totais)</p></header>
    <table><thead><tr>${relatorio.colunas.map(coluna => `<th>${escapeHtml(coluna)}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></body></html>`;
}

function imprimirRelatorio() {
  if (!temCapacidade('relatorio.hierarquico.visualizar')) return;
  try {
    const dados = obterDadosExportacaoRelatorio();
    const janela = window.open('', '_blank');
    if (!janela) throw new Error('O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
    janela.document.write(criarHtmlImpressaoRelatorio(dados));
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

function aplicarAdminGovbr(admin, capacidades) {
  if (typeof ADMIN === 'undefined') {
    return;
  }

  definirCapacidadesAdmin(capacidades);
  if (!admin) return;

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
    const dadosSessao = getApiData(payload);
    const admin = dadosSessao?.admin;
    aplicarAdminGovbr(admin, dadosSessao?.capacidades);
    if (!admin) {
      const error = new Error('Sessão administrativa inválida.');
      error.status = 401;
      throw error;
    }
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
