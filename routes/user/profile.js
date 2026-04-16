const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const profileController = require('../../controllers/user/profileController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Owner', 'Customer']));

router.get('/profile', asyncHandler(profileController.getProfile));
router.put('/profile', asyncHandler(profileController.updateProfile));
router.put('/profile/password', asyncHandler(profileController.changePassword));

router.post('/profile/email/request', asyncHandler(profileController.requestEmailChange));
router.post('/profile/email/verify', asyncHandler(profileController.verifyEmailChange));

module.exports = router;
