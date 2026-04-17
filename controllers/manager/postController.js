/**
 * postController.js (Manager)
 * HTTP handlers for manager post management.
 */

const postService = require('../../services/manager/postService');

/**
 * listPosts
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function listPosts(req, res) {
  const result = await postService.listPosts(req.query);
  return res.status(200).json(result);
}

/**
 * createPost
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function createPost(req, res) {
  const adminId = req.user?.sub;

  const payload = {
    ...req.body,
    // Multer: files are available at req.files when multipart/form-data is used
    files: req.files,
  };

  const { status, body } = await postService.createManagerPost(adminId, payload);
  return res.status(status).json(body);
}

/**
 * approvePost
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function approvePost(req, res) {
  const { id } = req.params;
  const { status, body } = await postService.approveOwnerPost(id);
  return res.status(status).json(body);
}

/**
 * updatePost
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function updatePost(req, res) {
  const adminId = req.user?.sub;
  const { id } = req.params;

  const payload = {
    ...req.body,
    files: req.files,
  };

  const { status, body } = await postService.updateManagerOwnedPost(adminId, id, payload);
  return res.status(status).json(body);
}

/**
 * deletePost
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function deletePost(req, res) {
  const { id } = req.params;
  const { status, body } = await postService.softDeletePost(id);
  return res.status(status).json(body);
}

module.exports = {
  listPosts,
  createPost,
  approvePost,
  updatePost,
  deletePost,
};
