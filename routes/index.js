const express = require('express');

const authAdminRoutes = require('./admin/auth');
const authUserRoutes = require('./user/auth');
const userProfileRoutes = require('./user/profile');
const walletRoutes = require('./wallet');
const fieldsRoutes = require('./fields');
const bookingRoutes = require('./bookings');

const managerRoutes = require('./manager');
const ownerRoutes = require('./owner');
const publicBannersRoutes = require('./public/banners');

const router = express.Router();

router.use('/api/auth/admin', authAdminRoutes);
router.use('/api/auth/user', authUserRoutes);
router.use('/api/user', userProfileRoutes);
router.use('/api/wallets', walletRoutes);
router.use('/api/fields', fieldsRoutes);
router.use('/api/bookings', bookingRoutes);

router.use('/api/manager', managerRoutes);
router.use('/api/owner', ownerRoutes);
router.use('/api/banners', publicBannersRoutes);

module.exports = router;
