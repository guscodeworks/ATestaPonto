"use strict";

const roleModel = require("../models/roleModel");

// `cargos` guarda só nome/ativo; o service expõe esse recorte.
async function listCargos() {
  const cargos = await roleModel.listCargos();

  return cargos.map((cargo) => ({
    id: Number(cargo.id),
    nome: String(cargo.cargo),
    ativo: Boolean(cargo.ativo),
  }));
}

module.exports = {
  listCargos,
};
