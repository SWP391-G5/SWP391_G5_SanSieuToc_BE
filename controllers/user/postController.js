const mongoose = require('mongoose');
const { Post } = require('../../models');

const postController = {
  /**
   * Create a new post from a Customer/Owner.
   * Status will be 'Pending' by default for Admin approval.
   */
  async createPost(req, res) {
    const { title, content, tag, image } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Tiêu đề và nội dung là bắt buộc.' });
    }

    const newPost = new Post({
      postOwnerModel: 'UserAccount',
      postOwnerID: req.user._id,
      postName: title,
      postContent: content,
      postTag: tag || 'General',
      postImage: image ? [image] : [],
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
      items: items.map(doc => ({
        id: doc._id,
        title: doc.postName,
        content: doc.postContent,
        tag: doc.postTag,
        status: doc.status,
        image: doc.postImage?.[0] || '',
        createdAt: doc.createdAt
      }))
    });
  }
};

module.exports = postController;
