const mongoose = require('mongoose');

const WishlistSchema = new mongoose.Schema(
  {
    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    fieldID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      required: true,
    },
  },
  { timestamps: true }
);

WishlistSchema.index({ customerID: 1, fieldID: 1 }, { unique: true });
WishlistSchema.index({ customerID: 1, createdAt: -1 });

module.exports = mongoose.model('Wishlist', WishlistSchema);