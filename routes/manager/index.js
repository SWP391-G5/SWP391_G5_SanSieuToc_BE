/**
 * routes/manager/index.js
 * Aggregates manager routes.
 */

const express = require('express');

const managerPostsRoutes = require('./posts');
const managerBannersRoutes = require('./banners');
const managerPrivacyRoutes = require('./privacy');
const managerWalletRoutes = require('./wallet');

const router = express.Router();

router.use('/posts', managerPostsRoutes);
router.use('/banners', managerBannersRoutes);
router.use('/privacy', managerPrivacyRoutes);
router.use('/wallet', managerWalletRoutes);

module.exports = router;
