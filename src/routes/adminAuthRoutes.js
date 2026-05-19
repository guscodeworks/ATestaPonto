const { Router } = require('express');
const { loginAdmin, getAdminProfile } = require('../controllers/adminAuthController');
const { authenticateAdmin } = require('../middlewares/authMiddleware');
const { loginLimiter } = require('../middlewares/rateLimiters');
const { adminLoginValidator } = require('../middlewares/validators');

const router = Router();

router.post('/login', loginLimiter, adminLoginValidator, loginAdmin);
router.get('/me', authenticateAdmin, getAdminProfile);

module.exports = router;
