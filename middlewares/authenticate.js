const { verifyAccessToken } = require('../utils/jwt');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  console.log('Auth Header:', header);
  
  if (!header || !header.startsWith('Bearer ')) {
    console.log('No bearer token found');
    return res.status(401).json({ message: 'Unauthorized - No bearer token' });
  }

  const token = header.slice('Bearer '.length).trim();
  console.log('Token:', token.substring(0, 20) + '...');

  try {
    const payload = verifyAccessToken(token);
    console.log('Token verified, payload:', payload);
    req.user = payload;
    return next();
  } catch (e) {
    console.log('Token verification failed:', e.message);
    return res.status(401).json({ message: 'Unauthorized - Invalid token: ' + e.message });
  }
}

module.exports = authenticate;
