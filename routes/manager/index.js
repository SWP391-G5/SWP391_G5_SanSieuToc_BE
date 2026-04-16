/**
 * routes/manager/index.js
 * Aggregates manager routes.
 */

const express = require('express');

const managerPostsRoutes = require('./posts');

const router = express.Router();

router.use('/posts', managerPostsRoutes);

module.exports = router;
