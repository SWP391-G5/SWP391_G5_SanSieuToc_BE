const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const reportController = require('../../controllers/admin/reportController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Admin']));

router.get('/reports', asyncHandler(reportController.listReports));
router.patch('/reports/:id/status', asyncHandler(reportController.updateStatus));

module.exports = router;
