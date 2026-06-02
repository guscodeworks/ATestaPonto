'use strict';

// Valor sentinela que representa ausência de horário no banco de dados.
const EMPTY_PUNCH_TIME = '00:00:00';

// Ordem das batidas de ponto durante o dia.
const PUNCH_TYPES = ['ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA'];

// Mapeamento de field lógico → coluna real da tabela registro_de_pontos.
// Usado por punchController para montar UPDATE dinâmico sem DELETE+INSERT.
const FIELD_TO_COLUMN = {
  entrada:     'entrada',
  saidaAlmoco: 'saida_almoco',
  voltaAlmoco: 'volta_almoco',
  saida:       'saida'
};

/**
 * Normaliza um valor de tempo do banco.
 * Retorna EMPTY_PUNCH_TIME se o valor for nulo, vazio ou mal-formado.
 */
function normalizeTimeValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return EMPTY_PUNCH_TIME;
  const candidate = raw.slice(0, 8);
  if (/^\d{2}:\d{2}:\d{2}$/.test(candidate)) return candidate;
  return EMPTY_PUNCH_TIME;
}

/**
 * Retorna true se o valor de tempo representa uma batida real
 * (i.e., diferente do valor sentinela).
 */
function hasPunchTime(value) {
  return normalizeTimeValue(value) !== EMPTY_PUNCH_TIME;
}

/**
 * Encontra a chave de uma coluna de almoço em uma linha do banco
 * buscando por prefixo (acomoda variações como 'saida_almoco' vs 'saida_almoço').
 */
function findLunchColumnKey(row, prefix) {
  return (
    Object.keys(row || {}).find((key) =>
      String(key || '')
        .toLowerCase()
        .startsWith(prefix)
    ) || null
  );
}

/**
 * Lê as quatro batidas de uma linha do banco e retorna um objeto normalizado.
 * Lida com variações de nome de coluna para saida_almoco / volta_almoco.
 */
function readPunchTimesFromRow(row) {
  const saidaAlmocoKey = findLunchColumnKey(row, 'saida_almo');
  const voltaAlmocoKey = findLunchColumnKey(row, 'volta_almo');

  return {
    entrada:     normalizeTimeValue(row?.entrada),
    saidaAlmoco: normalizeTimeValue(saidaAlmocoKey ? row[saidaAlmocoKey] : null),
    voltaAlmoco: normalizeTimeValue(voltaAlmocoKey ? row[voltaAlmocoKey] : null),
    saida:       normalizeTimeValue(row?.saida)
  };
}

/**
 * Determina qual é a próxima batida a ser registrada com base nos horários atuais.
 * Retorna null se todas as 4 batidas já foram registradas.
 */
function resolveNextPunch(times) {
  if (!hasPunchTime(times.entrada))     return { sequence: 1, type: PUNCH_TYPES[0], field: 'entrada' };
  if (!hasPunchTime(times.saidaAlmoco)) return { sequence: 2, type: PUNCH_TYPES[1], field: 'saidaAlmoco' };
  if (!hasPunchTime(times.voltaAlmoco)) return { sequence: 3, type: PUNCH_TYPES[2], field: 'voltaAlmoco' };
  if (!hasPunchTime(times.saida))       return { sequence: 4, type: PUNCH_TYPES[3], field: 'saida' };
  return null;
}

module.exports = {
  EMPTY_PUNCH_TIME,
  PUNCH_TYPES,
  FIELD_TO_COLUMN,
  normalizeTimeValue,
  hasPunchTime,
  findLunchColumnKey,
  readPunchTimesFromRow,
  resolveNextPunch
};
