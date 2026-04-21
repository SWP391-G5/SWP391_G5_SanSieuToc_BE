const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');

async function getOwnerWallet(ownerId) {
  let wallet = await Wallet.findOne({ walletOwnerId: ownerId, walletOwnerModel: 'Owner' });

  if (!wallet) {
    wallet = await Wallet.create({
      walletOwnerId: ownerId,
      walletOwnerModel: 'Owner',
      balance: 0,
    });
  }

  return wallet;
}

async function getOwnerTransactions(ownerId, limit = 20, type = null, bookingType = null) {
  if (!ownerId) return [];
  
  const wallet = await Wallet.findOne({ walletOwnerId: ownerId, walletOwnerModel: 'Owner' });
  if (!wallet) return [];

  const filter = { 
    $or: [{ toWalletID: wallet._id }, { fromWalletID: wallet._id }]
  };
  
  if (bookingType) {
    filter.bookingType = bookingType;
    filter.type = { $ne: 'Withdraw' };
  } else if (type && type !== 'All') {
    if (type.includes(',')) {
      filter.type = { $in: type.split(',') };
    } else {
      filter.type = type;
    }
  }

  const transactions = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return transactions;
}

async function getOwnerRevenueSummary(ownerId, startDate, endDate, bookingType = null) {
  const wallet = await Wallet.findOne({ walletOwnerId: ownerId, walletOwnerModel: 'Owner' });

  if (!wallet) {
    return { totalRevenue: 0, transactionCount: 0 };
  }

  const match = { toWalletID: wallet._id };

  if (startDate && endDate) {
    match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  if (bookingType) {
    match.bookingType = bookingType;
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
  getOwnerWallet,
  getOwnerTransactions,
  getOwnerRevenueSummary,
};