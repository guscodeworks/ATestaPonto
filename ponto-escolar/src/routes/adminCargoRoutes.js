"use strict";

const { Router } = require("express");
const { listCargos } = require("../controllers/adminCargoController");

const router = Router();

router.get("/", listCargos);

module.exports = router;
