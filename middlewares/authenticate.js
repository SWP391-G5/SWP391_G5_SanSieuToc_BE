const { verifyAccessToken } = require('../utils/jwt');
const mongoose = require('mongoose');
const AdminAccount = require('../models/AdminAccount');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  console.log('Auth Header:', header);
  
  if (!header || !header.startsWith('Bearer ')) {
    console.log('No bearer token found');
    return res.status(401).json({ message: 'Unauthorized - No bearer token' });
  }

  const token = header.slice('Bearer '.length).trim();
  console.log('Token:', token.substring(0, 20) + '...');

  let payload;
  try {
    const payload = verifyAccessToken(token);
    console.log('Token verified, payload:', payload);
    req.user = payload;
    return next();
  } catch (e) {
    console.log('Token verification failed:', e.message);
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
  return next();
}

module.exports = authenticate;
