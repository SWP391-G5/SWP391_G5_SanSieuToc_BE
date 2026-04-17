const express = require('express');
const multer = require('multer');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const profileController = require('../../controllers/admin/profileController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const type = String(file?.mimetype || '').toLowerCase();
    if (!type.startsWith('image/')) return cb(new Error('INVALID_FILE_TYPE'));
    return cb(null, true);
  },
});

function uploadSingleImage(fieldName) {
  return function uploadMiddleware(req, res, next) {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Ảnh tối đa 5MB.' });
      }

      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ message: 'Vui lòng chọn file ảnh hợp lệ.' });
      }

      return res.status(400).json({ message: 'Upload ảnh thất bại.' });
    });
  };
}

router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Manager']));

router.get('/profile', asyncHandler(profileController.getProfile));
router.put('/profile', asyncHandler(profileController.updateProfile));
router.put('/profile/password', asyncHandler(profileController.changePassword));

router.post('/profile/avatar', uploadSingleImage('image'), asyncHandler(profileController.uploadAvatar));

// Managers must verify email change
router.post('/profile/email/request', authorizeRoles(['Manager']), asyncHandler(profileController.requestEmailChange));
router.post('/profile/email/verify', authorizeRoles(['Manager']), asyncHandler(profileController.verifyEmailChange));

module.exports = router;
