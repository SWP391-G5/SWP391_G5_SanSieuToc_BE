function authorizeRoles(allowedRoles = []) {
  return function authorize(req, res, next) {
    const role = req.user?.role;
    const roleKey = String(role || '').trim().toLowerCase();
    const allowed = (Array.isArray(allowedRoles) ? allowedRoles : []).map((r) => String(r || '').trim().toLowerCase());
    if (!roleKey || !allowed.includes(roleKey)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}

module.exports = authorizeRoles;
