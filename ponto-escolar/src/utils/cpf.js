function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function hasRepeatedDigits(cpf) {
  return /^(\d)\1{10}$/.test(cpf);
}

function calculateDigit(cpfPartial, startFactor) {
  let sum = 0;
  for (let i = 0; i < cpfPartial.length; i += 1) {
    sum += Number(cpfPartial[i]) * (startFactor - i);
  }

  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

function isValidCpf(value) {
  const cpf = normalizeCpf(value);

  if (cpf.length !== 11) {
    return false;
  }

  if (hasRepeatedDigits(cpf)) {
    return false;
  }

  const baseDigits = cpf.slice(0, 9);
  const firstDigit = calculateDigit(baseDigits, 10);
  const secondDigit = calculateDigit(`${baseDigits}${firstDigit}`, 11);

  return cpf === `${baseDigits}${firstDigit}${secondDigit}`;
}

function formatCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) {
    return null;
  }
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
}

function maskCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) {
    return '***.***.***-**';
  }
  return `***.***.***-${cpf.slice(9, 11)}`;
}

module.exports = {
  normalizeCpf,
  isValidCpf,
  formatCpf,
  maskCpf
};
