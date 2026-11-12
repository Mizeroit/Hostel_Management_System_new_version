const express = require('express');
const { asyncHandler } = require('../middleware/errors');
const controller = require('../controllers/dashboardController');

const router = express.Router();
router.get('/', asyncHandler(controller.summary));
module.exports = router;
