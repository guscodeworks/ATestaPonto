"use strict";

const { Router } = require("express");
const {
  listSchools,
  lookupSchoolAddress,
  createSchool,
} = require("../controllers/adminSchoolUnitController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const { escopoPorCapacidade, exigirCapacidade } = require("../middlewares/adminScope");

const router = Router();

router.get("/cep/:cep", exigirCapacidade("escola.criar"), sensitiveLimiter, lookupSchoolAddress);
router.get("/", escopoPorCapacidade("escola.listar"), listSchools);
router.post("/", exigirCapacidade("escola.criar"), sensitiveLimiter, createSchool);

module.exports = router;
