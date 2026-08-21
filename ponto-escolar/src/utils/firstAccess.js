"use strict";

// O driver/banco pode devolver TINYINT/BOOLEAN como número ou texto. Somente
// os valores persistidos equivalentes a 1 representam primeiro acesso.
function isFirstAccess(value) {
  return value === true || value === 1 || value === "1";
}

module.exports = { isFirstAccess };
