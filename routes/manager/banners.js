/**
 * banners.js
 * Manager/Admin Banner management routes.
 */

const express = require('express');

const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');

const bannerController = require('../../controllers/manager/bannerController');

const router = express.Router();

router.use(authenticate);
// NOTE: Some deployments log in as Owner to access the manager UI.
// Allow listing for Owner to avoid hard 403s, but keep mutations restricted.
router.get('/', authorize('Admin', 'Manager', 'Owner'), bannerController.listBanners);
router.post('/', authorize('Admin', 'Manager'), bannerController.uploadBannerImages, bannerController.createBanner);
router.put('/:id', authorize('Admin', 'Manager'), bannerController.uploadBannerImages, bannerController.updateBanner);
router.delete('/:id', authorize('Admin', 'Manager'), bannerController.deleteBanner);

module.exports = router;
