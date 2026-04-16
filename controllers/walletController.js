const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const asyncHandler = require('../middlewares/asyncHandler');

// Top up wallet
exports.topUpWallet = asyncHandler(async (req, res) => {
    const { amount, transactionID } = req.body;
    const userId = req.user.sub || req.user.id || req.user._id; // Get user ID from token payload (sub is JWT standard)

    console.log('TopUp - userId:', userId);
    console.log('TopUp - amount:', amount);

    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    // Validate userId
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID not found in token' });
    }

    // Find or create the user's wallet
    let wallet = await Wallet.findOne({ walletOwnerId: userId, walletOwnerModel: 'UserAccount' });

    if (!wallet) {
        console.log('Wallet not found, creating new wallet for user:', userId);
        // Create wallet if it doesn't exist
        wallet = await Wallet.create({
            walletOwnerId: userId,
            walletOwnerModel: 'UserAccount',
            balance: 0,
        });
        console.log('Wallet created:', wallet);
    }

    // Update wallet balance
    const balanceBefore = wallet.balance;
    wallet.balance += parseFloat(amount);
    await wallet.save();
    console.log('Wallet balance updated:', balanceBefore, '->', wallet.balance);

    // Create a transaction record
    const transaction = await Transaction.create({
        fromWalletID: null, // No sender for top-up
        toWalletID: wallet._id,
        externalTransactionID: transactionID,
        type: 'Add Credit',
        amount: parseFloat(amount),
        balanceBefore,
        balanceAfter: wallet.balance,
        description: 'Top-up via PayPal',
    });

    console.log('Transaction created:', transaction);
    res.status(200).json({ success: true, data: { wallet, transaction } });
});