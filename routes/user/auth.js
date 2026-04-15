const express = require('express');
const asyncHandler = require('../../middlewares/asyncHandler');
const authUserController = require('../../controllers/user/authController');

const router = express.Router();

router.post('/login', asyncHandler(authUserController.login));
router.post('/register', asyncHandler(authUserController.registerCustomer));
router.post('/verify-email', asyncHandler(authUserController.verifyEmail));
router.post('/resend-verification', asyncHandler(authUserController.resendVerification));
router.post('/forgot-password', asyncHandler(authUserController.forgotPassword));

module.exports = router;
