/**
 * postService.js (Owner)
 * Business logic for Owner to create/update their own posts.
 *
 * Rule:
 * - Owner creates post => Pending
 * - Owner updates their own post => becomes Pending again (requires re-approval)
 */

const mongoose = require('mongoose');

const Post = require('../../models/Post');

/**
 * createOwnerPost
 * Creates a new Pending post owned by UserAccount (Owner).
 *
 * @param {string} ownerId - UserAccount _id
 * @param {{postName:string, postContent?:string, postImage?:string[]}} payload - post input
 * @returns {Promise<{status:number, body:any}>}
 */
async function createOwnerPost(ownerId, payload) {
  try {
    const postName = String(payload?.postName || '').trim();
    const postContent = String(payload?.postContent || '').trim();

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
      postOwnerModel: 'UserAccount',
      postOwnerID: ownerId,
      postName,
      postContent,
      postImage: uploadedUrls,
      status: 'Pending',
    });

    return { status: 201, body: created };
  } catch (error) {
    console.error('[owner.postService.createOwnerPost] Failed:', error.message);
    throw error;
  }
}

/**
 * listMyPosts
 * Lists posts of the current owner.
 *
 * @param {string} ownerId - UserAccount _id
 * @returns {Promise<any[]>} list of posts sorted by latest
 */
async function listMyPosts(ownerId) {
  try {
    const items = await Post.find({ postOwnerModel: 'UserAccount', postOwnerID: ownerId, status: { $ne: 'Deleted' } })
      .sort({ createdAt: -1 })
      .lean();
    return items;
  } catch (error) {
    console.error('[owner.postService.listMyPosts] Failed:', error.message);
    throw error;
  }
}

/**
 * updateMyPost
 * Owner updates their own post. After update, status is reset to Pending.
 *
 * @param {string} ownerId - UserAccount _id
 * @param {string} postId - Post _id
 * @param {{postName?:string, postContent?:string, postImage?:string[]}} payload - update input
 * @returns {Promise<{status:number, body:any}>}
 */
async function updateMyPost(ownerId, postId, payload) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(postId))) {
      return { status: 400, body: { message: 'Invalid post id.' } };
    }

    const post = await Post.findById(postId);
    if (!post || post.status === 'Deleted') {
      return { status: 404, body: { message: 'Post not found.' } };
    }

    if (post.postOwnerModel !== 'UserAccount' || String(post.postOwnerID) !== String(ownerId)) {
      return { status: 403, body: { message: 'You can only edit your own posts.' } };
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

    // If owner wants to change images, re-upload with multipart form-data images[]
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

    // Re-approval is required after any owner update
    post.status = 'Pending';

    await post.save();
    return { status: 200, body: post };
  } catch (error) {
    console.error('[owner.postService.updateMyPost] Failed:', error.message);
    throw error;
  }
}

module.exports = {
  createOwnerPost,
  listMyPosts,
  updateMyPost,
};
