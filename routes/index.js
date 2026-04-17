const express = require('express');

const authAdminRoutes = require('./admin/auth');
const authUserRoutes = require('./user/auth');
const ownerFieldRoutes = require('./owner/fieldRoutes');
const ownerServiceRoutes = require('./owner/serviceRoutes');

const router = express.Router();

router.use('/api/auth/admin', authAdminRoutes);
router.use('/api/auth/user', authUserRoutes);

// Owner routes
router.use('/api/owner/fields', ownerFieldRoutes);
router.use('/api/owner/services', ownerServiceRoutes);

module.exports = router;
