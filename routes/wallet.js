const express = require('express');
const { topUpWallet } = require('../controllers/walletController');
const router = express.Router();
const authenticate = require('../middlewares/authenticate');

// Test endpoint (for debugging)
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Wallet API is working' });
});

// Top up wallet
router.post('/topup', authenticate, topUpWallet);

module.exports = router;