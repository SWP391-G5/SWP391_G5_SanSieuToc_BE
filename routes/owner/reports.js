const express = require('express');

const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const asyncHandler = require('../../middlewares/asyncHandler');
const reportController = require('../../controllers/owner/reportController');

const router = express.Router();

// All routes require login + Owner role
router.use(authenticate, authorizeRoles(['Owner']));

router.get('/eligible-customers', asyncHandler(reportController.listEligibleCustomers));
router.get('/', asyncHandler(reportController.listMyReports));
router.post('/', asyncHandler(reportController.createReport));
router.patch('/:id', asyncHandler(reportController.updateReport));
router.delete('/:id', asyncHandler(reportController.deleteReport));

module.exports = router;
