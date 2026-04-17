const express = require('express');
const { topUpWallet, getMyTransactions } = require('../controllers/walletController');
const router = express.Router();
const authenticate = require('../middlewares/authenticate');

router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Wallet API is working' });
});

router.post('/topup', authenticate, topUpWallet);
router.get('/transactions', authenticate, getMyTransactions);

module.exports = router;