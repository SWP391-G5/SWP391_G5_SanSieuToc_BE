/**
 * uploadController.js
 * Shared upload endpoints (Cloudinary) for both Manager and Owner.
 */

const { uploadImageBuffer } = require('../utils/cloudinary/uploadImageBuffer');

async function uploadImages(req, res) {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ message: 'images[0] is required' });

  const urls = [];
  for (const file of files.slice(0, 6)) {
    if (!file?.buffer) continue;
    const { url } = await uploadImageBuffer(file.buffer, { folder: 'san-sieu-toc/uploads' });
    if (url) urls.push(url);
  }

  return res.status(200).json({ urls });
}

module.exports = {
  uploadImages,
};
