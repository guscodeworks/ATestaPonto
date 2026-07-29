"use strict";

const cargoModel = require("../models/cargoModel");

async function listCargos() {
  const cargos = await cargoModel.listCargos();

  return cargos.map((cargo) => ({
    id: Number(cargo.id),
    nome: String(cargo.nome),
    hora_entrada_padrao: String(cargo.hora_entrada_padrao),
    hora_saida_padrao: String(cargo.hora_saida_padrao),
  }));
}

module.exports = {
  listCargos,
};
