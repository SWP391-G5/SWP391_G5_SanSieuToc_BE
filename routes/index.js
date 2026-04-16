const express = require('express');

const authAdminRoutes = require('./admin/auth');
const authUserRoutes = require('./user/auth');
const userProfileRoutes = require('./user/profile');
const walletRoutes = require('./wallet');
const fieldsRoutes = require('./fields');

const router = express.Router();

router.use('/api/auth/admin', authAdminRoutes);
router.use('/api/auth/user', authUserRoutes);
router.use('/api/user', userProfileRoutes);
router.use('/api/wallets', walletRoutes);
router.use('/api/fields', fieldsRoutes);

module.exports = router;
