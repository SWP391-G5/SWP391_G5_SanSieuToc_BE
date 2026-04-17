const express = require('express');

const authAdminRoutes = require('./admin/auth');
const authUserRoutes = require('./user/auth');
const userProfileRoutes = require('./user/profile');

const managerRoutes = require('./manager');
const ownerRoutes = require('./owner');
const publicBannersRoutes = require('./public/banners');
const publicPrivacyRoutes = require('./public/privacy');

const router = express.Router();

router.use('/api/auth/admin', authAdminRoutes);
router.use('/api/auth/user', authUserRoutes);
router.use('/api/user', userProfileRoutes);

router.use('/api/manager', managerRoutes);
router.use('/api/owner', ownerRoutes);
router.use('/api/banners', publicBannersRoutes);
router.use('/api/privacy', publicPrivacyRoutes);

module.exports = router;
