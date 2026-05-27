'use strict';

const { getGovbrConfig } = require('../config/govbr');

function verificarSeUsuarioGovbrEhAdmin(userInfo) {
  const { adminSubs } = getGovbrConfig();
  const userSub = String(userInfo && userInfo.sub || '').trim();

  return Boolean(userSub && adminSubs.includes(userSub));
}

module.exports = {
  verificarSeUsuarioGovbrEhAdmin
};
