/**
 * routes/manager/posts.js
 * Manager/Admin routes for system post management.
 */

const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const postController = require('../../controllers/manager/postController');
const { upload } = require('../../utils/upload/multerMemory');

const router = express.Router();

// Auth: AdminAccount only (Admin/Manager)
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Manager']));

router.get('/', asyncHandler(postController.listPosts));

// Multipart form-data (preferred): images[]
router.post('/', upload.array('images', 6), asyncHandler(postController.createPost));
router.patch('/:id/approve', asyncHandler(postController.approvePost));
router.patch('/:id/reject', asyncHandler(postController.rejectPost));
router.put('/:id', upload.array('images', 6), asyncHandler(postController.updatePost));
router.delete('/:id', asyncHandler(postController.deletePost));

module.exports = router;
