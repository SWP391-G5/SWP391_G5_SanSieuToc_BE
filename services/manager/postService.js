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

// Normalize tags from request into a unique trimmed array
function normalizeTags(input) {
  if (!input) return [];

  let raw = [];
  if (Array.isArray(input)) raw = input;
  else if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return [];

    // accept JSON array string, comma-separated, or single
    try {
      const parsed = JSON.parse(s);
      raw = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      raw = s.includes(',') ? s.split(',') : [s];
    }
  } else {
    raw = [input];
  }

  const normalized = raw
    .flat()
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 10);

  // unique
  return Array.from(new Set(normalized));
}

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

  // Tag filter: ?tag=Tips or ?tags=Tips,ThongBao or ?tags=["Tips","ThongBao"]
  const tagList = normalizeTags(query?.tag || query?.tags);
  if (tagList.length > 0) {
    // match any of the requested tags
    filter.postTags = { $in: tagList };
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
 * @param {{postName:string, postContent?:string, postImage?:string[], postTags?:string[]}} payload - post input
 * @returns {Promise<any>} created post
 */
async function createManagerPost(adminId, payload) {
  try {
    const postName = String(payload?.postName || '').trim();
    const postContent = String(payload?.postContent || '').trim();

    const postTags = normalizeTags(payload?.postTags || payload?.tags || payload?.tag);

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
      postTags,
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

    // Authorization:
    // - Owner posts: only the assigned Manager can approve.
    // - Customer posts: global moderation (any Manager/Admin can approve).
    const owner = await UserAccount.findById(post.postOwnerID).select('managerID roleID').lean();
    if (!owner) {
      return { status: 400, body: { message: 'Post owner not found.' } };
    }

    let roleName = '';
    if (owner.roleID && mongoose.Types.ObjectId.isValid(String(owner.roleID))) {
      const Role = require('../../models/Role');
      const roleDoc = await Role.findById(owner.roleID).select('name').lean();
      roleName = String(roleDoc?.name || '').trim();
    }

    const isCustomer = roleName.toLowerCase() === 'customer';
    if (!isCustomer) {
      if (!owner.managerID || String(owner.managerID) !== String(managerId)) {
        return { status: 403, body: { message: 'You are not authorized to approve posts for this owner.' } };
      }
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
 * rejectOwnerPost
 * Manager rejects an owner's pending post (Pending -> Rejected).
 *
 * @param {string} postId - Post _id
 * @param {string} managerId - AdminAccount _id from JWT sub
 * @returns {Promise<{status:number, body:any}>}
 */
async function rejectOwnerPost(postId, managerId) {
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
      return { status: 400, body: { message: 'Only owner posts can be rejected.' } };
    }

    if (String(post.status) !== 'Pending') {
      return { status: 400, body: { message: 'Only Pending posts can be rejected.' } };
    }

    // Authorization:
    // - Owner posts: only the assigned Manager can reject.
    // - Customer posts: global moderation (any Manager/Admin can reject).
    const owner = await UserAccount.findById(post.postOwnerID).select('managerID roleID').lean();
    if (!owner) {
      return { status: 400, body: { message: 'Post owner not found.' } };
    }

    let roleName = '';
    if (owner.roleID && mongoose.Types.ObjectId.isValid(String(owner.roleID))) {
      const Role = require('../../models/Role');
      const roleDoc = await Role.findById(owner.roleID).select('name').lean();
      roleName = String(roleDoc?.name || '').trim();
    }

    const isCustomer = roleName.toLowerCase() === 'customer';
    if (!isCustomer) {
      if (!owner.managerID || String(owner.managerID) !== String(managerId)) {
        return { status: 403, body: { message: 'You are not authorized to reject posts for this owner.' } };
      }
    }

    post.status = 'Rejected';
    await post.save();

    return { status: 200, body: post };
  } catch (error) {
    console.error('[manager.postService.rejectOwnerPost] Failed:', error.message);
    throw error;
  }
}

/**
 * updateManagerOwnedPost
 * Updates a post owned by the manager (AdminAccount).
 *
 * @param {string} postId - Post _id
 * @param {string} adminId - AdminAccount _id
 * @param {{postName?:string, postContent?:string, postImage?:string[], status?:string}} payload
 * @returns {Promise<{status:number, body:any}>}
 */
async function updateManagerOwnedPost(postId, adminId, payload) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(postId))) {
      return { status: 400, body: { message: 'Invalid post id.' } };
    }

    if (!mongoose.Types.ObjectId.isValid(String(adminId))) {
      return { status: 401, body: { message: 'Unauthorized' } };
    }

    const post = await Post.findById(postId);
    if (!post) {
      return { status: 404, body: { message: 'Post not found.' } };
    }

    if (post.postOwnerModel !== 'AdminAccount') {
      return { status: 400, body: { message: 'Only manager posts can be updated by manager.' } };
    }

    // Only allow updating status to Draft, Posted, or Deleted
    const requestedStatus = String(payload?.status || '').trim();
    if (requestedStatus && !['Draft', 'Posted', 'Deleted'].includes(requestedStatus)) {
      return { status: 400, body: { message: 'Invalid status value.' } };
    }

    // Special case: allow updating to Draft if no postImage is provided
    if (requestedStatus === 'Draft' && Array.isArray(payload.postImage) && payload.postImage.length > 0) {
      return { status: 400, body: { message: 'Draft posts cannot have postImage.' } };
    }

    // Multipart upload (preferred): uploaded files are in payload.files (from multer)
    const files = Array.isArray(payload?.files) ? payload.files : [];

    const uploadedUrls = [];
    if (files.length > 0) {
      const { uploadImageBuffer } = require('../../utils/cloudinary/uploadImageBuffer');

      for (const file of files.slice(0, 6)) {
        if (!file?.buffer) continue;
        const { url } = await uploadImageBuffer(file.buffer, { folder: 'san-sieu-toc/posts' });
        uploadedUrls.push(url);
      }
    }

    const finalUrls = [...uploadedUrls].slice(0, 6);

    post.postName = payload.postName !== undefined ? String(payload.postName) : post.postName;
    post.postContent = payload.postContent !== undefined ? String(payload.postContent) : post.postContent;
    post.postImage = finalUrls.length > 0 ? finalUrls : post.postImage;

    // Tags update (optional)
    // - Accept: postTags (multipart append), tags, or tag
    // - Normalize: trim + unique, cap length (normalizeTags)
    // - If caller provides the field (even empty), we treat it as an explicit update.
    const tagsInput = payload?.postTags ?? payload?.tags ?? payload?.tag;
    if (tagsInput !== undefined) {
      const nextTags = normalizeTags(tagsInput);
      post.postTags = nextTags;
    }

    post.status = requestedStatus || post.status;

    await post.save();

    return { status: 200, body: post };
  } catch (error) {
    console.error('[manager.postService.updateManagerOwnedPost] Failed:', error.message);
    throw error;
  }
}

/**
 * softDeletePost
 * Soft deletes a post (marks as deleted without removing from DB).
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
  rejectOwnerPost,
  updateManagerOwnedPost,
  softDeletePost,
};
