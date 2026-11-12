const express = require('express');
const { asyncHandler } = require('../middleware/errors');
const controller = require('../controllers/allocationController');

const router = express.Router();
router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));
router.put('/:id/move', asyncHandler(controller.move));
router.put('/:id/vacate', asyncHandler(controller.vacate));
module.exports = router;
