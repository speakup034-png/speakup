const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptionController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, controller.getSubscription);
router.post('/create', requireAuth, controller.createCheckout);
router.post('/webhook', controller.handleWebhook); // no user auth — authenticated via provider signature instead

module.exports = router;
