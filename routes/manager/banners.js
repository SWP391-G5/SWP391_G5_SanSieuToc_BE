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
router.use(authorize('Admin', 'Manager'));

router.get('/', bannerController.listBanners);
router.post('/', bannerController.uploadBannerImages, bannerController.createBanner);
router.put('/:id', bannerController.uploadBannerImages, bannerController.updateBanner);
router.delete('/:id', bannerController.deleteBanner);

module.exports = router;
