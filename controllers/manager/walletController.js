const { getManagerWallet, getManagerTransactions, getManagerRevenueSummary } = require('../../services/manager/walletService');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');

function formatVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount || 0);
}

exports.getMyWallet = async (req, res) => {
  try {
    console.log('getMyWallet controller called, user:', req.user);
    const managerId = req.user.sub || req.user.id || req.user._id;
    console.log('managerId:', managerId);
    
    if (!managerId) {
      return res.status(400).json({ message: 'No manager ID found' });
    }
    
    const wallet = await getManagerWallet(managerId);
    console.log('wallet result:', wallet);
    return res.json({ wallet });
  } catch (err) {
    console.error('getMyWallet error:', err);
    return res.status(500).json({ message: err.message });
  }
};

exports.getMyTransactions = async (req, res) => {
  try {
    const managerId = req.user.sub || req.user.id || req.user._id;
    const { limit } = req.query;
    const transactions = await getManagerTransactions(managerId, parseInt(limit) || 20);
    return res.json({ transactions });
  } catch (err) {
    console.error('getMyTransactions error:', err);
    return res.status(500).json({ message: err.message });
  }
};

exports.getRevenueSummary = async (req, res) => {
  try {
    const managerId = req.user.sub || req.user.id || req.user._id;
    const { startDate, endDate } = req.query;
    const summary = await getManagerRevenueSummary(managerId, startDate, endDate);
    return res.json(summary);
  } catch (err) {
    console.error('getRevenueSummary error:', err);
    return res.status(500).json({ message: err.message });
  }
};

exports.createWithdrawRequest = async (req, res) => {
  try {
    const managerId = req.user.sub || req.user.id || req.user._id;
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

    const wallet = await getManagerWallet(managerId);
    if (wallet.balance < withdrawAmount) {
      return res.status(400).json({ message: 'Số dư không đủ' });
    }

    const balanceBefore = wallet.balance;
    wallet.balance -= withdrawAmount;
    await wallet.save();

    await Transaction.create({
      fromWalletID: wallet._id,
      toWalletID: null,
      type: 'Withdraw',
      amount: -withdrawAmount,
      balanceBefore: balanceBefore,
      balanceAfter: wallet.balance,
      description: `Rút tiền về ${bankName} - STK: ${accountNumber}`,
      bookingType: 'field',
      ownerID: managerId,
      bankName,
      accountNumber,
      accountName,
      withdrawStatus: 'Completed',
    });

    res.json({
      success: true,
      message: `Đã rút ${formatVnd(withdrawAmount)} thành công`,
      newBalance: wallet.balance,
    });
  } catch (err) {
    console.error('createWithdrawRequest error:', err);
    return res.status(500).json({ message: err.message });
  }
};