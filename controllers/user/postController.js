const mongoose = require('mongoose');
const { Post } = require('../../models');

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

  return Array.from(
    new Set(
      raw
        .flat()
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 3)
    )
  );
}

function normalizeImageUrls(input) {
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

  return raw
    .flat()
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function toMyPostDto(doc) {
  const normalizedTags = Array.isArray(doc?.postTags)
    ? doc.postTags.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  const fallbackTag = String(doc?.postTag || '').trim();
  const tags = normalizedTags.length > 0 ? normalizedTags : fallbackTag ? [fallbackTag] : [];
  const images = Array.isArray(doc?.postImage)
    ? doc.postImage.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  return {
    id: String(doc?._id || ''),
    title: String(doc?.postName || ''),
    content: String(doc?.postContent || ''),
    tag: fallbackTag || tags[0] || 'General',
    tags,
    status: String(doc?.status || ''),
    image: images[0] || '',
    images,
    createdAt: doc?.createdAt,
    updatedAt: doc?.updatedAt,
  };
}

const postController = {
  /**
   * Create a new post from a Customer/Owner.
   * Status will be 'Pending' by default for Admin approval.
   */
  async createPost(req, res) {
    const title = String(req.body?.title || req.body?.postName || '').trim();
    const content = String(req.body?.content || req.body?.postContent || '').trim();

    const tags = normalizeTags(req.body?.tags || req.body?.postTags || req.body?.tag);
    const images = normalizeImageUrls(req.body?.images || req.body?.postImage || req.body?.image);
    const primaryTag = tags[0] || 'General';

    if (!title || !content) {
      return res.status(400).json({ message: 'Tiêu đề và nội dung là bắt buộc.' });
    }

    const newPost = new Post({
      postOwnerModel: 'UserAccount',
      postOwnerID: req.user._id,
      postName: title,
      postContent: content,
      postTag: primaryTag,
      postTags: tags,
      postImage: images,
      status: 'Pending'
    });

    await newPost.save();

    return res.status(201).json({
      success: true,
      message: 'Bài viết đã được tạo thành công và đang chờ quản trị viên duyệt.',
      item: newPost
    });
  },

  /**
   * Get current user's posts
   */
  async getMyPosts(req, res) {
    const filter = {
      postOwnerModel: 'UserAccount',
      postOwnerID: req.user._id,
      status: { $ne: 'Deleted' }
    };

    const items = await Post.find(filter).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      items: items.map((doc) => toMyPostDto(doc)),
    });
  },

  /**
   * Update current user's post
   */
  async updateMyPost(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
      return res.status(400).json({ message: 'ID bài viết không hợp lệ.' });
    }

    const post = await Post.findOne({
      _id: id,
      postOwnerModel: 'UserAccount',
      postOwnerID: req.user._id,
      status: { $ne: 'Deleted' },
    });

    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết của bạn.' });
    }

    const body = req.body || {};
    const hasTitleInput = Object.prototype.hasOwnProperty.call(body, 'title') || Object.prototype.hasOwnProperty.call(body, 'postName');
    const hasContentInput = Object.prototype.hasOwnProperty.call(body, 'content') || Object.prototype.hasOwnProperty.call(body, 'postContent');
    const hasTagInput =
      Object.prototype.hasOwnProperty.call(body, 'tags') ||
      Object.prototype.hasOwnProperty.call(body, 'postTags') ||
      Object.prototype.hasOwnProperty.call(body, 'tag');
    const hasImageInput =
      Object.prototype.hasOwnProperty.call(body, 'images') ||
      Object.prototype.hasOwnProperty.call(body, 'postImage') ||
      Object.prototype.hasOwnProperty.call(body, 'image');

    const nextTitle = hasTitleInput ? String(body.title || body.postName || '').trim() : String(post.postName || '').trim();
    const nextContent = hasContentInput ? String(body.content || body.postContent || '').trim() : String(post.postContent || '').trim();

    if (!nextTitle || !nextContent) {
      return res.status(400).json({ message: 'Tiêu đề và nội dung là bắt buộc.' });
    }

    if (nextTitle.length > 200) {
      return res.status(400).json({ message: 'Tiêu đề tối đa 200 ký tự.' });
    }

    if (nextContent.length > 10000) {
      return res.status(400).json({ message: 'Nội dung tối đa 10000 ký tự.' });
    }

    const nextTags = hasTagInput
      ? normalizeTags(body.tags || body.postTags || body.tag)
      : normalizeTags(post.postTags?.length ? post.postTags : post.postTag);

    if (hasTagInput && nextTags.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất 1 tag.' });
    }

    const safeTags = nextTags.length > 0 ? nextTags : ['General'];

    post.postName = nextTitle;
    post.postContent = nextContent;
    post.postTags = safeTags;
    post.postTag = safeTags[0];

    if (hasImageInput) {
      post.postImage = normalizeImageUrls(body.images || body.postImage || body.image);
    }

    // Any customer edit should go through moderation again
    post.status = 'Pending';

    await post.save();

    return res.status(200).json({
      success: true,
      message: 'Đã cập nhật bài viết. Bài viết sẽ được duyệt lại.',
      item: toMyPostDto(post),
    });
  },

  /**
   * Soft-delete current user's post
   */
  async deleteMyPost(req, res) {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
      return res.status(400).json({ message: 'ID bài viết không hợp lệ.' });
    }

    const post = await Post.findOne({
      _id: id,
      postOwnerModel: 'UserAccount',
      postOwnerID: req.user._id,
      status: { $ne: 'Deleted' },
    });

    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết của bạn.' });
    }

    post.status = 'Deleted';
    await post.save();

    return res.status(200).json({
      success: true,
      message: 'Đã xóa bài viết.',
    });
  }
};

module.exports = postController;
