function authorizeRoles(allowedRoles = []) {
  return function authorize(req, res, next) {
    const role = req.user?.role;
    const roleKey = String(role || '').trim().toLowerCase();
    const allowed = (Array.isArray(allowedRoles) ? allowedRoles : []).map((r) => String(r || '').trim().toLowerCase());
    console.log('=== AUTHORIZE DEBUG ===');
    console.log('req.user:', req.user);
    console.log('role:', role);
    console.log('roleKey:', roleKey);
    console.log('allowed:', allowed);
    console.log('allowed.includes(roleKey):', allowed.includes(roleKey));
    console.log('=========================');
    if (!roleKey || !allowed.includes(roleKey)) {
      return res.status(403).json({ message: 'Forbidden - role ' + role + ' not allowed' });
    }
    return next();
  };
}

module.exports = authorizeRoles;
