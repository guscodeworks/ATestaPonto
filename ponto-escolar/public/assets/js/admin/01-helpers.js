/* ============================================================
   UTILITÁRIOS
   ============================================================ */

function getPrimeiroNome(nome) { return nome.trim().split(' ')[0]; }

function getIniciais(nome) {
  const p = nome.trim().split(' ').filter(Boolean);
  return p.length === 1 ? p[0].slice(0,2).toUpperCase() : (p[0][0] + p[p.length-1][0]).toUpperCase();
}

function formatarDataExtenso(d) {
  return d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}

function formatarData(d) {
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function formatarHora(d) {
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

function getFuncionarioPorId(id) { return FUNCIONARIOS.find(f => f.id === id); }

function funcionarioBateuPonto(id) { return PONTOS_HOJE.some(p => p.funcionarioId === id); }

function getFuncionariosSemPonto() { return FUNCIONARIOS.filter(f => !funcionarioBateuPonto(f.id) && f.status === 'ativo'); }

