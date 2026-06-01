function renderDashboardSummary(summary) {
  const statTotal = document.getElementById('stat-total');
  const statPresentes = document.getElementById('stat-presentes');
  const statAusentes = document.getElementById('stat-ausentes');
  const statTaxa = document.getElementById('stat-taxa');

  if (statTotal) {
    statTotal.textContent = String(summary.total_ativos ?? summary.total_funcionarios ?? 0);
  }
  if (statPresentes) {
    statPresentes.textContent = String(summary.presentes ?? 0);
  }
  if (statAusentes) {
    statAusentes.textContent = String(summary.ausentes ?? 0);
  }
  if (statTaxa) {
    statTaxa.textContent = `${summary.taxa_presenca_percent ?? 0}%`;
  }
}

async function initDashboardPage() {
  try {
    const data = await apiRequest('/admin/pontos/resumo');
    renderDashboardSummary(data.resumo || {});
  } catch (error) {
    mostrarToast(sanitizeMessage(error.message, 'Falha ao carregar dashboard.'), 'error');
  }
}

