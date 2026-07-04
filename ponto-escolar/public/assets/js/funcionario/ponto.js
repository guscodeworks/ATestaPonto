const funcionarioToken = sessionStorage.getItem('funcionario_token');
const funcionarioData = JSON.parse(sessionStorage.getItem('funcionario_data') || 'null');

if (!funcionarioToken || !funcionarioData) {
  window.location.href = '/login';
}

const nome = funcionarioData?.nome || sessionStorage.getItem('func_nome') || 'Funcionário';
const cargo = funcionarioData?.cargo || sessionStorage.getItem('func_cargo') || 'Funcionário';
const iniciais = nome.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'FN';

document.getElementById('sb-avatar').textContent = iniciais;
document.getElementById('sb-name').textContent = nome;
document.getElementById('sb-role').textContent = cargo;
document.getElementById('tp-avatar').textContent = iniciais;
document.getElementById('tp-name').textContent = nome.split(' ')[0] || 'Funcionário';
document.getElementById('hero-name').textContent = nome;
document.getElementById('hero-cargo').textContent = cargo;

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${funcionarioToken}`,
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload?.error?.message || 'Falha ao comunicar com o servidor.');
  }
  return payload.data;
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este aparelho não permite capturar localização.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => reject(new Error('Para bater ponto, permita o acesso à localização.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

const DIAS_SEMANA = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function atualizarRelogio() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const time = `${hh}:${mm}:${ss}`;

  document.getElementById('hero-clock').textContent = time;
  document.getElementById('topbar-time').textContent = time;
  document.getElementById('hero-weekday').textContent = DIAS_SEMANA[now.getDay()];
  document.getElementById('hero-date').textContent = `${String(now.getDate()).padStart(2,'0')} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
  document.getElementById('topbar-date').textContent = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
  document.getElementById('timeline-date').textContent = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;

  const h = now.getHours();
  document.getElementById('greeting').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ',';
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

const SEQUENCIA = [
  { label: 'Registrar\nEntrada', icon: 'ENT', classe: 'entrada', statusTxt: 'Entrada registrada', dotClass: 'active', tlLabel: 'Entrada', tlIcon: 'entrada', tipoApi: 'ENTRADA' },
  { label: 'Registrar\nPausa', icon: 'ALM', classe: 'pausa', statusTxt: 'Em pausa', dotClass: 'paused', tlLabel: 'Pausa', tlIcon: 'pausa', tipoApi: 'SAIDA_ALMOCO' },
  { label: 'Registrar\nRetorno', icon: 'RET', classe: 'retorno', statusTxt: 'De volta ao trabalho', dotClass: 'active', tlLabel: 'Retorno', tlIcon: 'retorno', tipoApi: 'VOLTA_ALMOCO' },
  { label: 'Registrar\nSaída', icon: 'SAI', classe: 'saida', statusTxt: 'Expediente encerrado', dotClass: 'closed', tlLabel: 'Saída', tlIcon: 'saida', tipoApi: 'SAIDA' }
];

const storageKey = `ponto_registros_${new Date().toISOString().slice(0, 10)}`;
let registros = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
let etapa = registros.length;
let registrando = false;

function renderEstado() {
  const btn = document.getElementById('btn-ponto');
  const btnIcon = document.getElementById('btn-icon');
  const btnLabel = document.getElementById('btn-label');

  if (etapa >= SEQUENCIA.length) {
    btn.className = 'ponto-btn saida';
    btn.disabled = true;
    btn.style.opacity = '0.45';
    btn.style.cursor = 'not-allowed';
    btnIcon.textContent = 'OK';
    btnLabel.textContent = 'Expediente\nEncerrado';
    document.getElementById('status-dot').className = 'ponto-status-dot closed';
    document.getElementById('status-text').textContent = 'Expediente encerrado';
  } else {
    const s = SEQUENCIA[etapa];
    btn.className = `ponto-btn ${s.classe}`;
    btn.disabled = registrando;
    btn.style.opacity = registrando ? '0.7' : '';
    btn.style.cursor = registrando ? 'wait' : '';
    btnIcon.textContent = registrando ? '...' : s.icon;
    btnLabel.innerHTML = (registrando ? 'Registrando\nPonto' : s.label).replace('\n','<br/>');
    document.getElementById('status-dot').className = `ponto-status-dot ${s.dotClass}`;
    document.getElementById('status-text').textContent = etapa === 0 ? 'Aguardando registro de entrada' : SEQUENCIA[etapa - 1].statusTxt;
  }

  renderTimeline();
}

function renderTimeline() {
  const tl = document.getElementById('timeline');
  document.getElementById('timeline-count').textContent = registros.length + ' registro(s)';

  if (registros.length === 0) {
    tl.innerHTML = '<div style="padding:32px 0;text-align:center;color:var(--text-300);font-size:14px;">Nenhum registro neste dia</div>';
    document.getElementById('last-action').textContent = 'Nenhum registro hoje';
    return;
  }

  tl.innerHTML = registros.map(r => `
    <div class="ponto-timeline-item">
      <div class="ponto-tl-marker ${r.tipo}">${r.emoji}</div>
      <div class="ponto-tl-info">
        <div class="ponto-tl-label">${r.label}</div>
        <div class="ponto-tl-sub">${r.data}</div>
      </div>
      <div class="ponto-tl-time">${r.hora}</div>
    </div>
  `).join('');

  const ult = registros[registros.length - 1];
  document.getElementById('last-action').innerHTML = `Último registro: <strong>${ult.label}</strong> às ${ult.hora}`;
}

function registroFromResponse(ponto) {
  const tipoMap = {
    ENTRADA: { tipo: 'entrada', label: 'Entrada', emoji: 'ENT' },
    SAIDA_ALMOCO: { tipo: 'pausa', label: 'Pausa', emoji: 'ALM' },
    VOLTA_ALMOCO: { tipo: 'retorno', label: 'Retorno', emoji: 'RET' },
    SAIDA: { tipo: 'saida', label: 'Saída', emoji: 'SAI' }
  };
  const meta = tipoMap[ponto.tipo] || tipoMap.ENTRADA;
  const dataRegistro = ponto.registrado_em ? new Date(String(ponto.registrado_em).replace(' ', 'T')) : new Date();

  return {
    ...meta,
    hora: dataRegistro.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
    data: dataRegistro.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })
  };
}

async function baterPonto() {
  if (etapa >= SEQUENCIA.length || registrando) return;

  if (!navigator.onLine) {
    toast('Sem internet. Verifique sua conexão e tente novamente.', 'error');
    return;
  }

  registrando = true;
  renderEstado();

  try {
    const location = await getCurrentLocation();
    const data = await apiRequest('/pontos/registrar', {
      method: 'POST',
      body: {
        ...location
      }
    });

    const registro = registroFromResponse(data.ponto || {});
    registros.push(registro);
    etapa = registros.length;
    sessionStorage.setItem(storageKey, JSON.stringify(registros));

    document.getElementById('confirm-title').textContent = `${registro.label} Registrada!`;
    document.getElementById('confirm-time').textContent = registro.hora;
    document.getElementById('confirm-sub').textContent = `${registro.label} registrada com sucesso`;
    document.getElementById('confirm-icon').textContent = registro.emoji;
    document.getElementById('confirm-modal').classList.add('show');
  } catch (error) {
    const message = error.message || 'Falha ao registrar ponto.';
    toast(message, 'error');
    if (/sessao|token/i.test(message)) {
      setTimeout(sair, 1600);
    }
  } finally {
    registrando = false;
    renderEstado();
  }
}

function fecharConfirm() {
  document.getElementById('confirm-modal').classList.remove('show');
}

renderEstado();

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
  el.innerHTML = `<span class="toast-icon">${icons[tipo] || icons.info}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-stack').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function sair() {
  sessionStorage.removeItem('funcionario_token');
  sessionStorage.removeItem('funcionario_data');
  sessionStorage.removeItem('func_nome');
  sessionStorage.removeItem('func_cpf');
  window.location.href = '/login';
}