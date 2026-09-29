"use strict";

const { Router } = require("express");
const employeeQrAccessSession = require("../../middlewares/employeeQrAccessSession");
const {
  clearQrSchoolUnitContext,
} = require("../../middlewares/qrSchoolUnitContext");

function createAuthPagesRouter({ sendView }) {
  const router = Router();
  const sendEmployeeLogin = (req, res) => {
    clearQrSchoolUnitContext(req);
    return sendView(res, "index.html");
  };

  router.get("/", employeeQrAccessSession, sendEmployeeLogin);
  router.get("/home", (_req, res) => res.redirect("/"));
  router.get("/login", employeeQrAccessSession, sendEmployeeLogin);
  router.get("/recuperar-senha", (_req, res) => sendView(res, "password/password.html"));
  router.get("/views/password/password.html", (_req, res) => sendView(res, "password/password.html"));
  router.get("/first-access", (_req, res) => sendView(res, "auth/first-access.html"));

  return router;
}

module.exports = { createAuthPagesRouter };
