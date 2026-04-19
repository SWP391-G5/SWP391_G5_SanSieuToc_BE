function authorizeRoles(...allowedRoles) {
  // Support both usages:
  // - authorize('Admin', 'Manager')
  // - authorize(['Admin', 'Manager'])
  const roles =
    allowedRoles.length === 1 && Array.isArray(allowedRoles[0]) ? allowedRoles[0] : allowedRoles;

  return function authorize(req, res, next) {
    const role = req.user?.role;
    const roleKey = String(role || '').trim().toLowerCase();
    const allowed = (Array.isArray(roles) ? roles : [])
      .map((r) => String(r || '').trim().toLowerCase())
      .filter(Boolean);

    if (!roleKey || !allowed.includes(roleKey)) {
      const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (!isProd) {
        return res.status(403).json({
          message: 'Forbidden',
          debug: {
            role,
            roleKey,
            allowed,
            url: req.originalUrl,
            accountType: req.user?.accountType,
          },
        });
      }
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}

module.exports = authorizeRoles;
