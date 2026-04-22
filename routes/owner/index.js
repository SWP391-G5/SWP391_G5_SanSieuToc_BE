/**
 * routes/owner/index.js
 * Aggregates owner routes.
 */

const express = require('express');

const ownerPostsRoutes = require('./posts');
const ownerBookingRoutes = require('./bookingRoutes');
const ownerWalletRoutes = require('./wallet');
const ownerServiceBookingRoutes = require('./serviceBookingRoutes');
const ownerRevenueRoutes = require('./revenue');
const ownerReportsRoutes = require('./reports');

const router = express.Router();

router.use('/posts', ownerPostsRoutes);
router.use('/bookings', ownerBookingRoutes);
router.use('/service-bookings', ownerServiceBookingRoutes);
router.use('/revenue', ownerRevenueRoutes);
router.use('/reports', ownerReportsRoutes);
router.use('/', ownerWalletRoutes);

module.exports = router;
