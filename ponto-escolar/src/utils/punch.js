'use strict';

// 1 linha por batida (tipo enum); utils/punch monta shape {entrada, saidaAlmoco, voltaAlmoco, saida}.

const EMPTY_PUNCH_TIME = '00:00:00';
const PUNCH_TYPES = ['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'];

// Enum RETORNO_ALMOCO → field lógico voltaAlmoco.
const TIPO_TO_FIELD = {
  ENTRADA: 'entrada',
  SAIDA_ALMOCO: 'saidaAlmoco',
  RETORNO_ALMOCO: 'voltaAlmoco',
  SAIDA: 'saida',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Extrai HH:mm:ss de registrado_em (Date UTC ou string). null se ausente.
 */
function extractTimeFromRegistradoEm(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}:${pad2(value.getUTCSeconds())}`;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  // Captura o trecho de hora em "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss..."
  // ou em um "HH:mm:ss" / "HH:mm" isolado.
  const match = /(\d{2}:\d{2}(?::\d{2})?)/.exec(raw);
  if (!match) {
    return null;
  }
  return match[1].length === 5 ? `${match[1]}:00` : match[1];
}

/**
 * Normaliza um valor de tempo em HH:mm:ss ou EMPTY_PUNCH_TIME.
 * Tolerante a Date (via extracção UTC), string "HH:mm:ss"/"HH:mm" e nulos.
 */
function normalizeTimeValue(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return EMPTY_PUNCH_TIME;
    }
    return extractTimeFromRegistradoEm(value) || EMPTY_PUNCH_TIME;
  }

  const raw = String(value || '').trim().slice(0, 8);
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }
  if (/^\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00`;
  }
  return EMPTY_PUNCH_TIME;
}

/**
 * Retorna true se o valor representa uma batida real (diferente da sentinela).
 */
function hasPunchTime(value) {
  return normalizeTimeValue(value) !== EMPTY_PUNCH_TIME;
}

/**
 * Array de batidas → shape {entrada, saidaAlmoco, voltaAlmoco, saida}. Ausentes = EMPTY_PUNCH_TIME.
 */
function readPunchTimesFromRow(rows) {
  const times = {
    entrada: EMPTY_PUNCH_TIME,
    saidaAlmoco: EMPTY_PUNCH_TIME,
    voltaAlmoco: EMPTY_PUNCH_TIME,
    saida: EMPTY_PUNCH_TIME,
  };

  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  for (const row of list) {
    if (!row || !row.tipo) {
      continue;
    }
    const field = TIPO_TO_FIELD[row.tipo];
    if (!field) {
      continue;
    }
    const time = extractTimeFromRegistradoEm(row.registrado_em);
    if (time) {
      times[field] = time;
    }
  }

  return times;
}

/**
 * Determina a próxima batida a ser registrada com base nos horários atuais.
 * Retorna null quando as 4 batidas já foram registradas (impede uma 5ª batida).
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
  TIPO_TO_FIELD,
  normalizeTimeValue,
  hasPunchTime,
  extractTimeFromRegistradoEm,
  readPunchTimesFromRow,
  resolveNextPunch,
};
