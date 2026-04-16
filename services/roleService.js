const Role = require('../models/Role');

const DEFAULT_ROLES = ['Admin', 'Manager', 'Owner', 'Customer'];

function toTitleRole(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n === 'admin') return 'Admin';
  if (n === 'manager') return 'Manager';
  if (n === 'owner') return 'Owner';
  if (n === 'customer') return 'Customer';
  return '';
}

async function ensureDefaultRoles() {
  await Promise.all(
    DEFAULT_ROLES.map(async (roleName) => {
      const existing = await Role.findOne({ name: new RegExp(`^${roleName}$`, 'i') });
      if (existing) {
        const normalized = toTitleRole(existing.name);
        if (normalized && existing.name !== normalized) {
          existing.name = normalized;
          await existing.save();
        }
        return;
      }
      await Role.create({ name: roleName });
    })
  );
}

module.exports = {
  ensureDefaultRoles,
  DEFAULT_ROLES,
};
