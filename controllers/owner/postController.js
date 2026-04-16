/**
 * postController.js (Owner)
 * HTTP handlers for owner post create/update.
 */

const postService = require('../../services/owner/postService');

/**
 * createPost
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function createPost(req, res) {
  const ownerId = req.user?.sub;

  const payload = {
    ...req.body,
    files: req.files,
  };

  const { status, body } = await postService.createOwnerPost(ownerId, payload);
  return res.status(status).json(body);
}

/**
 * listMyPosts
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function listMyPosts(req, res) {
  const ownerId = req.user?.sub;
  const items = await postService.listMyPosts(ownerId);
  return res.status(200).json({ items });
}

/**
 * updateMyPost
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function updateMyPost(req, res) {
  const ownerId = req.user?.sub;
  const { id } = req.params;

  const payload = {
    ...req.body,
    files: req.files,
  };

  const { status, body } = await postService.updateMyPost(ownerId, id, payload);
  return res.status(status).json(body);
}

module.exports = {
  createPost,
  listMyPosts,
  updateMyPost,
};
