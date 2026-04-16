const profileService = require('../../services/admin/profileService');
const { uploadImageBuffer } = require('../../utils/cloudinaryConfig');

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

async function uploadAvatar(req, res) {
  if (!req.user?.sub) return res.status(401).json({ message: 'Unauthorized' });

  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ message: 'Vui lòng chọn file ảnh.' });
  }

  const imageUrl = await uploadImageBuffer(file.buffer, 'avatars/admins');
  return res.status(200).json({ imageUrl });
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
};
