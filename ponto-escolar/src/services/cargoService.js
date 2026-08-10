"use strict";

const cargoModel = require("../models/cargoModel");

// NOVO SCHEMA: `cargos` guarda apenas o nome do cargo e o flag ativo (a jornada
// migrou para `vinculos_funcionais`). O service expõe exatamente esse recorte.
async function listCargos() {
  const cargos = await cargoModel.listCargos();

  return cargos.map((cargo) => ({
    id: Number(cargo.id),
    nome: String(cargo.cargo),
    ativo: Boolean(cargo.ativo),
  }));
}

module.exports = {
  listCargos,
};
