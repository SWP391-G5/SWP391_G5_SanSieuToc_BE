const authService = require('../../services/user/authService');

async function login(req, res) {
  const { status, body } = await authService.login(req.body);
  return res.status(status).json(body);
}

async function registerCustomer(req, res) {
  const { status, body } = await authService.registerCustomer(req.body);
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

async function forgotPassword(req, res) {
  const { status, body } = await authService.forgotPassword(req.body);
  return res.status(status).json(body);
}

module.exports = {
  login,
  registerCustomer,
  verifyEmail,
  resendVerification,
  forgotPassword,
};
