const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema(
  {
    // Dynamic reference: post can belong to either Owner (UserAccount) or Manager (AdminAccount)
    postOwnerModel: {
      type: String,
      enum: ['UserAccount', 'AdminAccount'],
      required: true,
      default: 'UserAccount',
    },
    postOwnerID: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'postOwnerModel',
      required: true,
    },
    postName: { type: String, required: true, trim: true, maxlength: 200 },
    postContent: { type: String, default: '', trim: true, maxlength: 10000 },
    postTag: { type: String, default: 'General', trim: true },
    postImage: [{ type: String, trim: true }],
    postTags: [{ type: String, trim: true, maxlength: 40, default: [] }],
    status: {
      type: String,
      enum: ['Draft', 'Pending', 'Posted', 'Rejected', 'Deleted'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

PostSchema.index({ postOwnerModel: 1, postOwnerID: 1, status: 1, createdAt: -1 });
PostSchema.index({ postTags: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Post', PostSchema);
