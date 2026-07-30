"use strict";

const cargoService = require("../services/cargoService");

async function listCargos(_req, res, next) {
  try {
    const result = await cargoService.listCargos();

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCargos,
};
