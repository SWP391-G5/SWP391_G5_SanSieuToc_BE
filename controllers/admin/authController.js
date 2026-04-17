const authService = require('../../services/admin/authService');

async function login(req, res) {
  const { status, body } = await authService.login(req.body);
  return res.status(status).json(body);
}

async function forgotPassword(req, res) {
  const { status, body } = await authService.forgotPassword(req.body);
  return res.status(status).json(body);
}

async function verifyEmail(req, res) {
  const { status, body } = await authService.verifyEmail(req.body);
  return res.status(status).json(body);
}

async function resendVerification(req, res) {
  const { status, body } = await authService.resendVerification(req.body);
  return res.status(status).json(body);
}

module.exports = {
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
};
