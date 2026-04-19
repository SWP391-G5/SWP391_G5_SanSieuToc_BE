const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const wishlistController = require('../../controllers/user/wishlistController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Customer']));

router.get('/wishlist', asyncHandler(wishlistController.getMyWishlist));
router.post('/wishlist', asyncHandler(wishlistController.addWishlistItem));
router.delete('/wishlist/:fieldID', asyncHandler(wishlistController.removeWishlistItem));
router.post('/wishlist/merge', asyncHandler(wishlistController.mergeGuestWishlist));

module.exports = router;