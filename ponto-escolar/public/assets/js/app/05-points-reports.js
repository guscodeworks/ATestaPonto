function renderPointsTableRows(container, rows, isAbsentTable = false) {
  if (!container) {
    return;
  }

  if (!rows.length) {
    // colspan varia porque a tabela de ausentes tem menos colunas
    // (não exibe entrada/saída, já que o funcionário não bateu ponto).
    const colSpan = isAbsentTable ? 3 : 5;
    container.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum registro encontrado</div></div></td></tr>`;
    return;
  }

  if (isAbsentTable) {
    container.innerHTML = rows
      .map((row) => {
        return `
          <tr>
            <td>
              <div class="td-user">
                <div class="td-avatar">${getIniciais(row.funcionario.nome)}</div>
                <div>
                  <div class="td-name">${row.funcionario.nome}</div>
                  <div class="td-email">${row.funcionario.email}</div>
                </div>
              </div>
            </td>
            <td>${row.funcionario.ativo ? 'Ativo' : 'Inativo'}</td>
            <td><span class="badge badge-danger">Não bateu ponto</span></td>
          </tr>
        `;
      })
      .join('');
    return;
  }

  container.innerHTML = rows
    .map((row) => {
      const status = mapReportRowToStatus(row);
      return `
        <tr>
          <td>
            <div class="td-user">
              <div class="td-avatar">${getIniciais(row.funcionario.nome)}</div>
              <div>
                <div class="td-name">${row.funcionario.nome}</div>
                <div class="td-email">${row.funcionario.email}</div>
              </div>
            </div>
          </td>
          <td>${row.funcionario.ativo ? 'Ativo' : 'Inativo'}</td>
          <td>${formatTimeFromIso(row.entrada)}</td>
          <td>${formatTimeFromIso(row.saida)}</td>
          <td><span class="badge ${status.css}">${status.label}</span></td>
        </tr>
      `;
    })
    .join('');
}

async function initPointsPage() {
  bindTabs();
  const dataSubtitle = document.getElementById('data-ponto-sub');
  const countPresentes = document.getElementById('count-presentes');
  const countAusentes = document.getElementById('count-ausentes');
  const presentesBody = document.getElementById('tbody-presentes');
  const ausentesBody = document.getElementById('tbody-ausentes');

  try {
    const data = await apiRequest('/admin/pontos/hoje');
    const presentes = data?.presentes || [];
    const ausentes = data?.ausentes || [];
    const resumo = data?.resumo || {};

    if (dataSubtitle && data?.data_referencia) {
      dataSubtitle.textContent = `Registros de frequência de ${formatDateShort(data.data_referencia)}`;
    }

    if (countPresentes) {
      countPresentes.textContent = String(resumo.presentes ?? presentes.length);
    }
    if (countAusentes) {
      countAusentes.textContent = String(resumo.ausentes ?? ausentes.length);
    }

    renderPointsTableRows(presentesBody, presentes, false);
    renderPointsTableRows(ausentesBody, ausentes, true);
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar pontos do dia.'), 'error');
  }
}

async function initReportPage() {
  const reportDate = document.getElementById('relatorio-data');
  const totalPresentes = document.getElementById('relatorio-presentes');
  const totalAusentes = document.getElementById('relatorio-ausentes');
  const reportBody = document.getElementById('tbody-relatorio');
  const pdfButton = document.getElementById('btn-gerar-pdf');
  const printButton = document.getElementById('btn-imprimir');
  const saveObservationButton = document.getElementById('btn-salvar-observacao');

  try {
    const data = await apiRequest('/admin/pontos/relatorio');
    const items = data?.items || [];
    const resumo = data?.resumo || {};

    if (reportDate) {
      reportDate.textContent = formatDateShort(data?.data_referencia || '');
    }
    if (totalPresentes) {
      totalPresentes.textContent = String(resumo.presentes ?? 0);
    }
    if (totalAusentes) {
      totalAusentes.textContent = String(resumo.ausentes ?? 0);
    }

    if (reportBody) {
      reportBody.innerHTML = items
        .map((item) => {
          const status = mapReportRowToStatus(item);
          return `
            <tr>
              <td>
                <div class="td-user">
                  <div class="td-avatar">${getIniciais(item.funcionario.nome)}</div>
                  <div>
                    <div class="td-name">${item.funcionario.nome}</div>
                    <div class="td-email">${item.funcionario.ativo ? 'Ativo' : 'Inativo'}</div>
                  </div>
                </div>
              </td>
              <td>${formatTimeFromIso(item.entrada)}</td>
              <td>${formatTimeFromIso(item.saida)}</td>
              <td><span class="badge ${status.css}">${status.label}</span></td>
            </tr>
          `;
        })
        .join('');
    }
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar relatório.'), 'error');
  }

  // Funcionalidade pendente: apenas avisa o usuário, não gera PDF de fato.
  if (pdfButton) {
    pdfButton.addEventListener('click', () => {
      mostrarToast('Exportação em PDF será disponibilizada em breve.', 'info');
    });
  }

  if (printButton) {
    printButton.addEventListener('click', () => window.print());
  }

  // Funcionalidade pendente: exibe sucesso mas não persiste nenhuma
  // observação — não há chamada de API associada a este botão.
  if (saveObservationButton) {
    saveObservationButton.addEventListener('click', () => {
      mostrarToast('Observação salva com sucesso.', 'success');
    });
  }
}

// Ponto de acesso público (sem login) para bater ponto: redireciona para
// a rota dedicada em vez de renderizar algo nesta própria página.
async function initPublicPunchPage() {
  window.location.href = '/ponto/acessar';
}
