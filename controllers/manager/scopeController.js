const scopeService = require('../../services/manager/managerScopeService');

async function listManagedOwners(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await scopeService.listManagedOwners(managerId);
  return res.status(status).json(body);
}

module.exports = {
  listManagedOwners,
};
