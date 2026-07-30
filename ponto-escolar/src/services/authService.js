"use strict";

const employeeModel = require("../models/employeeModel");

async function findUserByToken(funcionarioId) {
  return employeeModel.findById(funcionarioId);
}

module.exports = {
  findUserByToken,
};
