const profileService = require('../../services/user/profileService');
const { uploadImageBuffer } = require('../../utils/cloudinary/uploadImageBuffer');

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

  const roleKey = String(req.user?.role || '').trim().toLowerCase();
  const folder = roleKey === 'owner' ? 'avatars/owners' : 'avatars/customers';

  const { url } = await uploadImageBuffer(file.buffer, { folder });

  const { status, body } = await profileService.updateProfile(req.user?.sub, { image: url });
  if (status !== 200) return res.status(status).json(body);

  return res.status(200).json({ ...body, imageUrl: url });
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
  uploadAvatar,
  requestEmailChange,
  verifyEmailChange,
};
