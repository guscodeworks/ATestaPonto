/* ============================================================
   RELATORIO
   ============================================================ */

function validarAcessoPaginaRelatorios() {
  const pagina = document.querySelector('.reports-page');
  if (!pagina) return true;
  if (temCapacidade('relatorio.hierarquico.visualizar')) {
    if (!temCapacidade('relatorio.visualizar')) {
      pagina.querySelectorAll('#relatorio-nominal, .reports-export-actions, .reports-filter-panel')
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

function renderizarRelatorio() {
  renderizarRelatorioHierarquico();
  const tbody = document.getElementById('tbody-relatorio');
  const elData = document.getElementById('relatorio-data');
  const elPres = document.getElementById('relatorio-presentes');
  const elAus = document.getElementById('relatorio-ausentes');
  const elGerado = document.getElementById('relatorio-gerado-por');
  const detalhado = temCapacidade('relatorio.visualizar');
  const resumo = detalhado ? RESUMO_RELATORIO : RESUMO_PONTOS;
  const error = detalhado ? RELATORIO_DATA_ERROR || FUNCIONARIOS_DATA_ERROR : RESUMO_DATA_ERROR;
  // A listagem de funcionários pode ter escopo maior que o relatório nominal.
  // Somente o endpoint do relatório define as pessoas que podem aparecer aqui.
  const itens = RELATORIO_PONTOS;

  if (elData) elData.textContent = error
    ? '—'
    : formatarDataReferencia(DATA_REFERENCIA_RELATORIO || DATA_REFERENCIA_PONTOS);
  if (elPres) elPres.textContent = error ? '—' : resumo?.presentes ?? 0;
  if (elAus) elAus.textContent = error ? '—' : resumo?.ausentes ?? 0;
  if (elGerado) elGerado.textContent = ADMIN.nome;

  renderizarGraficoSemanalRelatorio();

  if (!tbody || !detalhado) return;

  if (error) {
    const state = criarEstadoErroDadosAdmin(
      'Não foi possível carregar o relatório',
      error.message,
      ![401, 403].includes(Number(error.status || 0))
    );
    tbody.innerHTML = `<tr><td colspan="6">${state}</td></tr>`;
    return;
  }

  if (!itens.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><img src="/icons/clipboard-list.svg" alt="" aria-hidden="true"></div><div class="empty-title">Nenhum funcionario encontrado</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = itens.map(item => {
    const func = getFuncionarioPorId(item.funcionarioId) || item.funcionario;
    const statusLabel = item.status === 'completo'
      ? 'Completo'
      : item.status === 'ausente'
        ? 'Ausente'
        : 'Em andamento';
    const statusClass = item.status === 'completo'
      ? 'badge-ok'
      : item.status === 'ausente'
        ? 'badge-absent'
        : 'badge-info';

    return `
      <tr>
        <td>
          <div class="td-user">
            <div class="td-avatar">${getIniciais(func.nome)}</div>
            <div>
              <div class="td-name">${escapeHtml(func.nome)}</div>
              <div class="td-email">${escapeHtml(func.cargo)}</div>
            </div>
          </div>
        </td>
        <td class="td-mono">${item.entrada || '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${item.pausa || '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${item.retorno || '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${item.saida || '<span style="color:var(--text-300)">—</span>'}</td>
        <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      </tr>
    `;
  }).join('');
}
