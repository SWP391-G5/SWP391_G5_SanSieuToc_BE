/**
 * postService.js (Manager)
 * Business logic for Manager/Admin to manage system posts.
 *
 * Call chain: Route → Controller → Service → Model
 */

const mongoose = require('mongoose');

const Post = require('../../models/Post');
const UserAccount = require('../../models/UserAccount');

const ALLOWED_STATUSES = ['Draft', 'Pending', 'Posted', 'Rejected', 'Deleted'];

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

  // Default behavior: do not show Drafts unless explicitly requested
  if (!query?.status) {
    filter.status = { $ne: 'Draft' };
  }

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

    let sortObj = { createdAt: -1 };
    if (query?.sort === 'created_asc') sortObj = { createdAt: 1 };
    if (query?.sort === 'updated_desc') sortObj = { updatedAt: -1 };
    if (query?.sort === 'updated_asc') sortObj = { updatedAt: 1 };

    const [items, total] = await Promise.all([
      Post.find(filter).populate('postOwnerID', 'name email username').sort(sortObj).skip(skip).limit(limit).lean(),
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

    // accept pre-uploaded urls (e.g. draft images stored as urls)
    let providedUrls = [];
    if (Array.isArray(payload?.postImage)) {
      providedUrls = payload.postImage.filter(Boolean).map(String);
    } else if (typeof payload?.postImage === 'string') {
      const s = payload.postImage.trim();
      if (s) {
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) providedUrls = parsed.filter(Boolean).map(String);
          else providedUrls = [String(parsed)];
        } catch {
          // fallback comma-separated or single
          providedUrls = s.includes(',') ? s.split(',').map((x) => x.trim()).filter(Boolean) : [s];
        }
      }
    }

    // Multipart upload (preferred): uploaded files are in payload.files (from multer)
    const files = Array.isArray(payload?.files) ? payload.files : [];

    // Allow explicitly creating Draft in DB
    const requestedStatus = String(payload?.status || '').trim();
    const status = requestedStatus === 'Draft' ? 'Draft' : 'Posted';

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

    const finalUrls = [...providedUrls, ...uploadedUrls].slice(0, 6);

    const created = await Post.create({
      postOwnerModel: 'AdminAccount',
      postOwnerID: adminId,
      postName,
      postContent,
      postImage: finalUrls,
      status,
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
async function approveOwnerPost(postId, managerId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(postId))) {
      return { status: 400, body: { message: 'Invalid post id.' } };
    }

    if (!mongoose.Types.ObjectId.isValid(String(managerId))) {
      return { status: 401, body: { message: 'Unauthorized' } };
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

    // Authorization: only the assigned Manager can approve this owner's post
    const owner = await UserAccount.findById(post.postOwnerID).select('managerID roleID').lean();
    if (!owner) {
      return { status: 400, body: { message: 'Post owner not found.' } };
    }

    if (!owner.managerID || String(owner.managerID) !== String(managerId)) {
      return { status: 403, body: { message: 'You are not authorized to approve posts for this owner.' } };
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

    const postName = payload?.postName !== undefined ? String(payload.postName || '').trim() : undefined;
    const postContent = payload?.postContent !== undefined ? String(payload.postContent || '').trim() : undefined;

    let providedUrls = undefined;
    if (Array.isArray(payload?.postImage)) {
      providedUrls = payload.postImage.filter(Boolean).map(String);
    } else if (typeof payload?.postImage === 'string') {
      const s = payload.postImage.trim();
      if (s) {
        try {
          const parsed = JSON.parse(s);
          providedUrls = Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [String(parsed)];
        } catch {
          providedUrls = s.includes(',') ? s.split(',').map((x) => x.trim()).filter(Boolean) : [s];
        }
      } else {
        providedUrls = [];
      }
    }

    // allow manager to (re)save as Draft or Publish from Draft
    const requestedStatus = payload?.status !== undefined ? String(payload.status || '').trim() : undefined;
    const allowStatus = requestedStatus === 'Draft' || requestedStatus === 'Posted' ? requestedStatus : undefined;

    if (typeof postName === 'string') {
      if (!postName) {
        return { status: 400, body: { message: 'postName cannot be empty.' } };
      }
      post.postName = postName;
    }

    if (typeof postContent === 'string') {
      post.postContent = postContent;
    }

    const files = Array.isArray(payload?.files) ? payload.files : null;
    let finalUrls = providedUrls || []; // start with provided URLs if any
    
    if (files && files.length > 0) {
      const { uploadImageBuffer } = require('../../utils/cloudinary/uploadImageBuffer');

      for (const file of files) {
        // Enforce max 6 images total
        if (finalUrls.length >= 6) break;
        if (!file?.buffer) continue;
        const { url } = await uploadImageBuffer(file.buffer, { folder: 'san-sieu-toc/posts' });
        finalUrls.push(url);
      }
    }

    if (files !== null || providedUrls !== undefined) {
      post.postImage = finalUrls.slice(0, 6);
    }

    if (allowStatus) {
      post.status = allowStatus;
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
async function softDeletePost(postId, managerId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(postId))) {
      return { status: 400, body: { message: 'Invalid post id.' } };
    }

    if (!mongoose.Types.ObjectId.isValid(String(managerId))) {
      return { status: 401, body: { message: 'Unauthorized' } };
    }

    const post = await Post.findById(postId);
    if (!post) {
      return { status: 404, body: { message: 'Post not found.' } };
    }

    // Authorization:
    // - Manager/Admin posts: only owner (same AdminAccount) can delete
    // - Owner posts: only the assigned manager for that owner can delete
    if (post.postOwnerModel === 'AdminAccount') {
      if (String(post.postOwnerID) !== String(managerId)) {
        return { status: 403, body: { message: 'Bạn không có thẩm quyền xoá bài đăng của Quản lý khác.' } };
      }
    } else if (post.postOwnerModel === 'UserAccount') {
      const owner = await UserAccount.findById(post.postOwnerID).select('managerID').lean();
      if (!owner?.managerID || String(owner.managerID) !== String(managerId)) {
        return { status: 403, body: { message: 'Bạn chỉ được xoá bài đăng của Owner thuộc quyền quản lý của bạn.' } };
      }
    } else {
      return { status: 400, body: { message: 'Invalid post owner model.' } };
    }

    // Drafts should be removed permanently (hard delete)
    if (String(post.status) === 'Draft') {
      await Post.deleteOne({ _id: post._id });
      return { status: 200, body: { message: 'Draft deleted permanently.' } };
    }

    // Non-draft posts: soft delete
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
