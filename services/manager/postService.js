/**
 * postService.js (Manager)
 * Business logic for Manager/Admin to manage system posts.
 *
 * Call chain: Route → Controller → Service → Model
 */

const mongoose = require('mongoose');

const Post = require('../../models/Post');

const ALLOWED_STATUSES = ['Pending', 'Posted', 'Rejected', 'Deleted'];

/**
 * parsePaging
 * Parses paging params from request query.
 *
 * @param {object} query - Express req.query
 * @returns {{page:number, limit:number, skip:number}} paging config
 */
function parsePaging(query) {
  const rawPage = Number(query?.page);
  const rawLimit = Number(query?.limit);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 20;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * buildPostListFilter
 * Builds Mongo filter for listing posts.
 *
 * @param {object} query - Express req.query
 * @returns {object} Mongo filter
 */
function buildPostListFilter(query) {
  const filter = {};

  if (query?.status && ALLOWED_STATUSES.includes(String(query.status))) {
    filter.status = String(query.status);
  }

  if (query?.ownerModel && ['UserAccount', 'AdminAccount'].includes(String(query.ownerModel))) {
    filter.postOwnerModel = String(query.ownerModel);
  }

  if (query?.ownerId && mongoose.Types.ObjectId.isValid(String(query.ownerId))) {
    filter.postOwnerID = String(query.ownerId);
  }

  if (query?.q) {
    const keyword = String(query.q).trim();
    if (keyword) {
      filter.$or = [
        { postName: { $regex: keyword, $options: 'i' } },
        { postContent: { $regex: keyword, $options: 'i' } },
      ];
    }
  }

  return filter;
}

/**
 * listPosts
 * Lists all posts in the system (manager view).
 *
 * @param {object} query - Express req.query
 * @returns {Promise<{items:any[], pagination:{page:number,limit:number,total:number}}>}
 */
async function listPosts(query) {
  try {
    const { page, limit, skip } = parsePaging(query);
    const filter = buildPostListFilter(query);

    const [items, total] = await Promise.all([
      Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments(filter),
    ]);

    return { items, pagination: { page, limit, total } };
  } catch (error) {
    console.error('[manager.postService.listPosts] Failed:', error.message);
    throw error;
  }
}

/**
 * createManagerPost
 * Creates a new post by Manager/Admin. Status is always "Posted".
 *
 * @param {string} adminId - AdminAccount _id
 * @param {{postName:string, postContent?:string, postImage?:string[]}} payload - post input
 * @returns {Promise<any>} created post
 */
async function createManagerPost(adminId, payload) {
  try {
    const postName = String(payload?.postName || '').trim();
    const postContent = String(payload?.postContent || '').trim();

    // Multipart upload (preferred): uploaded files are in payload.files (from multer)
    const files = Array.isArray(payload?.files) ? payload.files : [];

    if (!postName) {
      return { status: 400, body: { message: 'postName is required.' } };
    }

    const uploadedUrls = [];
    if (files.length > 0) {
      const { uploadImageBuffer } = require('../../utils/cloudinary/uploadImageBuffer');

      for (const file of files.slice(0, 6)) {
        if (!file?.buffer) continue;
        const { url } = await uploadImageBuffer(file.buffer, { folder: 'san-sieu-toc/posts' });
        uploadedUrls.push(url);
      }
    }

    const created = await Post.create({
      postOwnerModel: 'AdminAccount',
      postOwnerID: adminId,
      postName,
      postContent,
      postImage: uploadedUrls,
      status: 'Posted',
    });

    return { status: 201, body: created };
  } catch (error) {
    console.error('[manager.postService.createManagerPost] Failed:', error.message);
    throw error;
  }
}

/**
 * approveOwnerPost
 * Approves an owner post (Pending -> Posted).
 *
 * @param {string} postId - Post _id
 * @returns {Promise<{status:number, body:any}>}
 */
async function approveOwnerPost(postId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(postId))) {
      return { status: 400, body: { message: 'Invalid post id.' } };
    }

    const post = await Post.findById(postId);
    if (!post || post.status === 'Deleted') {
      return { status: 404, body: { message: 'Post not found.' } };
    }

    if (post.postOwnerModel !== 'UserAccount') {
      return { status: 400, body: { message: 'Only owner posts can be approved.' } };
    }

    if (post.status !== 'Pending') {
      return { status: 400, body: { message: 'Only Pending posts can be approved.' } };
    }

    post.status = 'Posted';
    await post.save();

    return { status: 200, body: post };
  } catch (error) {
    console.error('[manager.postService.approveOwnerPost] Failed:', error.message);
    throw error;
  }
}

/**
 * updateManagerOwnedPost
 * Manager edits only posts that they created.
 *
 * @param {string} adminId - AdminAccount _id
 * @param {string} postId - Post _id
 * @param {{postName?:string, postContent?:string, postImage?:string[]}} payload - updated fields
 * @returns {Promise<{status:number, body:any}>}
 */
async function updateManagerOwnedPost(adminId, postId, payload) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(postId))) {
      return { status: 400, body: { message: 'Invalid post id.' } };
    }

    const post = await Post.findById(postId);
    if (!post || post.status === 'Deleted') {
      return { status: 404, body: { message: 'Post not found.' } };
    }

    if (post.postOwnerModel !== 'AdminAccount' || String(post.postOwnerID) !== String(adminId)) {
      return { status: 403, body: { message: 'You can only edit your own manager posts.' } };
    }

    if (typeof payload?.postName === 'string') {
      const nextName = payload.postName.trim();
      if (!nextName) {
        return { status: 400, body: { message: 'postName cannot be empty.' } };
      }
      post.postName = nextName;
    }

    if (typeof payload?.postContent === 'string') {
      post.postContent = payload.postContent.trim();
    }

    const files = Array.isArray(payload?.files) ? payload.files : null;
    if (files) {
      const uploadedUrls = [];
      const { uploadImageBuffer } = require('../../utils/cloudinary/uploadImageBuffer');

      for (const file of files.slice(0, 6)) {
        if (!file?.buffer) continue;
        const { url } = await uploadImageBuffer(file.buffer, { folder: 'san-sieu-toc/posts' });
        uploadedUrls.push(url);
      }

      post.postImage = uploadedUrls;
    }

    await post.save();
    return { status: 200, body: post };
  } catch (error) {
    console.error('[manager.postService.updateManagerOwnedPost] Failed:', error.message);
    throw error;
  }
}

/**
 * softDeletePost
 * Soft deletes a post by setting status to "Deleted".
 *
 * @param {string} postId - Post _id
 * @returns {Promise<{status:number, body:any}>}
 */
async function softDeletePost(postId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(postId))) {
      return { status: 400, body: { message: 'Invalid post id.' } };
    }

    const post = await Post.findById(postId);
    if (!post) {
      return { status: 404, body: { message: 'Post not found.' } };
    }

    post.status = 'Deleted';
    await post.save();

    return { status: 200, body: post };
  } catch (error) {
    console.error('[manager.postService.softDeletePost] Failed:', error.message);
    throw error;
  }
}

module.exports = {
  listPosts,
  createManagerPost,
  approveOwnerPost,
  updateManagerOwnedPost,
  softDeletePost,
};
