/**
 * multerMemory.js
 * Multer configuration for in-memory uploads (for streaming to Cloudinary).
 */

const multer = require('multer');

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  // Allow images only
  if (!file?.mimetype || !file.mimetype.startsWith('image/')) {
    const err = new Error('Only image uploads are allowed.');
    err.status = 400;
    cb(err);
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
});

module.exports = {
  upload,
};
