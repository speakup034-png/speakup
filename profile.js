const express = require('express');
const router = express.Router();
const controller = require('../controllers/profileController');
const { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, controller.createProfile);
router.patch('/', requireAuth, controller.updateProfile);
router.get('/:id', requireAuth, controller.getPublicProfile);

module.exports = router;
