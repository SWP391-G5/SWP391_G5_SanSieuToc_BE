/**
 * Banner.js
 * Banner model for managing system-wide promotional/hero images.
 */

const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: '' },
    imageUrl: { type: String, required: true, trim: true },

    // Ordering & visibility
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },

    // Optional placement for future use (home hero, fields list, etc.)
    placement: { type: String, default: 'home_hero' },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAccount', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Banner', BannerSchema);
