const mongoose = require('mongoose');

const MarketingResourceSchema = new mongoose.Schema(
  {
    managerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminAccount',
      required: true,
    },

    // Resource metadata
    name: { type: String, required: true, trim: true, maxlength: 200 },

    // 4 fields required for banners/sliders management
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    placement: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    order: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, required: true, default: true },

    // Assets
    image: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

// Fast list: a manager's resources, newest first
MarketingResourceSchema.index({ managerID: 1, createdAt: -1 });

module.exports = mongoose.model('MarketingResource', MarketingResourceSchema);
