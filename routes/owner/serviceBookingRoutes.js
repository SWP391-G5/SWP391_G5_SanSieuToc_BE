const express = require('express');
const router = express.Router();
const serviceBookingController = require('../../controllers/owner/serviceBookingController');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const asyncHandler = require('../../middlewares/asyncHandler');

router.use(authenticate, authorizeRoles(['Owner']));

router.get('/', asyncHandler(serviceBookingController.getServiceBookingsForOwner));

module.exports = router;