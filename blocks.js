const express = require('express');
const router = express.Router();
const controller = require('../controllers/blockController');
const { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, controller.createBlock);
router.delete('/:id', requireAuth, controller.removeBlock);

module.exports = router;
