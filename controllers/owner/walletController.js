const { getOwnerWallet, getOwnerTransactions, getOwnerRevenueSummary } = require('../../services/owner/walletService');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
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
  const { limit, bookingType, type } = req.query;

  const transactions = await getOwnerTransactions(ownerId, parseInt(limit) || 20, type, bookingType);

  const formatted = transactions.map(t => ({
    id: t._id,
    type: t.type,
    amount: t.amount,
    balanceBefore: t.balanceBefore,
    balanceAfter: t.balanceAfter,
    description: t.description,
    bookingID: t.bookingID,
    createdAt: t.createdAt,
    withdrawStatus: t.withdrawStatus,
    scheduledAt: t.scheduledAt,
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

  if (!accountNumber || !/^\d{1,15}$/.test(accountNumber)) {
    return res.status(400).json({ message: 'Số tài khoản tối đa 15 chữ số' });
  }

  if (!accountName || /\d/.test(accountName)) {
    return res.status(400).json({ message: 'Tên người thụ hưởng không được chứa số' });
  }

  const withdrawAmount = Number(amount);
  const MIN_AMOUNT = 100000;
  const MAX_AMOUNT = 10000000;

  if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
    return res.status(400).json({ message: 'Vui lòng nhập số tiền hợp lệ' });
  }
  if (withdrawAmount < MIN_AMOUNT) {
    return res.status(400).json({ message: `Số tiền tối thiểu là ${MIN_AMOUNT.toLocaleString('vi-VN')} VND` });
  }
  if (withdrawAmount > MAX_AMOUNT) {
    return res.status(400).json({ message: `Số tiền tối đa là ${MAX_AMOUNT.toLocaleString('vi-VN')} VND` });
  }

  const wallet = await getOwnerWallet(ownerId);
  if (wallet.balance < withdrawAmount) {
    return res.status(400).json({ message: 'Số dư không đủ' });
  }

  // Không trừ tiền ngay, chỉ tạo yêu cầu chờ 24h
  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 tiếng sau

  const transaction = await Transaction.create({
    fromWalletID: wallet._id,
    toWalletID: null,
    type: 'Withdraw',
    amount: -withdrawAmount,
    balanceBefore: wallet.balance,
    balanceAfter: wallet.balance, // chưa trừ
    description: `Rút tiền về ${bankName} - STK: ${accountNumber}`,
    bookingType: 'field',
    ownerID: ownerId,
    bankName,
    accountNumber,
    accountName,
    withdrawStatus: 'Pending',
    scheduledAt: scheduledAt,
  });

  res.json({
    success: true,
    message: `Yêu cầu rút ${formatVnd(withdrawAmount)} đang chờ xử lý. Sẽ hoàn tất sau 24 tiếng.`,
    transaction: transaction,
    newBalance: wallet.balance,
  });
});