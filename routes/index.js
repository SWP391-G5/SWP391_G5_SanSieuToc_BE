const express = require('express');

const authAdminRoutes = require('./admin/auth');
const authUserRoutes = require('./user/auth');

const adminProfileRoutes = require('./admin/profile');
const adminAccountRoutes = require('./admin/accounts');
const adminReportRoutes = require('./admin/reports');
const userProfileRoutes = require('./user/profile');
const walletRoutes = require('./wallet');
const fieldsRoutes = require('./fields');
const bookingRoutes = require('./bookings');
const serviceRoutes = require('./services');

const managerRoutes = require('./manager');
const ownerRoutes = require('./owner');
const publicBannersRoutes = require('./public/banners');
const publicPrivacyRoutes = require('./public/privacy');

// My Owner routes
const ownerFieldRoutes = require('./owner/fieldRoutes');
const ownerServiceRoutes = require('./owner/serviceRoutes');

const router = express.Router();

router.use('/api/auth/admin', authAdminRoutes);
router.use('/api/auth/user', authUserRoutes);
router.use('/api/admin', adminProfileRoutes);
router.use('/api/admin', adminAccountRoutes);
router.use('/api/admin', adminReportRoutes);
router.use('/api/user', userProfileRoutes);
router.use('/api/wallets', walletRoutes);
router.use('/api/fields', fieldsRoutes);
router.use('/api/bookings', bookingRoutes);
router.use('/api/services', serviceRoutes);

router.use('/api/manager', managerRoutes);
router.use('/api/owner', ownerRoutes);
router.use('/api/banners', publicBannersRoutes);
router.use('/api/privacy', publicPrivacyRoutes);

// Owner routes (specific additions)
router.use('/api/owner/fields', ownerFieldRoutes);
router.use('/api/owner/services', ownerServiceRoutes);

module.exports = router;
