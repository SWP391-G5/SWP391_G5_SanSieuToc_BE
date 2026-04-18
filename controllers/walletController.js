const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const UserAccount = require('../models/UserAccount');
const asyncHandler = require('../middlewares/asyncHandler');
const { isEmailConfigured, sendWalletTopupEmail } = require('../utils/mailer');

function formatVnd(amount) {
    return new Intl.NumberFormat('vi-VN').format(amount || 0);
}

// Get user's transaction history
exports.getMyTransactions = asyncHandler(async (req, res) => {
    const userId = req.user.sub || req.user.id || req.user._id;

    const wallet = await Wallet.findOne({ walletOwnerId: userId, walletOwnerModel: 'UserAccount' });

    if (!wallet) {
        return res.json({ transactions: [], walletBalance: 0 });
    }

    const transactions = await Transaction.find({
        $or: [
            { toWalletID: wallet._id },
            { fromWalletID: wallet._id }
        ]
    })
    .sort({ createdAt: -1 })
    .lean();

    const formattedTransactions = transactions.map(t => ({
        id: t._id,
        type: t.type,
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        description: t.description,
        externalTransactionID: t.externalTransactionID,
        bookingID: t.bookingID,
        bookingType: t.bookingType,
        createdAt: t.createdAt,
        isCredit: t.toWalletID?.toString() === wallet._id.toString(),
        isDebit: t.fromWalletID?.toString() === wallet._id.toString()
    }));

    res.json({
        transactions: formattedTransactions,
        walletBalance: wallet.balance
    });
});

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

    // Send email notification
    const user = await UserAccount.findById(userId);
    if (user && isEmailConfigured()) {
        try {
            await sendWalletTopupEmail({
                to: user.email,
                name: user.name,
                amount: formatVnd(parseFloat(amount)),
                balance: formatVnd(wallet.balance),
                transactionId: transaction._id.toString(),
            });
            console.log('Topup email sent to:', user.email);
        } catch (emailErr) {
            console.error('Failed to send topup email:', emailErr.message);
        }
    }

    res.status(200).json({ success: true, data: { wallet, transaction } });
});