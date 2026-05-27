'use strict';

function verificarSeUsuarioGovbrEhAdmin(userInfo) {
  const adminSubs = String(process.env.ADMIN_GOVBR_SUBS || '')
    .split(',')
    .map((sub) => sub.trim())
    .filter(Boolean);
  const userSub = String(userInfo && userInfo.sub || '').trim();

  return Boolean(userSub && adminSubs.includes(userSub));
}

module.exports = {
  verificarSeUsuarioGovbrEhAdmin
};
