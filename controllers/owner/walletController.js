const { getOwnerWallet, getOwnerTransactions, getOwnerRevenueSummary } = require('../../services/owner/walletService');
const Wallet = require('../../models/Wallet');
const WithdrawRequest = require('../../models/WithdrawRequest');
const asyncHandler = require('../../middlewares/asyncHandler');

function formatVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount || 0);
}

exports.getMyWallet = asyncHandler(async (req, res) => {
  const ownerId = req.user.sub || req.user.id || req.user._id;

  const wallet = await getOwnerWallet(ownerId);

  res.json({
    wallet: {
      id: wallet._id,
      balance: wallet.balance,
      balanceFormatted: formatVnd(wallet.balance),
    },
  });
});

exports.getMyTransactions = asyncHandler(async (req, res) => {
  const ownerId = req.user.sub || req.user.id || req.user._id;
  const { limit, bookingType } = req.query;

  const transactions = await getOwnerTransactions(ownerId, parseInt(limit) || 20, bookingType);

  const formatted = transactions.map(t => ({
    id: t._id,
    type: t.type,
    amount: t.amount,
    balanceBefore: t.balanceBefore,
    balanceAfter: t.balanceAfter,
    description: t.description,
    bookingID: t.bookingID,
    createdAt: t.createdAt,
  }));

  res.json({ transactions: formatted });
});

exports.getRevenueSummary = asyncHandler(async (req, res) => {
  const ownerId = req.user.sub || req.user.id || req.user._id;
  const { startDate, endDate, bookingType } = req.query;

  const summary = await getOwnerRevenueSummary(ownerId, startDate, endDate, bookingType);

  res.json({
    summary: {
      totalRevenue: summary.totalRevenue,
      totalRevenueFormatted: formatVnd(summary.totalRevenue),
      transactionCount: summary.transactionCount,
    },
  });
});

exports.createWithdrawRequest = asyncHandler(async (req, res) => {
  const ownerId = req.user.sub || req.user.id || req.user._id;
  const { amount, bankName, accountNumber, accountName } = req.body;
  const Transaction = require('../../models/Transaction');

  if (!amount || amount < 50000) {
    return res.status(400).json({ message: 'Số tiền tối thiểu là 50,000 VND' });
  }

  const wallet = await getOwnerWallet(ownerId);
  if (wallet.balance < amount) {
    return res.status(400).json({ message: 'Số dư không đủ' });
  }

  const balanceBefore = wallet.balance;
  wallet.balance -= amount;
  await wallet.save();

  await Transaction.create({
    fromWalletID: wallet._id,
    toWalletID: null,
    type: 'Withdraw',
    amount: -amount,
    balanceBefore: balanceBefore,
    balanceAfter: wallet.balance,
    description: `Rút tiền về ${bankName} - STK: ${accountNumber}`,
    bookingType: 'field',
  });

  await WithdrawRequest.create({
    ownerID: ownerId,
    amount,
    bankName,
    accountNumber,
    accountName,
    status: 'Completed',
  });

  res.json({
    success: true,
    message: `Đã rút ${formatVnd(amount)} thành công`,
    newBalance: wallet.balance,
  });
});