"use strict";

const nodemailer = require("nodemailer");
const env = require("../config/env");
const { logger } = require("../utils/logger");

let transport;

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transport;
}

function getEmployeeLoginUrl() {
  return new URL("/ponto/acessar", env.APP_BASE_URL).toString();
}

async function sendEmployeeWelcomeEmail({ nome, email, senhaTemporaria }) {
  if (!env.MAIL_ENABLED) return { enviado: false, motivo: "desativado" };

  try {
    await getTransport().sendMail({
      from: env.MAIL_FROM,
      to: email,
      subject: "Acesso ao Atesta Ponto",
      text: [
        `Olá, ${nome}!`,
        "",
        "Seu acesso ao Atesta Ponto foi criado.",
        `Login: ${email}`,
        `Senha temporária: ${senhaTemporaria}`,
        "",
        `Acesse: ${getEmployeeLoginUrl()}`,
        "Por segurança, altere sua senha no primeiro acesso.",
      ].join("\n"),
    });
    return { enviado: true };
  } catch (error) {
    // Senha nunca logada; logger já mascara o e-mail.
    logger.error("Falha ao enviar e-mail de acesso ao funcionario", {
      error: { name: error.name, code: error.code },
      email,
    });
    return { enviado: false, motivo: "falha_no_envio" };
  }
}

module.exports = { sendEmployeeWelcomeEmail };
