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
    postImage: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ['Pending', 'Posted', 'Deleted'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

PostSchema.index({ postOwnerModel: 1, postOwnerID: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Post', PostSchema);
