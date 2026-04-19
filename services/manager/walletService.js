const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const mongoose = require('mongoose');

async function getManagerWallet(managerId) {
  console.log('getManagerWallet called with:', managerId);
  try {
    if (!mongoose.isValidObjectId(managerId)) {
      console.error('Invalid managerId:', managerId);
      throw new Error('Invalid manager ID');
    }
    
    let wallet = await Wallet.findOne({ walletOwnerId: managerId, walletOwnerModel: 'AdminAccount' });
    console.log('Found wallet:', wallet);

    if (!wallet) {
      wallet = await Wallet.create({
        walletOwnerId: managerId,
        walletOwnerModel: 'AdminAccount',
        balance: 0,
      });
      console.log('Created new wallet:', wallet);
    }

    return wallet;
  } catch (err) {
    console.error('getManagerWallet error:', err);
    throw err;
  }
}

async function getManagerTransactions(managerId, limit = 20) {
  console.log('getManagerTransactions called with:', managerId, 'limit:', limit);
  try {
    if (!mongoose.isValidObjectId(managerId)) {
      console.error('Invalid managerId:', managerId);
      throw new Error('Invalid manager ID');
    }
    
    const wallet = await Wallet.findOne({ walletOwnerId: managerId, walletOwnerModel: 'AdminAccount' });
    console.log('Found wallet for transactions:', wallet);

    if (!wallet) {
      return [];
    }

    const transactions = await Transaction.find({ 
      $or: [{ toWalletID: wallet._id }, { fromWalletID: wallet._id }]
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    console.log('Found transactions:', transactions.length);

    return transactions;
  } catch (err) {
    console.error('getManagerTransactions error:', err);
    throw err;
  }
}

async function getManagerRevenueSummary(managerId, startDate, endDate) {
  const wallet = await Wallet.findOne({ walletOwnerId: managerId, walletOwnerModel: 'AdminAccount' });

  if (!wallet) {
    return { totalRevenue: 0, transactionCount: 0 };
  }

  const match = { toWalletID: wallet._id };

  if (startDate && endDate) {
    match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const [result] = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  return {
    totalRevenue: result?.totalRevenue || 0,
    transactionCount: result?.transactionCount || 0,
  };
}

module.exports = {
  getManagerWallet,
  getManagerTransactions,
  getManagerRevenueSummary,
};