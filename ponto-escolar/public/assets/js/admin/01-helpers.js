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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function somenteDigitos(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizarBooleano(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['true', '1', 'ativo', 'active'].includes(String(value).toLowerCase());
}

function formatarDataApi(value) {
  if (!value) return null;
  const data = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(data.getTime())) return null;
  return formatarData(data);
}

function formatarDataReferencia(value) {
  if (!value) return formatarDataExtenso(new Date());
  const data = new Date(`${value}T00:00:00`);
  if (Number.isNaN(data.getTime())) return value;
  return formatarDataExtenso(data);
}

function formatarHoraApi(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const timeMatch = raw.match(/(\d{2}):(\d{2})(?::\d{2})?/);
  if (!timeMatch) return null;
  if (`${timeMatch[1]}:${timeMatch[2]}` === '00:00') return null;
  return `${timeMatch[1]}:${timeMatch[2]}`;
}

function normalizarResumoApi(resumo = {}) {
  return {
    total_funcionarios: Number(resumo.total_funcionarios || 0),
    total_ativos: Number(resumo.total_ativos || resumo.total_funcionarios_ativos || 0),
    presentes: Number(resumo.presentes || 0),
    ausentes: Number(resumo.ausentes || 0),
    taxa_presenca_percent: Number(resumo.taxa_presenca_percent || 0),
  };
}

function normalizarFuncionarioApi(funcionario = {}) {
  const ativo = normalizarBooleano(funcionario.ativo, funcionario.status !== 'inativo');
  const cargoId = funcionario.cargo_id ?? funcionario.cargoId ?? null;
  const cargoNome =
    funcionario.cargo_nome ||
    funcionario.cargo ||
    (cargoId ? `Cargo #${cargoId}` : 'Cargo nao informado');

  return {
    id: Number(funcionario.id),
    nome: String(funcionario.nome || funcionario.name || 'Funcionario sem nome'),
    cargo: String(cargoNome),
    cargo_id: cargoId ? Number(cargoId) : null,
    email: String(funcionario.email || ''),
    cpf: String(funcionario.cpf || ''),
    tel: funcionario.tel || funcionario.telefone || funcionario.celular || 'Nao disponivel na API',
    status: ativo ? 'ativo' : 'inativo',
    ativo,
    admissao: formatarDataApi(funcionario.criado_em || funcionario.admissao) || 'Nao informado',
    primeiro_acesso: normalizarBooleano(funcionario.primeiro_acesso, false),
    raw: funcionario,
  };
}

function normalizarFuncionarioDePonto(funcionario = {}) {
  const normalizado = normalizarFuncionarioApi(funcionario);
  const cadastrado = FUNCIONARIOS.find((item) => Number(item.id) === Number(normalizado.id));

  return cadastrado
    ? { ...normalizado, ...cadastrado, raw: funcionario }
    : normalizado;
}

function obterHorarioRegistro(registros, tipo) {
  const registro = (Array.isArray(registros) ? registros : []).find((item) => item.tipo === tipo);
  return formatarHoraApi(registro?.registrado_em);
}

function normalizarStatusPonto(status, totalBatidas) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'COMPLETO') return 'completo';
  if (raw === 'AUSENTE' || Number(totalBatidas || 0) === 0) return 'ausente';
  return 'presente';
}

function normalizarResumoPontoApi(item = {}) {
  const funcionario = normalizarFuncionarioDePonto(item.funcionario || item);
  const registros = Array.isArray(item.registros) ? item.registros : [];
  const totalBatidas = Number(item.total_batidas || registros.length || 0);

  return {
    id: item.id || `${funcionario.id || 'func'}-${item.status || 'ponto'}`,
    funcionarioId: funcionario.id,
    funcionario,
    entrada: formatarHoraApi(item.entrada) || obterHorarioRegistro(registros, 'ENTRADA'),
    pausa: obterHorarioRegistro(registros, 'SAIDA_ALMOCO'),
    retorno: obterHorarioRegistro(registros, 'VOLTA_ALMOCO'),
    saida: formatarHoraApi(item.saida) || obterHorarioRegistro(registros, 'SAIDA'),
    status: normalizarStatusPonto(item.status, totalBatidas),
    totalBatidas,
    raw: item,
  };
}

function getFuncionarioPorId(id) {
  const employeeId = Number(id);
  return (
    FUNCIONARIOS.find(f => Number(f.id) === employeeId) ||
    PONTOS_HOJE.find(p => Number(p.funcionarioId) === employeeId)?.funcionario ||
    AUSENTES_HOJE.find(f => Number(f.id) === employeeId) ||
    null
  );
}

function funcionarioBateuPonto(id) {
  return PONTOS_HOJE.some(p => Number(p.funcionarioId) === Number(id));
}

function getFuncionariosSemPonto() {
  if (AUSENTES_HOJE.length) {
    return AUSENTES_HOJE.map((funcionario) =>
      FUNCIONARIOS.find((item) => Number(item.id) === Number(funcionario.id)) || funcionario
    );
  }
  return FUNCIONARIOS.filter(f => !funcionarioBateuPonto(f.id) && f.status === 'ativo');
}
