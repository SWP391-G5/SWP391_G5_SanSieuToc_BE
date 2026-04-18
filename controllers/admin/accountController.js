const accountService = require('../../services/admin/accountService');

async function listManagers(req, res) {
  const { status, body } = await accountService.listManagers();
  return res.status(status).json(body);
}

async function createManager(req, res) {
  const { status, body } = await accountService.createManager(req.body);
  return res.status(status).json(body);
}

async function deactivateManager(req, res) {
  const { status, body } = await accountService.deactivateManager(req.params?.id);
  return res.status(status).json(body);
}

async function deleteManager(req, res) {
  const { status, body } = await accountService.deleteManager(req.params?.id);
  return res.status(status).json(body);
}

async function restoreManager(req, res) {
  const { status, body } = await accountService.restoreManager(req.params?.id);
  return res.status(status).json(body);
}

async function listOwners(req, res) {
  const { status, body } = await accountService.listOwners();
  return res.status(status).json(body);
}

async function createOwner(req, res) {
  const { status, body } = await accountService.createOwner(req.body);
  return res.status(status).json(body);
}

async function deactivateOwner(req, res) {
  const { status, body } = await accountService.deactivateOwner(req.params?.id);
  return res.status(status).json(body);
}

async function listCustomers(req, res) {
  const { status, body } = await accountService.listCustomers();
  return res.status(status).json(body);
}

async function banCustomer(req, res) {
  const { status, body } = await accountService.banCustomer(req.params?.id);
  return res.status(status).json(body);
}

async function unbanCustomer(req, res) {
  const { status, body } = await accountService.unbanCustomer(req.params?.id);
  return res.status(status).json(body);
}

module.exports = {
  listManagers,
  createManager,
  deactivateManager,
  deleteManager,
  restoreManager,
  listOwners,
  createOwner,
  deactivateOwner,
  listCustomers,
  banCustomer,
  unbanCustomer,
};
