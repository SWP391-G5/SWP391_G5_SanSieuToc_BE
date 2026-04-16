const express = require('express');

const authAdminRoutes = require('./admin/auth');
const authUserRoutes = require('./user/auth');
const adminProfileRoutes = require('./admin/profile');
const userProfileRoutes = require('./user/profile');

const managerRoutes = require('./manager');
const ownerRoutes = require('./owner');

const router = express.Router();

router.use('/api/auth/admin', authAdminRoutes);
router.use('/api/auth/user', authUserRoutes);
router.use('/api/admin', adminProfileRoutes);
router.use('/api/user', userProfileRoutes);

router.use('/api/manager', managerRoutes);
router.use('/api/owner', ownerRoutes);

module.exports = router;
