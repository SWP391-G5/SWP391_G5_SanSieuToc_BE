const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authenticate = require('../middlewares/authenticate');
const { upload } = require('../utils/upload/multerMemory');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

// Shared endpoint for both Manager & Owner drafts:
// - Requires login
// - Accepts multipart: images[]
router.post('/images', authenticate, upload.array('images', 6), asyncHandler(uploadController.uploadImages));

module.exports = router;
