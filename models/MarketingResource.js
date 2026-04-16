const mongoose = require('mongoose');

const MarketingResourceSchema = new mongoose.Schema(
  {
    managerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminAccount',
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    image: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

MarketingResourceSchema.index({ managerID: 1, createdAt: -1 });

module.exports = mongoose.model('MarketingResource', MarketingResourceSchema);
