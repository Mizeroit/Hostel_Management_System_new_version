const express = require('express');
const { asyncHandler } = require('../middleware/errors');
const controller = require('../controllers/studentController');

const router = express.Router();
router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));
router.put('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));
module.exports = router;
