const profileService = require('../../services/user/profileService');

async function getProfile(req, res) {
  const { status, body } = await profileService.getProfile(req.user?.sub);
  return res.status(status).json(body);
}

async function updateProfile(req, res) {
  const { status, body } = await profileService.updateProfile(req.user?.sub, req.body);
  return res.status(status).json(body);
}

async function changePassword(req, res) {
  const { status, body } = await profileService.changePassword(req.user?.sub, req.body);
  return res.status(status).json(body);
}

async function requestEmailChange(req, res) {
  const { status, body } = await profileService.requestEmailChange(req.user?.sub, req.body);
  return res.status(status).json(body);
}

async function verifyEmailChange(req, res) {
  const { status, body } = await profileService.verifyEmailChange(req.user?.sub, req.body);
  return res.status(status).json(body);
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  requestEmailChange,
  verifyEmailChange,
};
