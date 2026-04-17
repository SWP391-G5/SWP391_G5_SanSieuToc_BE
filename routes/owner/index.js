/**
 * routes/owner/index.js
 * Aggregates owner routes.
 */

const express = require('express');

const ownerPostsRoutes = require('./posts');

const router = express.Router();

router.use('/posts', ownerPostsRoutes);

module.exports = router;
