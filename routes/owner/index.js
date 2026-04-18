/**
 * routes/owner/index.js
 * Aggregates owner routes.
 */

const express = require('express');

const ownerPostsRoutes = require('./posts');
const ownerBookingRoutes = require('./bookingRoutes');

const router = express.Router();

router.use('/posts', ownerPostsRoutes);
router.use('/bookings', ownerBookingRoutes);

module.exports = router;
