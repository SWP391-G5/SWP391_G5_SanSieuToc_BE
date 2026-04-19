/**
 * routes/manager/statistics.js
 * Manager/Admin statistics routes.
 */

const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const statisticsController = require('../../controllers/manager/statisticsController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Manager']));

router.get('/summary', asyncHandler(statisticsController.getSummary));
router.get('/bookings-trend', asyncHandler(statisticsController.getBookingsTrend));
router.get('/revenue-trend', asyncHandler(statisticsController.getRevenueTrend));
router.get('/hot-fields', asyncHandler(statisticsController.getHotFields));

module.exports = router;
