const express = require('express');
const asyncHandler = require('../../middlewares/asyncHandler');
const authAdminController = require('../../controllers/admin/authController');

const router = express.Router();

router.post('/login', asyncHandler(authAdminController.login));
router.post('/verify-email', asyncHandler(authAdminController.verifyEmail));
router.post('/resend-verification', asyncHandler(authAdminController.resendVerification));
router.post('/forgot-password', asyncHandler(authAdminController.forgotPassword));

module.exports = router;
