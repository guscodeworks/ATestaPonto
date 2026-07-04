// Dados do usuário
const nome = sessionStorage.getItem('func_nome') || 'Isaque Oliveira';
const cargo = sessionStorage.getItem('func_cargo') || 'Técnico de Suporte';
const matricula = sessionStorage.getItem('func_matricula') || 'MAT-20241';
const iniciais = nome
  .split(' ')
  .map(n => n[0])
  .slice(0, 2)
  .join('')
  .toUpperCase();

document.getElementById('sb-avatar').textContent = iniciais;
document.getElementById('sb-name').textContent = nome;
document.getElementById('sb-role').textContent = cargo;
document.getElementById('tp-avatar').textContent = iniciais;
document.getElementById('tp-name').textContent = nome.split(' ')[0];
document.getElementById('profile-avatar').textContent = iniciais;
document.getElementById('profile-name').textContent = nome;
document.getElementById('profile-cargo').textContent = cargo;
document.getElementById('pf-nome').textContent = nome;
document.getElementById('pf-cargo').textContent = cargo;

// Relógio
function tick() {
  const now = new Date();

  document.getElementById('topbar-time').textContent =
    now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

  document.getElementById('topbar-date').textContent =
    now.toLocaleDateString('pt-BR');
}

setInterval(tick, 1000);
tick();

// Mostrar/Ocultar senha
document.querySelectorAll('.toggle-pw').forEach(btn => {

  btn.addEventListener('click', function () {

    const target = document.getElementById(this.dataset.target);

    if (!target) return;

    const oculta = target.type === 'password';

    target.type = oculta ? 'text' : 'password';

    this.textContent = oculta ? '🙈' : '👁';

  });

});

// Força da senha
const pwNova = document.getElementById('pw-nova');
const strengthWrap = document.getElementById('pw-strength');
const strengthText = document.getElementById('pw-strength-text');
const bars = document.querySelectorAll('.pw-bar');

pwNova.addEventListener('input', function () {

  const valor = this.value;

  if (!valor) {
    strengthWrap.style.display = 'none';
    return;
  }

  strengthWrap.style.display = 'block';

  let score = 0;

  if (valor.length >= 8) score++;
  if (/[A-Z]/.test(valor)) score++;
  if (/[0-9]/.test(valor)) score++;
  if (/[^A-Za-z0-9]/.test(valor)) score++;

  const colors = [
    'var(--red-500)',
    'var(--amber-500)',
    'var(--amber-500)',
    'var(--green-500)',
    'var(--green-500)'
  ];

  const labels = [
    '',
    'Fraca',
    'Razoável',
    'Boa',
    'Forte'
  ];

  bars.forEach((bar, i) => {

    bar.style.background =
      i < score
        ? colors[score]
        : 'var(--border-light)';

  });

  strengthText.textContent = labels[score] || '';

  strengthText.style.color =
    colors[score] || 'var(--text-300)';

});

// Alterar senha
function alterarSenha() {

  const atual = document.getElementById('pw-atual').value;
  const nova = document.getElementById('pw-nova').value;
  const confirm = document.getElementById('pw-confirm').value;

  const erro = document.getElementById('pw-match-error');

  erro.style.display = 'none';

  document
    .getElementById('pw-confirm')
    .classList.remove('has-error');

  if (!atual || !nova) {

    toast('Preencha todos os campos', 'warning');
    return;

  }

  if (nova.length < 8) {

    toast(
      'A nova senha deve ter ao menos 8 caracteres',
      'warning'
    );

    return;

  }

  if (nova !== confirm) {

    erro.style.display = 'block';

    document
      .getElementById('pw-confirm')
      .classList.add('has-error');

    return;

  }

  toast('Senha alterada com sucesso!', 'success');

  limparForm();

}

function limparForm() {

  ['pw-atual', 'pw-nova', 'pw-confirm'].forEach(id => {

    document.getElementById(id).value = '';

    document.getElementById(id).type = 'password';

  });

  document
    .querySelectorAll('.toggle-pw')
    .forEach(btn => btn.textContent = '👁');

  document.getElementById('pw-strength').style.display = 'none';

  document.getElementById('pw-match-error').style.display = 'none';

}

// Sidebar
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');

document
  .getElementById('menu-toggle')
  .addEventListener('click', () => {

    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');

  });

overlay.addEventListener('click', () => {

  sidebar.classList.remove('open');
  overlay.classList.remove('active');

});

// Toast
function toast(msg, tipo = 'info') {

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  const el = document.createElement('div');

  el.className = `toast toast-${tipo}`;

  el.innerHTML = `
    <span class="toast-icon">${icons[tipo]}</span>
    <span class="toast-msg">${msg}</span>
  `;

  document
    .getElementById('toast-stack')
    .appendChild(el);

  setTimeout(() => el.remove(), 3200);

}

// Logout
function sair() {

  sessionStorage.clear();

  window.location.href = '/login';

}

// Responsividade
function checkCols() {

  const grid = document.querySelector('.profile-cols');

  if (!grid) return;

  grid.style.gridTemplateColumns =
    window.innerWidth <= 768
      ? '1fr'
      : '1fr 1fr';

}

window.addEventListener('resize', checkCols);

checkCols();