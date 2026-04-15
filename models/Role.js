const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      enum: ['Admin', 'Manager', 'Owner', 'Customer'],
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', RoleSchema);
