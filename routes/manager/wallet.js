const express = require('express');
const router = express.Router();
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const { getMyWallet, getMyTransactions, getRevenueSummary } = require('../../controllers/manager/walletController');

router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Manager']));

router.get('/', getMyWallet);
router.get('/transactions', getMyTransactions);
router.get('/revenue', getRevenueSummary);

module.exports = router;