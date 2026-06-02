'use strict';

const { Router } = require('express');

const adminAuthRoutes = require('./adminAuthRoutes');
const adminEmployeeRoutes = require('./adminEmployeeRoutes');
const adminQrRoutes = require('./adminQrRoutes');
const adminPointRoutes = require('./adminPointRoutes');
const punchRoutes = require('./punchRoutes');
const ensureAdminApiAuthenticated = require('../middlewares/ensureAdminApiAuthenticated');

const router = Router();

router.use('/admin/auth', ensureAdminApiAuthenticated, adminAuthRoutes);
router.use('/admin/funcionarios', ensureAdminApiAuthenticated, adminEmployeeRoutes);
router.use('/admin/qr-tokens', ensureAdminApiAuthenticated, adminQrRoutes);
router.use('/admin/pontos', ensureAdminApiAuthenticated, adminPointRoutes);
router.use('/pontos', punchRoutes);

module.exports = router;
