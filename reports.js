const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportController');
const { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, controller.createReport);

module.exports = router;
