/* ============================================================
   RELATÓRIO
   ============================================================ */

function renderizarRelatorio() {
  const tbody  = document.getElementById('tbody-relatorio');
  const elData = document.getElementById('relatorio-data');
  const elPres = document.getElementById('relatorio-presentes');
  const elAus  = document.getElementById('relatorio-ausentes');
  const elGerado = document.getElementById('relatorio-gerado-por');

  if (elData)   elData.textContent   = formatarDataExtenso(new Date());
  if (elPres)   elPres.textContent   = PONTOS_HOJE.length;
  if (elAus)    elAus.textContent    = getFuncionariosSemPonto().length;
  if (elGerado) elGerado.textContent = ADMIN.nome;

  if (!tbody) return;

  tbody.innerHTML = FUNCIONARIOS.map(func => {
    const p = PONTOS_HOJE.find(x => x.funcionarioId === func.id);
    return `
      <tr>
        <td>
          <div class="td-user">
            <div class="td-avatar">${getIniciais(func.nome)}</div>
            <div>
              <div class="td-name">${func.nome}</div>
              <div class="td-email">${func.cargo}</div>
            </div>
          </div>
        </td>
        <td class="td-mono">${p ? p.entrada : '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${p && p.pausa   ? p.pausa   : '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${p && p.retorno ? p.retorno : '<span style="color:var(--text-300)">—</span>'}</td>
        <td class="td-mono">${p && p.saida   ? p.saida   : '<span style="color:var(--text-300)">—</span>'}</td>
        <td><span class="badge ${p ? (p.status==='completo'?'badge-ok':'badge-info') : 'badge-absent'}">${p ? (p.status==='completo'?'Completo':'Em andamento') : 'Ausente'}</span></td>
      </tr>
    `;
  }).join('');
}

