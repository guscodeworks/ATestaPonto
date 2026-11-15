/* ============================================================
   RELATORIO
   ============================================================ */

function validarAcessoPaginaRelatorios() {
  const pagina = document.querySelector('.reports-page');
  if (!pagina) return true;
  if (temCapacidade('relatorio.hierarquico.visualizar')) {
    if (!temCapacidade('relatorio.visualizar')) {
      pagina.querySelectorAll('#relatorio-nominal, [data-filtro-nominal], .reports-chart-panel')
        .forEach(elemento => elemento.remove());
    }
    return true;
  }

  pagina.remove();
  window.location.replace('/admin/dashboard');
  return false;
}

async function carregarRelatorioHierarquicoAdmin(dataReferencia, options = {}) {
  try {
    const query = dataReferencia ? `?data=${encodeURIComponent(dataReferencia)}` : '';
    const payload = await adminApiFetch(`${ADMIN_ENDPOINTS.pontosRelatorioHierarquia}${query}`, {
      signal: options.signal,
    });
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;
    const report = getApiData(payload);
    if (!report || !Array.isArray(report.diretorias)) throw new Error('Resposta inválida ao carregar os indicadores.');
    RELATORIO_HIERARQUICO = report;
    RELATORIO_HIERARQUICO_DATA_ERROR = null;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;
    RELATORIO_HIERARQUICO = null;
    RELATORIO_HIERARQUICO_DATA_ERROR = error;
    throw error;
  }
}

function renderizarRelatorioHierarquico() {
  const tbody = document.getElementById('tbody-relatorio-hierarquico');
  if (!tbody || !temCapacidade('relatorio.hierarquico.visualizar')) return;
  if (RELATORIO_HIERARQUICO_DATA_ERROR) {
    const error = RELATORIO_HIERARQUICO_DATA_ERROR;
    tbody.innerHTML = `<tr><td colspan="5">${criarEstadoErroDadosAdmin(
      'Não foi possível carregar os indicadores', error.message,
      ![401, 403].includes(Number(error.status || 0))
    )}</td></tr>`;
    return;
  }
  if (!RELATORIO_HIERARQUICO) return;
  const report = RELATORIO_HIERARQUICO;
  const date = document.getElementById('hierarquia-data');
  if (date) date.textContent = formatarDataReferencia(report.data_referencia);
  const row = (name, summary, department) => `<tr>
    <th scope="row">${department ? `<strong>${escapeHtml(name)}</strong>` : escapeHtml(name)}</th>
    <td>${escapeHtml(String(summary.total_funcionarios))}</td>
    <td>${escapeHtml(String(summary.presentes))}</td>
    <td>${escapeHtml(String(summary.ausentes))}</td>
    <td>${escapeHtml(String(summary.taxa_presenca_percent))}%</td></tr>`;
  tbody.innerHTML = report.diretorias.map(department =>
    row(department.diretoria_ensino_nome, department.resumo, true)
    + department.escolas.map(school => row(school.unidade_escolar_nome, school.resumo, false)).join('')
  ).join('') || '<tr><td colspan="5"><div class="empty-state">Nenhuma DRE ou escola no escopo autorizado.</div></td></tr>';
}

async function carregarRelatorioSemanalAdmin(dataReferencia, options = {}) {
  try {
    const query = dataReferencia ? `?data=${encodeURIComponent(dataReferencia)}` : '';
    const payload = await adminApiFetch(`${ADMIN_ENDPOINTS.pontosRelatorioSemanal}${query}`, {
      signal: options.signal,
    });
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;
    const report = getApiData(payload);
    if (!validarRelatorioSemanal(report)) {
      throw new Error('Resposta inválida ao carregar a presença semanal. Tente novamente.');
    }
    RELATORIO_SEMANAL = report;
    RELATORIO_SEMANAL_DATA_ERROR = null;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (options.requestId && options.requestId !== ADMIN_DATA_REQUEST_ID) return false;
    RELATORIO_SEMANAL = null;
    RELATORIO_SEMANAL_DATA_ERROR = error;
    throw error;
  }
}

function dataIsoSemanalValida(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1000) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function adicionarDiasDataIsoSemanal(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resumoSemanalValido(summary, fields) {
  return Boolean(summary && typeof summary === 'object' && !Array.isArray(summary)
    && fields.every((field) =>
      Number.isSafeInteger(summary[field]) && summary[field] >= 0
    ));
}

function validarRelatorioSemanal(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)
    || !dataIsoSemanalValida(report.data_referencia)
    || !dataIsoSemanalValida(report.data_inicio)
    || !dataIsoSemanalValida(report.data_fim)
    || !dataIsoSemanalValida(report.data_atual)
    || report.data_fim !== adicionarDiasDataIsoSemanal(report.data_inicio, 6)
    || report.data_referencia < report.data_inicio
    || report.data_referencia > report.data_fim
    || !resumoSemanalValido(report.resumo, [
      'total_previstos',
      'total_presencas',
      'total_ausencias',
    ])
    || !Number.isSafeInteger(report.resumo.total_presencas + report.resumo.total_ausencias)
    || report.resumo.total_presencas + report.resumo.total_ausencias !== report.resumo.total_previstos
    || !Array.isArray(report.dias)
    || report.dias.length !== 7) {
    return false;
  }

  return report.dias.every((day, index) =>
    day && typeof day === 'object' && !Array.isArray(day)
    && day.data === adicionarDiasDataIsoSemanal(report.data_inicio, index)
    && typeof day.futuro === 'boolean'
    && resumoSemanalValido(day.resumo, [
      'total_funcionarios',
      'presentes',
      'ausentes',
    ])
    && Number.isSafeInteger(day.resumo.presentes + day.resumo.ausentes)
    && day.resumo.presentes + day.resumo.ausentes === day.resumo.total_funcionarios
    && day.futuro === (day.data > report.data_atual)
  );
}

function normalizarPercentualSemanal(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, 0), 100);
}

function formatarPercentualSemanal(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
}

function renderizarGraficoSemanalRelatorio() {
  const container = document.getElementById('chart-presenca-semanal');
  if (!container) return;

  if (RELATORIO_SEMANAL_DATA_ERROR) {
    const error = RELATORIO_SEMANAL_DATA_ERROR;
    container.innerHTML = criarEstadoErroDadosAdmin(
      'Não foi possível carregar a presença semanal', error.message,
      ![401, 403].includes(Number(error.status || 0))
    );
    return;
  }
  if (!RELATORIO_SEMANAL) {
    container.innerHTML = '<div class="empty-state reports-empty-state">Carregando presença semanal...</div>';
    return;
  }

  const report = RELATORIO_SEMANAL;
  if (!validarRelatorioSemanal(report)) {
    container.innerHTML = criarEstadoErroDadosAdmin(
      'Dados semanais indisponíveis',
      'A resposta da presença semanal está incompleta ou inválida. Tente carregar o relatório novamente.'
    );
    return;
  }
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const rows = report.dias.map((day, index) => {
    const summary = day.resumo;
    const dateLabel = `${day.data.slice(8, 10)}/${day.data.slice(5, 7)}`;
    const percentage = normalizarPercentualSemanal(summary.taxa_presenca_percent);
    const percentageLabel = day.futuro || !summary.total_funcionarios || percentage === null
      ? 'Percentual indisponível'
      : `Presença ${formatarPercentualSemanal(percentage)}%`;
    const detail = day.futuro ? 'Dia futuro' : summary.total_funcionarios === 0
      ? 'Nenhum vínculo vigente no escopo'
      : `${summary.presentes} presentes de ${summary.total_funcionarios}; ${summary.ausentes} sem ponto`;
    const label = `${labels[index]}, ${dateLabel}: ${detail}; ${percentageLabel}`;
    const valueLabel = day.futuro || !summary.total_funcionarios || percentage === null
      ? '—'
      : `${formatarPercentualSemanal(percentage)}%`;
    return `<div class="weekly-chart-day">
      <div class="chart-bar-item" role="img" aria-label="${escapeHtml(label)}">
        <span class="chart-bar-label">${labels[index]} ${dateLabel}</span>
        <div class="chart-bar-track" aria-hidden="true"><div class="chart-bar-fill blue" style="width:${percentage ?? 0}%"></div></div>
        <span class="chart-bar-val" aria-hidden="true">${valueLabel}</span>
      </div>
      <div class="reports-panel-meta weekly-chart-detail" aria-hidden="true">${escapeHtml(detail)}</div>
    </div>`;
  }).join('');
  container.innerHTML = `<p class="reports-panel-meta">${escapeHtml(formatarDataReferencia(report.data_inicio))} a ${escapeHtml(formatarDataReferencia(report.data_fim))}</p>
    ${rows}
    <p class="reports-panel-meta">Presença por pessoa e por dia. Dias futuros não contam como ausência; o dia atual mostra a situação até o momento da consulta.</p>`;
}

let RELATORIO_PERIODO = null;
let RELATORIO_PERIODO_ERRO = null;
let RELATORIO_PERIODO_CARREGANDO = false;
let relatorioPeriodoRequestId = 0;
let relatorioPeriodoController = null;

function filtrosRelatorioPeriodo() {
  return new URLSearchParams({
    periodo: document.getElementById('relatorio-periodo').value,
    data: document.getElementById('relatorio-referencia').value,
    ...(temCapacidade('relatorio.visualizar') && document.getElementById('relatorio-funcionario')?.value
      ? { funcionario_id: document.getElementById('relatorio-funcionario').value } : {}),
    ...(temCapacidade('relatorio.visualizar') && document.getElementById('relatorio-status')?.value
      ? { status: document.getElementById('relatorio-status').value } : {}),
  });
}

function atualizarExportacaoRelatorio() {
  const indisponivel = RELATORIO_PERIODO_CARREGANDO || Boolean(RELATORIO_PERIODO_ERRO) || !RELATORIO_PERIODO;
  document.querySelectorAll('#btn-gerar-pdf, #btn-imprimir').forEach(botao => { botao.disabled = indisponivel; });
}

function periodoRelatorioTexto(report) {
  const data = value => value.split('-').reverse().join('/');
  return report.data_inicio === report.data_fim ? data(report.data_inicio)
    : `${data(report.data_inicio)} a ${data(report.data_fim)}`;
}

function statusRelatorioTexto(item) {
  if (item.futuro) return 'Dia futuro';
  return item.ponto.status === 'COMPLETO' ? 'Completo' : item.ponto.status === 'AUSENTE' ? 'Ausente' : 'Em andamento';
}

function horariosRelatorio(item) {
  const registros = item.ponto.registros || [];
  const hora = tipo => {
    const registro = registros.find(ponto => ponto.tipo === tipo);
    if (!registro?.registrado_em) return '—';
    // O relatório já fornece data e hora civil de Brasília, sem offset.
    const horario = String(registro.registrado_em).match(/^\d{4}-\d{2}-\d{2} ([0-2]\d:[0-5]\d):[0-5]\d$/);
    return horario ? horario[1] : '—';
  };
  return ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'].map(hora);
}

async function carregarRelatorioPeriodoAdmin() {
  const requestId = ++relatorioPeriodoRequestId;
  relatorioPeriodoController?.abort();
  const controller = new AbortController();
  relatorioPeriodoController = controller;
  RELATORIO_PERIODO_CARREGANDO = true;
  RELATORIO_PERIODO_ERRO = null;
  RELATORIO_PERIODO = null;
  atualizarExportacaoRelatorio();
  renderizarRelatorio();
  const nominal = temCapacidade('relatorio.visualizar');
  const query = filtrosRelatorioPeriodo();
  try {
    if (!dataIsoSemanalValida(query.get('data'))) {
      throw new Error('Informe uma data de referência válida entre 01/01/1000 e 31/12/9999.');
    }
    const endpoint = nominal ? '/api/admin/pontos/relatorio/periodo' : '/api/admin/pontos/relatorio/hierarquia/periodo';
    const payload = await adminApiFetch(`${endpoint}?${query}`, { signal: controller.signal });
    if (requestId !== relatorioPeriodoRequestId) return;
    const report = getApiData(payload);
    if (!report || !Array.isArray(report.items) || !Array.isArray(report.diretorias)
      || !dataIsoSemanalValida(report.data_inicio) || !dataIsoSemanalValida(report.data_fim)
      || !resumoSemanalValido(report.resumo, ['total_previstos', 'total_presencas', 'total_ausencias'])) {
      throw new Error('Resposta de relatório incompleta. Atualize os dados para tentar novamente.');
    }
    report.filtros = Object.fromEntries(query);
    RELATORIO_PERIODO = report;
    const select = document.getElementById('relatorio-funcionario');
    if (nominal && select && !query.has('funcionario_id') && !query.has('status')) {
      const funcionarios = new Map(report.items.map(item => [item.ponto.funcionario.id, item.ponto.funcionario.nome]));
      select.innerHTML = '<option value="">Todos os funcionários</option>'
        + [...funcionarios].map(([id, nome]) => `<option value="${Number(id)}">${escapeHtml(nome)}</option>`).join('');
    }
  } catch (erro) {
    if (requestId !== relatorioPeriodoRequestId || erro?.name === 'AbortError') return;
    RELATORIO_PERIODO_ERRO = erro;
    if (erro.status === 401) redirecionarAdminParaGovbr();
  } finally {
    if (requestId === relatorioPeriodoRequestId) {
      RELATORIO_PERIODO_CARREGANDO = false;
      atualizarExportacaoRelatorio();
      renderizarRelatorio();
    }
  }
}

async function iniciarRelatoriosPeriodo() {
  const referencia = document.getElementById('relatorio-referencia');
  if (!referencia) return;
  referencia.value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  document.querySelectorAll('#relatorio-periodo, #relatorio-referencia, #relatorio-funcionario, #relatorio-status')
    .forEach(campo => campo.addEventListener('change', carregarRelatorioPeriodoAdmin));
  document.getElementById('relatorio-atualizar')?.addEventListener('click', carregarRelatorioPeriodoAdmin);
  document.getElementById('relatorio-hierarquico').hidden = temCapacidade('relatorio.visualizar');
  await carregarRelatorioPeriodoAdmin();
}

function renderizarRelatorio() {
  if (!document.querySelector('.reports-page')) return;
  const report = RELATORIO_PERIODO;
  const nominal = temCapacidade('relatorio.visualizar');
  const tbody = document.getElementById(nominal ? 'tbody-relatorio' : 'tbody-relatorio-hierarquico');
  const estado = document.getElementById('relatorio-estado');
  estado.textContent = RELATORIO_PERIODO_CARREGANDO ? 'Atualizando relatório. Exportação indisponível.'
    : RELATORIO_PERIODO_ERRO ? RELATORIO_PERIODO_ERRO.message : 'Consulta concluída. Indicadores por pessoa e dia; dias futuros fora dos totais previstos.';
  document.getElementById('relatorio-presentes').textContent = report?.resumo.total_presencas ?? '—';
  document.getElementById('relatorio-ausentes').textContent = report?.resumo.total_ausencias ?? '—';
  document.getElementById('relatorio-data').textContent = report ? periodoRelatorioTexto(report) : '—';
  document.getElementById('relatorio-gerado-por').textContent = ADMIN.nome;
  if (!report) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="${nominal ? 7 : 5}">${RELATORIO_PERIODO_CARREGANDO ? 'Carregando relatório...' : 'Relatório indisponível. Atualize os dados para tentar novamente.'}</td></tr>`;
    const chart = document.getElementById('chart-presenca-semanal');
    if (chart) chart.replaceChildren();
    return;
  }
  if (!nominal) {
    RELATORIO_HIERARQUICO = { ...report, data_referencia: periodoRelatorioTexto(report) };
    RELATORIO_HIERARQUICO_DATA_ERROR = null;
    renderizarRelatorioHierarquico();
    document.getElementById('hierarquia-data').textContent = periodoRelatorioTexto(report);
    return;
  }
  tbody.innerHTML = report.items.map(item => {
    const ponto = item.ponto;
    const status = statusRelatorioTexto(item);
    const classe = ponto.status === 'COMPLETO' ? 'badge-ok' : ponto.status === 'AUSENTE' ? 'badge-absent' : 'badge-info';
    return `<tr><td>${escapeHtml(item.data_referencia.split('-').reverse().join('/'))}</td>
      <td><strong>${escapeHtml(ponto.funcionario.nome)}</strong><div class="td-email">${escapeHtml(ponto.unidade_escolar_nome)} · Vínculo ${Number(ponto.vinculo_funcional_id)}</div></td>
      ${horariosRelatorio(item).map(hora => `<td class="td-mono">${escapeHtml(hora)}</td>`).join('')}
      <td><span class="badge ${item.futuro ? 'badge-info' : classe}">${status}</span></td></tr>`;
  }).join('') || '<tr><td colspan="7">Nenhum registro para os filtros selecionados.</td></tr>';
  const dates = new Map();
  for (let date = report.data_inicio; date <= report.data_fim; date = adicionarDiasDataIsoSemanal(date, 1)) dates.set(date, new Map());
  report.items.forEach(item => {
    const pessoas = dates.get(item.data_referencia);
    const id = item.ponto.funcionario.id;
    pessoas?.set(id, Boolean(pessoas.get(id)) || item.ponto.total_batidas > 0);
  });
  document.getElementById('chart-presenca-semanal').innerHTML = [...dates].map(([date, pessoas]) => {
    const presentes = [...pessoas.values()].filter(Boolean).length;
    const futuro = date > report.data_atual;
    return `<div class="weekly-chart-day"><strong>${escapeHtml(date.split('-').reverse().join('/'))}</strong>
      <span>${futuro ? 'Dia futuro' : `${presentes} presentes de ${pessoas.size}; ${pessoas.size - presentes} ausentes`}</span></div>`;
  }).join('');
}
