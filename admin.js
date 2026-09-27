const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin); // every /api/admin/* route requires an authenticated admin

router.get('/dashboard', controller.dashboard);
router.get('/users', controller.listUsers);
router.get('/reports', controller.listReports);
router.post('/users/:id/suspend', controller.suspendUser);
router.post('/users/:id/ban', controller.banUser);
router.post('/users/:id/unban', controller.unbanUser);
router.post('/reports/:id/resolve', controller.resolveReport);

module.exports = router;
