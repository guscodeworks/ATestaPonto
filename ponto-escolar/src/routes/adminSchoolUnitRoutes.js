"use strict";

const { Router } = require("express");
const {
  listSchools,
  createSchool,
  lookupPostalCode,
} = require("../controllers/adminSchoolUnitController");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const { createSchoolValidator, cepParamValidator } = require("../middlewares/validators");
const { escopoMiddleware } = require("../middlewares/adminScope");

const router = Router();

router.use(escopoMiddleware);
router.get("/cep/:cep", cepParamValidator, lookupPostalCode);
router.get("/", listSchools);
router.post("/", sensitiveLimiter, createSchoolValidator, createSchool);

module.exports = router;