/**
 * privacyController.js (Manager)
 * HTTP handlers for privacy policy CRUD.
 */

const privacyService = require('../../services/manager/privacyService');

async function listPrivacies(req, res) {
  const result = await privacyService.listPrivacies(req.query);
  return res.status(200).json(result);
}

async function createPrivacy(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await privacyService.createPrivacy(managerId, req.body);
  return res.status(status).json(body);
}

async function updatePrivacy(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await privacyService.updatePrivacy(managerId, req.params.id, req.body);
  return res.status(status).json(body);
}

async function deletePrivacy(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await privacyService.deletePrivacy(managerId, req.params.id);
  return res.status(status).json(body);
}

module.exports = {
  listPrivacies,
  createPrivacy,
  updatePrivacy,
  deletePrivacy,
};
