'use strict';

const { Router } = require('express');

const adminAuthRoutes = require('./adminAuthRoutes');
const adminEmployeeRoutes = require('./adminEmployeeRoutes');
const adminQrRoutes = require('./adminQrRoutes');
const adminPointRoutes = require('./adminPointRoutes');
const punchRoutes = require('./punchRoutes');
const { authenticateAdmin } = require('../middlewares/authMiddleware');

const router = Router();

router.use('/admin/auth', adminAuthRoutes);
router.use('/admin/funcionarios', authenticateAdmin, adminEmployeeRoutes);
router.use('/admin/qr-tokens', authenticateAdmin, adminQrRoutes);
router.use('/admin/pontos', authenticateAdmin, adminPointRoutes);
router.use('/pontos', punchRoutes);

module.exports = router;
