/* ============================================================
   RELÓGIO
   ============================================================ */

function iniciarRelogio() {
  const elHora = document.getElementById('topbar-time');
  const elData = document.getElementById('topbar-date');
  if (!elHora) return;
  function atualizar() {
    const now = new Date();
    elHora.textContent = formatarHora(now);
    elData.textContent = formatarData(now);
  }
  atualizar();
  setInterval(atualizar, 1000);
}

/* ============================================================
   PERFIL DO ADMIN
   ============================================================ */

function renderizarPerfil() {
  const els = {
    avatar:  document.getElementById('admin-avatar'),
    nome:    document.getElementById('admin-firstname'),
    cargo:   document.getElementById('admin-role'),
    sbAvatar: document.getElementById('sb-avatar'),
    sbNome:  document.getElementById('sb-name'),
    sbCargo: document.getElementById('sb-role'),
  };
  if (els.avatar)   els.avatar.textContent   = getIniciais(ADMIN.nome);
  if (els.nome)     els.nome.textContent     = getPrimeiroNome(ADMIN.nome);
  if (els.cargo)    els.cargo.textContent    = ADMIN.cargo;
  if (els.sbAvatar) els.sbAvatar.textContent = getIniciais(ADMIN.nome);
  if (els.sbNome)   els.sbNome.textContent   = ADMIN.nome;
  if (els.sbCargo)  els.sbCargo.textContent  = ADMIN.cargo;
}

/* ============================================================
   SIDEBAR
   ============================================================ */

function iniciarSidebar() {
  const toggleBtn = document.getElementById('menu-toggle');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });
}

/* ============================================================
   TABS
   ============================================================ */

function iniciarTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
  if (!tabBtns.length) return;
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const alvo = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === alvo);
      });
    });
  });
}

/* ============================================================
   TOAST
   ============================================================ */

function toast(msg, tipo = 'success') {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const stack = document.getElementById('toast-stack') || document.getElementById('toast-container');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `<span class="toast-icon">${icons[tipo]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='all 0.3s ease'; setTimeout(()=>el.remove(),300); }, 3500);
}

// Alias para compatibilidade com código antigo
function mostrarToast(msg, tipo) { toast(msg, tipo); }

/* ============================================================
   DASHBOARD — STATS
   ============================================================ */

function renderizarStats() {
  const ativos = FUNCIONARIOS.filter(f => f.status === 'ativo').length;
  const presentes = PONTOS_HOJE.length;
  const ausentes = getFuncionariosSemPonto().length;

  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };

  set('stat-total',     FUNCIONARIOS.length);
  set('stat-ativos',    ativos);
  set('stat-presentes', presentes);
  set('stat-ausentes',  ausentes);
  set('stat-taxa',      ativos > 0 ? Math.round((presentes/ativos)*100)+'%' : '—');
  set('stat-registros', PONTOS_HOJE.length);

  // Dashboard hero
  set('hero-presentes', presentes);
  set('hero-ausentes',  ausentes);
  set('hero-total',     FUNCIONARIOS.length);
}

