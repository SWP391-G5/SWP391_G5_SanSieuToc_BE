const express = require('express');

const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const asyncHandler = require('../../middlewares/asyncHandler');
const revenueController = require('../../controllers/owner/revenueController');

const router = express.Router();

router.use(authenticate, authorizeRoles(['Owner']));

router.get('/inventory', asyncHandler(revenueController.getInventory));
router.get('/top-services', asyncHandler(revenueController.getTopServices));
router.get('/field/:fieldId', asyncHandler(revenueController.getFieldDetail));

module.exports = router;
