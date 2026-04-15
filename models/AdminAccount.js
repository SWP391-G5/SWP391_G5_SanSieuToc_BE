const mongoose = require('mongoose');

const AdminAccountSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      minlength: 3,
      maxlength: 64,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 254,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
      maxlength: 30,
    },
    image: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    // Store bcrypt hash in this field.
    password: {
      type: String,
      required: true,
    },
    roleID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    status: {
      type: String,
      enum: ['Active', 'InActive'],
      default: 'Active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminAccount', AdminAccountSchema);
