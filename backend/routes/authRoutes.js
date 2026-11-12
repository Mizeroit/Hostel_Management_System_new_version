const express = require('express');
const { asyncHandler } = require('../middleware/errors');
const requireAuth = require('../middleware/auth');
const controller = require('../controllers/authController');

const router = express.Router();
router.post('/login', asyncHandler(controller.login));
router.get('/me', requireAuth, asyncHandler(controller.me));
module.exports = router;
