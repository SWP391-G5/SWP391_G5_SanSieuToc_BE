const mongoose = require('mongoose');

const UserAccount = require('../../models/UserAccount');
const Role = require('../../models/Role');
const Field = require('../../models/Field');

async function getOwnerRoleId() {
  const role = await Role.findOne({ name: 'Owner' }).select('_id').lean();
  return role?._id;
}

async function listManagedOwners(managerId) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }

  const ownerRoleId = await getOwnerRoleId();
  if (!ownerRoleId) {
    return { status: 500, body: { message: 'Owner role not found.' } };
  }

  const owners = await UserAccount.find({
    roleID: ownerRoleId,
    managerID: managerId,
    status: { $ne: 'Deleted' },
  })
    .select('_id username email name phone address status createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const ownerIds = owners.map((o) => o._id);

  const fields = ownerIds.length
    ? await Field.find({ ownerID: { $in: ownerIds }, status: { $ne: 'Deleted' } })
        .select('_id fieldName fieldType address status ownerID createdAt')
        .sort({ createdAt: -1 })
        .lean()
    : [];

  const fieldsByOwner = new Map();
  for (const f of fields) {
    const k = String(f.ownerID);
    if (!fieldsByOwner.has(k)) fieldsByOwner.set(k, []);
    fieldsByOwner.get(k).push({
      id: f._id,
      fieldName: f.fieldName,
      fieldType: f.fieldType,
      address: f.address,
      status: f.status,
      createdAt: f.createdAt,
    });
  }

  const items = owners.map((o) => ({
    id: o._id,
    username: o.username,
    email: o.email,
    name: o.name,
    phone: o.phone,
    address: o.address,
    status: o.status,
    createdAt: o.createdAt,
    fieldsCount: fieldsByOwner.get(String(o._id))?.length || 0,
    fields: fieldsByOwner.get(String(o._id)) || [],
  }));

  return { status: 200, body: { items } };
}

module.exports = {
  listManagedOwners,
};
