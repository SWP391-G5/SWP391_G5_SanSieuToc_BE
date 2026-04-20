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

function normalizeTags(input) {
  if (!input) return [];

  let raw = [];
  if (Array.isArray(input)) raw = input;
  else if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return [];
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

  return Array.from(new Set(normalized));
}

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

    const postTags = normalizeTags(payload?.postTags || payload?.tags || payload?.tag);

    const files = Array.isArray(payload?.files) ? payload.files : [];

    if (!postName) {
      return { status: 400, body: { message: 'postName is required.' } };
    }
    
    // Parse previously uploaded/existing URLs
    let providedUrls = [];
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
      }
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
      postOwnerModel: 'UserAccount',
      postOwnerID: ownerId,
      postName,
      postContent,
      postImage: finalUrls,
      postTags,
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
      .populate('postOwnerID', 'name email username')
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

    const files = Array.isArray(payload?.files) ? payload.files : [];
    
    // Parse previously uploaded/existing URLs
    let providedUrls = [];
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
      }
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

    const nextTags = normalizeTags(payload?.postTags || payload?.tags || payload?.tag);

    // If owner wants to change images, re-upload with multipart form-data images[]
    let finalUrls = [...providedUrls];
    if (files.length > 0) {
      const { uploadImageBuffer } = require('../../utils/cloudinary/uploadImageBuffer');

      for (const file of files) {
        if (finalUrls.length >= 6) break;
        if (!file?.buffer) continue;
        const { url } = await uploadImageBuffer(file.buffer, { folder: 'san-sieu-toc/posts' });
        finalUrls.push(url);
      }
    }

    if (files.length > 0 || providedUrls.length > 0) {
      post.postImage = finalUrls.slice(0, 6);
    } else if (payload?.postImage !== undefined) {
      // if explicitly sent as empty
      post.postImage = [];
    }

    if ((payload?.postTags ?? payload?.tags ?? payload?.tag) !== undefined) {
      post.postTags = nextTags;
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
