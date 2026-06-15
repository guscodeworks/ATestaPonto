"use strict";

const { getGovbrConfig } = require("../config/govbr");

function verificarSeUsuarioGovbrEhAdmin(userInfo) {
<<<<<<< HEAD
  const { adminSubs } = getGovbrConfig();
  const userSub = String(userInfo && userInfo.sub || '').trim();

  return Boolean(userSub && adminSubs.includes(userSub));
=======
  const { adminSubs, adminEmails } = getGovbrConfig();
  const userSub = String((userInfo && userInfo.sub) || "").trim();
  const userEmail = String((userInfo && userInfo.email) || "")
    .trim()
    .toLowerCase();

  return Boolean(
    (userSub && adminSubs.includes(userSub)) ||
      (userEmail && adminEmails.includes(userEmail))
  );
>>>>>>> 705dbbabe53cc90e5ba85259f8a91f61b02fc21a
}

module.exports = {
  verificarSeUsuarioGovbrEhAdmin,
};
