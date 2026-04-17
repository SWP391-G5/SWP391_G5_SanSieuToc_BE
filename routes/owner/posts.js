/**
 * routes/owner/posts.js
 * Owner routes for creating and managing their own posts.
 */

const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const postController = require('../../controllers/owner/postController');
const { upload } = require('../../utils/upload/multerMemory');

const router = express.Router();

// Auth: UserAccount Owner
router.use(authenticate);
router.use(authorizeRoles(['Owner']));

router.post('/', upload.array('images', 6), asyncHandler(postController.createPost));
router.get('/me', asyncHandler(postController.listMyPosts));
router.put('/:id', upload.array('images', 6), asyncHandler(postController.updateMyPost));

module.exports = router;
