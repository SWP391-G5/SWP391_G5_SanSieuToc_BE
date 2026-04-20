const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayLabel(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getIsoWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

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

async function getOwnerTransactions(ownerId, limit = 20, bookingType = null) {
  const wallet = await Wallet.findOne({ walletOwnerId: ownerId, walletOwnerModel: 'Owner' });

  if (!wallet) {
    return [];
  }

  const filter = {
    $or: [{ toWalletID: wallet._id }, { fromWalletID: wallet._id }]
  };
  if (bookingType) {
    filter.bookingType = bookingType;
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

async function getOwnerRevenueSeries(ownerId, startDate, endDate, interval = 'day', bookingType = null) {
  const wallet = await Wallet.findOne({ walletOwnerId: ownerId, walletOwnerModel: 'Owner' });

  if (!wallet) {
    return { interval, series: [] };
  }

  const rangeEnd = endDate ? endOfDay(new Date(endDate)) : endOfDay(new Date());
  let rangeStart;

  if (startDate) {
    rangeStart = startOfDay(new Date(startDate));
  } else if (interval === 'week') {
    const d = new Date(rangeEnd);
    d.setDate(d.getDate() - 7 * 7);
    rangeStart = startOfDay(d);
  } else {
    const d = new Date(rangeEnd);
    d.setDate(d.getDate() - 6);
    rangeStart = startOfDay(d);
  }

  const match = {
    toWalletID: wallet._id,
    createdAt: { $gte: rangeStart, $lte: rangeEnd },
  };

  if (bookingType) {
    match.bookingType = bookingType;
  }

  const groupId = interval === 'week'
    ? { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } }
    : {
      date: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: '$createdAt',
          timezone: DEFAULT_TIMEZONE,
        },
      },
    };

  const results = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupId,
        total: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.date': 1, '_id.year': 1, '_id.week': 1 } },
  ]);

  const totalsByKey = new Map();

  if (interval === 'week') {
    for (const row of results) {
      const key = `${row._id.year}-W${String(row._id.week).padStart(2, '0')}`;
      totalsByKey.set(key, row.total || 0);
    }

    const series = [];
    const cursor = startOfDay(rangeStart);
    const end = endOfDay(rangeEnd);

    while (cursor <= end) {
      const weekYear = getIsoWeekYear(cursor);
      const weekNumber = getIsoWeek(cursor);
      const key = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
      if (!series.find((s) => s.key === key)) {
        series.push({
          key,
          label: `W${String(weekNumber).padStart(2, '0')}`,
          total: totalsByKey.get(key) || 0,
        });
      }
      cursor.setDate(cursor.getDate() + 7);
    }

    return { interval, series };
  }

  for (const row of results) {
    const key = row._id.date;
    totalsByKey.set(key, row.total || 0);
  }

  const series = [];
  const cursor = startOfDay(rangeStart);
  const end = endOfDay(rangeEnd);

  while (cursor <= end) {
    const key = formatDayKey(cursor);
    series.push({
      key,
      label: formatDayLabel(cursor),
      total: totalsByKey.get(key) || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return { interval, series };
}
module.exports = {
  getOwnerWallet,
  getOwnerTransactions,
  getOwnerRevenueSummary,
  getOwnerRevenueSeries,
};