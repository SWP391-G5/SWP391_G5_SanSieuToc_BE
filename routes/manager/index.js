/**
 * routes/manager/index.js
 * Aggregates manager routes.
 */

const express = require('express');

const managerPostsRoutes = require('./posts');
const managerBannersRoutes = require('./banners');
const managerPrivacyRoutes = require('./privacy');
<<<<<<< HEAD
const managerStatisticsRoutes = require('./statistics');
const managerScopeRoutes = require('./scope');
const managerFeedbackRoutes = require('./feedback');
=======
const managerWalletRoutes = require('./wallet');
>>>>>>> 4289000de5c7a212e9f003071a94b664423d021d

const router = express.Router();

router.use('/posts', managerPostsRoutes);
router.use('/banners', managerBannersRoutes);
router.use('/privacy', managerPrivacyRoutes);
<<<<<<< HEAD
router.use('/statistics', managerStatisticsRoutes);
router.use('/scope', managerScopeRoutes);
router.use('/feedback', managerFeedbackRoutes);
=======
router.use('/wallet', managerWalletRoutes);
>>>>>>> 4289000de5c7a212e9f003071a94b664423d021d

module.exports = router;
