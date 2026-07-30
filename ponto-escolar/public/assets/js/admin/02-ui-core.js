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
  // Atualiza tanto os elementos da topbar quanto os da sidebar,
  // pois o perfil do admin é exibido em dois lugares da tela.
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

  const atualizarEstado = (aberta) => {
    sidebar.classList.toggle('open', aberta);
    overlay.classList.toggle('active', aberta);
    toggleBtn.setAttribute('aria-expanded', String(aberta));
    toggleBtn.setAttribute('aria-label', aberta ? 'Fechar menu de navegacao' : 'Abrir menu de navegacao');
  };

  toggleBtn.addEventListener('click', () => atualizarEstado(!sidebar.classList.contains('open')));
  overlay.addEventListener('click', () => {
    atualizarEstado(false);
  });
}

/* ============================================================
   TABS
   ============================================================ */

function iniciarTabs() {
  // Suporta duas convenções de classe ('.tab-btn' e '.ui-tab') para
  // cobrir diferentes trechos de HTML que já existem na página.
  const tabBtns = document.querySelectorAll('.tab-btn[data-tab], .ui-tab[data-tab]');
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
  const icons = {
    success: '/assets/icons/circle-check.svg',
    error: '/assets/icons/circle-x.svg',
    info: '/assets/icons/info.svg',
    warning: '/assets/icons/triangle-alert.svg',
  };
  // Aceita os dois IDs de container possíveis, por compatibilidade com
  // diferentes versões do HTML da página.
  const stack = document.getElementById('toast-stack') || document.getElementById('toast-container');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  const icon = icons[tipo] || icons.info;
  const iconWrap = document.createElement('span');
  iconWrap.className = 'toast-icon';
  const iconImage = document.createElement('img');
  iconImage.src = icon;
  iconImage.alt = '';
  iconImage.setAttribute('aria-hidden', 'true');
  iconWrap.appendChild(iconImage);
  const message = document.createElement('span');
  message.className = 'toast-msg';
  message.textContent = String(msg || '');
  el.append(iconWrap, message);
  stack.appendChild(el);
  // Some com fade + deslocamento antes de remover do DOM, para não cortar
  // a animação de saída do toast.
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='all 0.3s ease'; setTimeout(()=>el.remove(),300); }, 3500);
}

// Alias para compatibilidade com código antigo
function mostrarToast(msg, tipo) { toast(msg, tipo); }

/* ============================================================
   DASHBOARD — STATS
   ============================================================ */

function renderizarStats() {
  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  if (ADMIN_DATA_ERROR) {
    ['stat-total','stat-ativos','stat-presentes','stat-ausentes','stat-taxa','stat-registros','hero-presentes','hero-ausentes','hero-total']
      .forEach((id) => set(id, '—'));
    return;
  }

  // Prioriza os valores já calculados pela API (RESUMO_PONTOS) e só
  // recalcula localmente como fallback, caso o resumo não tenha vindo.
  const ativos = RESUMO_PONTOS.total_ativos || FUNCIONARIOS.filter(f => f.status === 'ativo').length;
  const total = RESUMO_PONTOS.total_funcionarios || FUNCIONARIOS.length;
  const presentes = RESUMO_PONTOS.presentes || PONTOS_HOJE.length;
  const ausentes = RESUMO_PONTOS.ausentes || getFuncionariosSemPonto().length;
  const taxa = RESUMO_PONTOS.taxa_presenca_percent || (ativos > 0 ? Math.round((presentes/ativos)*100) : 0);

  set('stat-total',     total);
  set('stat-ativos',    ativos);
  set('stat-presentes', presentes);
  set('stat-ausentes',  ausentes);
  set('stat-taxa',      ativos > 0 ? taxa+'%' : '—');
  set('stat-registros', PONTOS_HOJE.length);

  // Dashboard hero
  set('hero-presentes', presentes);
  set('hero-ausentes',  ausentes);
  set('hero-total',     total);
}
