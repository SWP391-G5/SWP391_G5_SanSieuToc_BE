const asyncHandler = require('../../middlewares/asyncHandler');
const profileService = require('../../services/user/profileService');

// GET /api/profile
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.sub;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Lỗi "profileService.getProfile is not a function" thường xảy ra ở đây.
  // Đảm bảo rằng đường dẫn require ở trên là chính xác và không có lỗi circular dependency.
  const { status, body } = await profileService.getProfile(userId);
  return res.status(status).json(body);
});

// PUT /api/profile
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.sub;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { status, body } = await profileService.updateProfile(userId, req.body);
  return res.status(status).json(body);
});

// POST /api/profile/change-password
const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.sub;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { status, body } = await profileService.changePassword(userId, req.body);
  return res.status(status).json(body);
});

// POST /api/profile/request-email-change
const requestEmailChange = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.sub;
  const { status, body } = await profileService.requestEmailChange(userId, req.body);
  return res.status(status).json(body);
});

// POST /api/profile/verify-email-change
const verifyEmailChange = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.user?.sub;
  const { status, body } = await profileService.verifyEmailChange(userId, req.body);
  return res.status(status).json(body);
});

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  requestEmailChange,
  verifyEmailChange,
};