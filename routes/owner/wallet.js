const express = require('express');
const { getMyWallet, getMyTransactions, getRevenueSummary, createWithdrawRequest } = require('../../controllers/owner/walletController');
const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');

const router = express.Router();

router.use(authenticate, authorizeRoles(['Owner']));

router.get('/wallet', asyncHandler(getMyWallet));
router.get('/wallet/transactions', asyncHandler(getMyTransactions));
router.get('/wallet/revenue', asyncHandler(getRevenueSummary));
router.post('/wallet/withdraw', asyncHandler(createWithdrawRequest));

module.exports = router;