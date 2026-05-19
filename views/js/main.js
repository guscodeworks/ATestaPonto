/**
 * ============================================================
 * SISTEMA DE PONTO — SALA DO FUTURO
 * main.js — Lógica principal do front-end
 * ============================================================
 */

'use strict';

/* ============================================================
   CONFIGURAÇÕES GLOBAIS
   ============================================================ */

// Dados do admin logado (simulado — virá do back-end futuramente)
const ADMIN = {
  nome: 'Carlos Eduardo',
  cargo: 'Administrador',
};

// Funcionários de exemplo (simulado — virá do banco de dados)
const FUNCIONARIOS = [
  { id: 1, nome: 'Ana Beatriz Souza',    cargo: 'Professora',      email: 'ana@escola.edu.br',     cpf: '111.222.333-44' },
  { id: 2, nome: 'Bruno Lima',           cargo: 'Coordenador',     email: 'bruno@escola.edu.br',   cpf: '222.333.444-55' },
  { id: 3, nome: 'Carla Ferreira',       cargo: 'Secretária',      email: 'carla@escola.edu.br',   cpf: '333.444.555-66' },
  { id: 4, nome: 'Diego Moraes',         cargo: 'Professor',       email: 'diego@escola.edu.br',   cpf: '444.555.666-77' },
  { id: 5, nome: 'Elaine Rodrigues',     cargo: 'Diretora',        email: 'elaine@escola.edu.br',  cpf: '555.666.777-88' },
  { id: 6, nome: 'Fernando Costa',       cargo: 'Inspetor',        email: 'fernando@escola.edu.br',cpf: '666.777.888-99' },
  { id: 7, nome: 'Gabriela Mendes',      cargo: 'Professora',      email: 'gabi@escola.edu.br',    cpf: '777.888.999-00' },
  { id: 8, nome: 'Henrique Alves',       cargo: 'Auxiliar',        email: 'henrique@escola.edu.br',cpf: '888.999.000-11' },
];

// Registros de ponto de hoje (simulado)
const PONTOS_HOJE = [
  { id: 1, funcionarioId: 1, entrada: '07:55', saida: '12:05', status: 'completo' },
  { id: 2, funcionarioId: 2, entrada: '08:02', saida: null,    status: 'presente' },
  { id: 3, funcionarioId: 4, entrada: '07:48', saida: '12:00', status: 'completo' },
  { id: 4, funcionarioId: 5, entrada: '07:30', saida: '11:58', status: 'completo' },
  { id: 5, funcionarioId: 7, entrada: '08:10', saida: null,    status: 'presente' },
];

/* ============================================================
   UTILITÁRIOS
   ============================================================ */

/**
 * Pega o primeiro nome de um nome completo
 * Ex.: "Carlos Eduardo" → "Carlos"
 */
function getPrimeiroNome(nomeCompleto) {
  return nomeCompleto.trim().split(' ')[0];
}

/**
 * Gera as iniciais de um nome completo (máx. 2 letras)
 * Ex.: "Carlos Eduardo" → "CE"
 * Ex.: "João" → "JO"
 */
function getIniciais(nomeCompleto) {
  const partes = nomeCompleto.trim().split(' ').filter(Boolean);
  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Formata data no padrão brasileiro
 * Ex.: "segunda-feira, 12 de maio de 2025"
 */
function formatarDataExtenso(data) {
  return data.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Formata hora HH:MM
 */
function formatarHora(data) {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Retorna o funcionário pelo ID
 */
function getFuncionarioPorId(id) {
  return FUNCIONARIOS.find(f => f.id === id);
}

/**
 * Verifica se o funcionário bateu ponto hoje
 */
function funcionarioBateuPonto(funcId) {
  return PONTOS_HOJE.some(p => p.funcionarioId === funcId);
}

/**
 * Retorna os IDs dos funcionários que NÃO bateram ponto
 */
function getFuncionariosSemPonto() {
  return FUNCIONARIOS.filter(f => !funcionarioBateuPonto(f.id));
}

/* ============================================================
   RELÓGIO EM TEMPO REAL
   ============================================================ */

/**
 * Atualiza o relógio e a data no topbar a cada segundo
 */
function iniciarRelogio() {
  const elHora = document.getElementById('topbar-time');
  const elData = document.getElementById('topbar-date');

  if (!elHora || !elData) return;

  function atualizar() {
    const agora = new Date();
    elHora.textContent = formatarHora(agora);
    elData.textContent = formatarDataExtenso(agora);
  }

  atualizar();
  setInterval(atualizar, 1000);
}

/* ============================================================
   PERFIL DO ADMIN NO HEADER
   ============================================================ */

/**
 * Renderiza o avatar e o primeiro nome do admin no topbar
 */
function renderizarPerfil() {
  const elAvatar = document.getElementById('admin-avatar');
  const elNome   = document.getElementById('admin-firstname');
  const elCargo  = document.getElementById('admin-role');

  if (elAvatar) elAvatar.textContent = getIniciais(ADMIN.nome);
  if (elNome)   elNome.textContent   = getPrimeiroNome(ADMIN.nome);
  if (elCargo)  elCargo.textContent  = ADMIN.cargo;
}

/* ============================================================
   SIDEBAR — MENU LATERAL
   ============================================================ */

function iniciarSidebar() {
  const toggleBtn     = document.getElementById('menu-toggle');
  const sidebar       = document.getElementById('sidebar');
  const overlay       = document.getElementById('sidebar-overlay');

  if (!toggleBtn || !sidebar) return;

  // Abre/fecha sidebar no mobile
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  // Fecha ao clicar no overlay
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });

  // Marca o nav item ativo com base na URL atual
  const navItems = document.querySelectorAll('.nav-item');
  const paginaAtual = window.location.pathname.split('/').pop();

  navItems.forEach(item => {
    const href = item.getAttribute('href') || '';
    if (href.includes(paginaAtual) && paginaAtual !== '') {
      item.classList.add('active');
    }
  });
}

/* ============================================================
   TOAST / NOTIFICAÇÕES
   ============================================================ */

/**
 * Exibe uma notificação toast
 * @param {string} mensagem  Texto a exibir
 * @param {'success'|'error'|'info'} tipo
 * @param {number} duracao   Duração em ms (padrão: 3500)
 */
function mostrarToast(mensagem, tipo = 'success', duracao = 3500) {
  const icones = { success: '✅', error: '❌', info: 'ℹ️' };

  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `<span>${icones[tipo]}</span> ${mensagem}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duracao);
}

/* ============================================================
   FORMULÁRIO — REGISTRAR FUNCIONÁRIO
   ============================================================ */

function iniciarFormRegistro() {
  const form = document.getElementById('form-registro');
  if (!form) return;

  // Máscara simples para CPF
  const inputCPF = document.getElementById('input-cpf');
  if (inputCPF) {
    inputCPF.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 11) val = val.slice(0, 11);
      val = val.replace(/(\d{3})(\d)/, '$1.$2');
      val = val.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
      val = val.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
      e.target.value = val;
    });
  }

  // Submit simulado
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const nome  = document.getElementById('input-nome').value.trim();
    const email = document.getElementById('input-email').value.trim();
    const cpf   = document.getElementById('input-cpf').value.trim();
    const cargo = document.getElementById('input-cargo').value;

    // Validação básica
    if (!nome || !email || !cpf || !cargo) {
      mostrarToast('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    if (cpf.length < 14) {
      mostrarToast('CPF inválido. Informe os 11 dígitos.', 'error');
      return;
    }

    // Simula salvamento (será integrado com back-end)
    const btnSubmit = document.getElementById('btn-registrar');
    const textoOriginal = btnSubmit.textContent;
    btnSubmit.textContent = 'Registrando…';
    btnSubmit.disabled = true;

    setTimeout(() => {
      // Adiciona ao array local (simulação)
      const novoId = FUNCIONARIOS.length + 1;
      FUNCIONARIOS.push({ id: novoId, nome, email, cpf, cargo });

      mostrarToast(`Funcionário "${nome}" registrado com sucesso!`, 'success');
      form.reset();

      btnSubmit.textContent = textoOriginal;
      btnSubmit.disabled = false;
    }, 1000);
  });
}

/* ============================================================
   PONTOS DO DIA — TABELA
   ============================================================ */

function renderizarPontosHoje() {
  const tbodyPresentes = document.getElementById('tbody-presentes');
  const tbodyAusentes  = document.getElementById('tbody-ausentes');

  if (!tbodyPresentes && !tbodyAusentes) return;

  // --- Funcionários que bateram ponto ---
  if (tbodyPresentes) {
    const pontosComDados = PONTOS_HOJE.map(p => ({
      ponto: p,
      func: getFuncionarioPorId(p.funcionarioId),
    })).filter(x => x.func);

    tbodyPresentes.innerHTML = pontosComDados.map(({ func, ponto }) => `
      <tr>
        <td>
          <div class="td-user">
            <div class="td-avatar">${getIniciais(func.nome)}</div>
            <div>
              <div class="td-name">${func.nome}</div>
              <div class="td-email">${func.email}</div>
            </div>
          </div>
        </td>
        <td>${func.cargo}</td>
        <td>${ponto.entrada}</td>
        <td>${ponto.saida ?? '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>
          <span class="badge ${ponto.status === 'completo' ? 'badge-success' : 'badge-warning'}">
            ${ponto.status === 'completo' ? 'Ponto batido' : 'Em andamento'}
          </span>
        </td>
      </tr>
    `).join('');

    if (!pontosComDados.length) {
      tbodyPresentes.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nenhum ponto registrado ainda</div></div></td></tr>`;
    }
  }

  // --- Funcionários que NÃO bateram ponto ---
  if (tbodyAusentes) {
    const ausentes = getFuncionariosSemPonto();

    tbodyAusentes.innerHTML = ausentes.map(func => `
      <tr>
        <td>
          <div class="td-user">
            <div class="td-avatar">${getIniciais(func.nome)}</div>
            <div>
              <div class="td-name">${func.nome}</div>
              <div class="td-email">${func.email}</div>
            </div>
          </div>
        </td>
        <td>${func.cargo}</td>
        <td>
          <span class="badge badge-danger">Não bateu ponto</span>
        </td>
      </tr>
    `).join('');

    if (!ausentes.length) {
      tbodyAusentes.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-title">Todos os funcionários bateram ponto!</div></div></td></tr>`;
    }
  }

  // Atualiza contador na tab
  const countPresentes = document.getElementById('count-presentes');
  const countAusentes  = document.getElementById('count-ausentes');
  if (countPresentes) countPresentes.textContent = PONTOS_HOJE.length;
  if (countAusentes)  countAusentes.textContent  = getFuncionariosSemPonto().length;
}

/* ============================================================
   TABS (PONTOS DO DIA)
   ============================================================ */

function iniciarTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
  if (!tabBtns.length) return;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const alvo = btn.dataset.tab;

      // Atualiza botões
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Mostra painel correto
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('hidden', panel.id !== alvo);
      });
    });
  });
}

/* ============================================================
   LISTA DE FUNCIONÁRIOS
   ============================================================ */

function renderizarFuncionarios() {
  const container = document.getElementById('lista-funcionarios');
  if (!container) return;

  function renderizar(lista) {
    if (!lista.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum funcionário encontrado</div></div>`;
      return;
    }

    container.innerHTML = lista.map(func => `
      <div class="func-item-card animate-in">
        <div class="func-item-avatar">${getIniciais(func.nome)}</div>
        <div class="func-item-info">
          <div class="func-item-name">${func.nome}</div>
          <div class="func-item-cargo">${func.cargo}</div>
        </div>
        <span class="badge ${funcionarioBateuPonto(func.id) ? 'badge-success' : 'badge-danger'}">
          ${funcionarioBateuPonto(func.id) ? '✓' : '✗'}
        </span>
      </div>
    `).join('');
  }

  renderizar(FUNCIONARIOS);

  // Busca em tempo real
  const inputBusca = document.getElementById('busca-funcionario');
  if (inputBusca) {
    inputBusca.addEventListener('input', () => {
      const termo = inputBusca.value.toLowerCase().trim();
      const filtrado = FUNCIONARIOS.filter(f =>
        f.nome.toLowerCase().includes(termo) ||
        f.cargo.toLowerCase().includes(termo)
      );
      renderizar(filtrado);
    });
  }

  // Totalizador
  const elTotal = document.getElementById('total-funcionarios');
  if (elTotal) elTotal.textContent = FUNCIONARIOS.length;
}

/* ============================================================
   DASHBOARD — STATS
   ============================================================ */

function renderizarStats() {
  const elTotal     = document.getElementById('stat-total');
  const elPresentes = document.getElementById('stat-presentes');
  const elAusentes  = document.getElementById('stat-ausentes');

  if (elTotal)     elTotal.textContent     = FUNCIONARIOS.length;
  if (elPresentes) elPresentes.textContent = PONTOS_HOJE.length;
  if (elAusentes)  elAusentes.textContent  = getFuncionariosSemPonto().length;
}

/* ============================================================
   RELATÓRIOS
   ============================================================ */

function renderizarRelatorio() {
  const tbodyRel   = document.getElementById('tbody-relatorio');
  const elData     = document.getElementById('relatorio-data');
  const elPresRel  = document.getElementById('relatorio-presentes');
  const elAusRel   = document.getElementById('relatorio-ausentes');

  if (elData) elData.textContent = formatarDataExtenso(new Date());
  if (elPresRel) elPresRel.textContent = PONTOS_HOJE.length;
  if (elAusRel)  elAusRel.textContent  = getFuncionariosSemPonto().length;

  if (!tbodyRel) return;

  // Todos os funcionários com status
  const linhas = FUNCIONARIOS.map(func => {
    const ponto = PONTOS_HOJE.find(p => p.funcionarioId === func.id);
    return { func, ponto };
  });

  tbodyRel.innerHTML = linhas.map(({ func, ponto }) => `
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
      <td>${ponto ? ponto.entrada : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${ponto && ponto.saida ? ponto.saida : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>
        <span class="badge ${ponto ? 'badge-success' : 'badge-danger'}">
          ${ponto ? 'Ponto batido' : 'Não bateu ponto'}
        </span>
      </td>
    </tr>
  `).join('');
}

/**
 * Simula geração de PDF
 * (Integração real será feita no back-end / biblioteca de PDF)
 */
function gerarPDF() {
  const btn = document.getElementById('btn-gerar-pdf');
  if (!btn) return;

  const original = btn.innerHTML;
  btn.innerHTML  = '⏳ Gerando PDF…';
  btn.disabled   = true;

  setTimeout(() => {
    mostrarToast('PDF gerado com sucesso! (simulação)', 'success');
    btn.innerHTML = original;
    btn.disabled  = false;
  }, 1800);
}

/**
 * Simula impressão do relatório
 */
function imprimirRelatorio() {
  mostrarToast('Abrindo janela de impressão…', 'info');
  setTimeout(() => window.print(), 600);
}

/* ============================================================
   INICIALIZAÇÃO GLOBAL
   Chamada em todas as páginas
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Componentes globais (presentes em todas as páginas com layout)
  iniciarRelogio();
  renderizarPerfil();
  iniciarSidebar();

  // Módulos específicos por página
  iniciarFormRegistro();
  renderizarPontosHoje();
  iniciarTabs();
  renderizarFuncionarios();
  renderizarStats();
  renderizarRelatorio();

  // Botões do relatório
  const btnPDF = document.getElementById('btn-gerar-pdf');
  if (btnPDF) btnPDF.addEventListener('click', gerarPDF);

  const btnImprimir = document.getElementById('btn-imprimir');
  if (btnImprimir) btnImprimir.addEventListener('click', imprimirRelatorio);

  // Login — redireciona para dashboard
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = formLogin.querySelector('button[type=submit]');
      btn.textContent = 'Entrando…';
      btn.disabled = true;
      setTimeout(() => { window.location.href = 'admin/dashboard.html'; }, 900);
    });
  }
});
