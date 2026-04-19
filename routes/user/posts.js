const express = require('express');
const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const postController = require('../../controllers/user/postController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Customer', 'Owner']));

router.post('/', asyncHandler(postController.createPost));
router.get('/my-posts', asyncHandler(postController.getMyPosts));

module.exports = router;
