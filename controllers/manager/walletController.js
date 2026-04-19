const { getManagerWallet, getManagerTransactions, getManagerRevenueSummary } = require('../../services/manager/walletService');

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