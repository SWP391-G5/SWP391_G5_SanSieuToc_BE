/**
 * routes/manager/index.js
 * Aggregates manager routes.
 */

const express = require('express');

const managerPostsRoutes = require('./posts');
const managerBannersRoutes = require('./banners');
const managerPrivacyRoutes = require('./privacy');
const managerStatisticsRoutes = require('./statistics');
const managerScopeRoutes = require('./scope');
const managerFeedbackRoutes = require('./feedback');

const router = express.Router();

router.use('/posts', managerPostsRoutes);
router.use('/banners', managerBannersRoutes);
router.use('/privacy', managerPrivacyRoutes);
router.use('/statistics', managerStatisticsRoutes);
router.use('/scope', managerScopeRoutes);
router.use('/feedback', managerFeedbackRoutes);

module.exports = router;
