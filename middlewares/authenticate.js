const { verifyAccessToken } = require('../utils/jwt');
const mongoose = require('mongoose');
const AdminAccount = require('../models/AdminAccount');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized - No bearer token' });
  }

  const token = header.slice('Bearer '.length).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized - Invalid token: ' + e.message });
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

  // Backward compatible mapping: many parts of the codebase expect `_id`.
  // JWT uses `sub` by convention.
  if (req.user && !req.user._id && req.user.sub) {
    req.user._id = req.user.sub;
  }

  return next();
}

module.exports = authenticate;
