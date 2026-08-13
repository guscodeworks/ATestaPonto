'use strict';

const { Router } = require('express');

const adminAuthRoutes = require('./adminAuthRoutes');
const adminCargoRoutes = require('./adminCargoRoutes');
const adminEmployeeRoutes = require('./adminEmployeeRoutes');
const adminAcessoRoutes = require('./adminAcessoRoutes');
const adminQrRoutes = require('./adminQrRoutes');
const adminPointRoutes = require('./adminPointRoutes');
const punchRoutes = require('./punchRoutes');
const { getPunchHistory, getTodayPunch } = require('../controllers/punchController');
const { authenticateFuncionario } = require('../middlewares/authMiddleware');
const ensureAdminApiAuthenticated = require('../middlewares/ensureAdminApiAuthenticated');

const router = Router();

router.use('/admin/auth', ensureAdminApiAuthenticated, adminAuthRoutes);
router.use('/admin/cargos', ensureAdminApiAuthenticated, adminCargoRoutes);
router.use('/admin/funcionarios', ensureAdminApiAuthenticated, adminEmployeeRoutes);
router.use('/admin/acessos', ensureAdminApiAuthenticated, adminAcessoRoutes);
router.use('/admin/qr-tokens', ensureAdminApiAuthenticated, adminQrRoutes);
router.use('/admin/pontos', ensureAdminApiAuthenticated, adminPointRoutes);
router.get('/pontos/historico', authenticateFuncionario, getPunchHistory);
router.get('/pontos/hoje', authenticateFuncionario, getTodayPunch);
router.use('/pontos', punchRoutes);

module.exports = router;
