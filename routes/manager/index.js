/**
 * routes/manager/index.js
 * Aggregates manager routes.
 */

const express = require('express');

const managerPostsRoutes = require('./posts');
const managerBannersRoutes = require('./banners');

const router = express.Router();

router.use('/posts', managerPostsRoutes);
router.use('/banners', managerBannersRoutes);

module.exports = router;
