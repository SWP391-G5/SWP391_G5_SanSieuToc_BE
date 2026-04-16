const mongoose = require('mongoose');

const PrivacySchema = new mongoose.Schema(
  {
    managerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminAccount',
      required: true,
    },
    privacyName: { type: String, required: true, trim: true, maxlength: 200 },
    privacyContent: { type: String, default: '', trim: true, maxlength: 10000 },
  },
  { timestamps: true }
);

PrivacySchema.index({ managerID: 1, updatedAt: -1 });

module.exports = mongoose.model('Privacy', PrivacySchema);
