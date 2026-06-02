'use strict';

const { getGovbrConfig } = require('../config/govbr');

function verificarSeUsuarioGovbrEhAdmin(userInfo) {
  const { adminSubs, adminEmails } = getGovbrConfig();
  const userSub = String(userInfo && userInfo.sub || '').trim();
  const userEmail = String(userInfo && userInfo.email || '').trim().toLowerCase();

  return Boolean(
    (userSub && adminSubs.includes(userSub)) ||
    (userEmail && adminEmails.includes(userEmail))
  );
}

module.exports = {
  verificarSeUsuarioGovbrEhAdmin
};
