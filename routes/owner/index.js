/**
 * routes/owner/index.js
 * Aggregates owner routes.
 */

const express = require('express');

const ownerPostsRoutes = require('./posts');
const ownerWalletRoutes = require('./wallet');

const router = express.Router();

router.use('/posts', ownerPostsRoutes);
router.use('/', ownerWalletRoutes);

module.exports = router;
