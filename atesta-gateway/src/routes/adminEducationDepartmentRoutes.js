"use strict";

const { Router } = require("express");
const controller = require("../controllers/adminEducationDepartmentController");
const { exigirCapacidade } = require("../middlewares/adminScope");
const { sensitiveLimiter } = require("../middlewares/rateLimiters");
const requireSameOrigin = require("../middlewares/requireSameOrigin");

const router = Router();
router.use(exigirCapacidade("diretoria.gerenciar"));
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/", controller.list);
router.post("/", requireSameOrigin, sensitiveLimiter, controller.create);
router.put("/:id", requireSameOrigin, sensitiveLimiter, controller.update);
router.put("/:id/status", requireSameOrigin, sensitiveLimiter, controller.changeStatus);

module.exports = router;
