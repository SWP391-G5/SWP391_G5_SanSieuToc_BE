const { verifyAccessToken } = require('../utils/jwt');
const mongoose = require('mongoose');
const AdminAccount = require('../models/AdminAccount');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = header.slice('Bearer '.length).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Immediate revocation for soft-deleted/disabled admin accounts.
  // This ensures existing tokens stop working as soon as status changes.
  const isAdminToken = String(payload?.accountType || '').trim().toLowerCase() === 'admin';
  const isAdminRoute = String(req.originalUrl || '').startsWith('/api/admin');
  if ((isAdminToken || isAdminRoute) && mongoose.isValidObjectId(payload?.sub)) {
    try {
      const account = await AdminAccount.findById(payload.sub).select('status');
      if (!account || account.status !== 'Active') {
        return res.status(401).json({ message: 'Unauthorized' });
      }
    } catch {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  }

  req.user = payload;
  return next();
}

module.exports = authenticate;
