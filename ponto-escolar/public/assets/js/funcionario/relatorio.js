// Dados do usuário
const nome = sessionStorage.getItem('func_nome') || 'Isaque Oliveira';
const cargo = sessionStorage.getItem('func_cargo') || 'Técnico de Suporte';
const iniciais = nome.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
document.getElementById('sb-avatar').textContent = iniciais;
document.getElementById('sb-name').textContent = nome;
document.getElementById('sb-role').textContent = cargo;
document.getElementById('tp-avatar').textContent = iniciais;
document.getElementById('tp-name').textContent = nome.split(' ')[0];

// Relógio
function tick() {
  const now = new Date();
  document.getElementById('topbar-time').textContent = now.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
  document.getElementById('topbar-date').textContent = now.toLocaleDateString('pt-BR');
}
setInterval(tick, 1000); tick();

// Dados locais para visualização
const dadosMaio = [
  { dia:'01/05', ds:'Qui', ent:'08:01', pau:'12:00', ret:'13:00', sai:'17:05', total:'8h04', status:'ok' },
  { dia:'02/05', ds:'Sex', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
  { dia:'05/05', ds:'Seg', ent:'08:15', pau:'12:05', ret:'13:05', sai:'17:00', total:'7h45', status:'late' },
  { dia:'06/05', ds:'Ter', ent:'08:00', pau:'12:00', ret:'13:00', sai:'18:30', total:'9h30', status:'extra' },
  { dia:'07/05', ds:'Qua', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
  { dia:'08/05', ds:'Qui', ent:'08:02', pau:'12:00', ret:'13:00', sai:'17:00', total:'7h58', status:'ok' },
  { dia:'09/05', ds:'Sex', ent:'07:55', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h05', status:'ok' },
  { dia:'12/05', ds:'Seg', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
  { dia:'13/05', ds:'Ter', ent:'08:00', pau:'11:55', ret:'13:00', sai:'17:00', total:'8h05', status:'ok' },
  { dia:'14/05', ds:'Qua', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
  { dia:'15/05', ds:'Qui', ent:'—',     pau:'—',     ret:'—',     sai:'—',     total:'0h00', status:'absent' },
  { dia:'16/05', ds:'Sex', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
  { dia:'19/05', ds:'Seg', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
  { dia:'20/05', ds:'Ter', ent:'08:00', pau:'12:00', ret:'13:00', sai:'19:00', total:'10h00', status:'extra' },
  { dia:'21/05', ds:'Qua', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
  { dia:'22/05', ds:'Qui', ent:'08:00', pau:'12:00', ret:'13:00', sai:'17:00', total:'8h00', status:'ok' },
];

const statusMap = {
  ok:     { label:'Normal',     classe:'badge-ok' },
  late:   { label:'Atraso',     classe:'badge-late' },
  extra:  { label:'Hora extra', classe:'badge-extra' },
  absent: { label:'Falta',      classe:'badge-absent' },
};

function renderTabela(dados) {
  const tbody = document.getElementById('tbody-pontos');
  const cardList = document.getElementById('report-card-list');

  tbody.innerHTML = dados.map(r => {
    const s = statusMap[r.status];
    return `
      <tr>
        <td class="td-date">${r.dia} <span style="font-size:11px;color:var(--text-300);font-weight:400;">${r.ds}</span></td>
        <td class="td-time">${r.ent}</td>
        <td class="td-time">${r.pau}</td>
        <td class="td-time">${r.ret}</td>
        <td class="td-time">${r.sai}</td>
        <td style="font-family:var(--font-mono);font-weight:600;color:var(--blue-700);">${r.total}</td>
        <td><span class="badge ${s.classe}">${s.label}</span></td>
      </tr>
    `;
  }).join('');

  cardList.innerHTML = dados.map(r => {
    const s = statusMap[r.status];
    const timeOrDash = v => v === '—' ? `<span class="rc-time-val empty">—</span>` : `<span class="rc-time-val">${v}</span>`;
    return `
      <div class="report-card-item">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div class="rc-date">${r.dia} — ${r.ds}</div>
          <span class="badge ${s.classe}">${s.label}</span>
        </div>
        <div class="rc-times">
          <div class="rc-time-item"><div class="rc-time-label">Entrada</div>${timeOrDash(r.ent)}</div>
          <div class="rc-time-item"><div class="rc-time-label">Pausa</div>${timeOrDash(r.pau)}</div>
          <div class="rc-time-item"><div class="rc-time-label">Retorno</div>${timeOrDash(r.ret)}</div>
          <div class="rc-time-item"><div class="rc-time-label">Saída</div>${timeOrDash(r.sai)}</div>
        </div>
        <div class="rc-footer">
          <span style="font-size:13px;color:var(--text-500);">Total do dia</span>
          <span class="rc-total">${r.total}</span>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('total-registros').textContent = dados.length + ' dias';
}

// Mostrar cards em mobile
function checkMobile() {
  const isMobile = window.innerWidth <= 768;
  document.querySelector('.report-table-wrap').style.display = isMobile ? 'none' : 'block';
  document.getElementById('report-card-list').style.display = isMobile ? 'flex' : 'none';
}
window.addEventListener('resize', checkMobile);
checkMobile();

document.getElementById('filtro-status').addEventListener('change', function () {
  const filtro = this.value;
  const filtrado = filtro ? dadosMaio.filter(r => r.status === filtro) : dadosMaio;
  renderTabela(filtrado);
});

renderTabela(dadosMaio);

// Sidebar
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
document.getElementById('menu-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
});
overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
});

function toast(msg, tipo='info') {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `<span class="toast-icon">${icons[tipo]}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-stack').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function exportarRelatorio() {
  toast('Relatório exportado com sucesso.', 'success');
}

function sair() {
  sessionStorage.clear();
  window.location.href = '/login';
}