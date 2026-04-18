const mongoose = require('mongoose');

const UserAccountSchema = new mongoose.Schema(
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
    address: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
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

    // (Role: Owner) The Manager (AdminAccount) responsible for this Owner.
    // NOTE: Enforced at service layer for Owner creation.
    managerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminAccount',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['Active', 'InActive', 'Banned', 'Deleted'],
      default: 'Active',
    },

    // Owner deletion scheduling (Admin requests deletion; executed after a grace period).
    deletion: {
      requestedAt: { type: Date },
      scheduledAt: { type: Date },
      requestedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAccount' },
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerification: {
      codeHash: { type: String, default: '' },
      expiresAt: { type: Date },
      resendAvailableAt: { type: Date },
    },

    // Used for "change email" flow (OTP to new email)
    emailChange: {
      newEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
      codeHash: { type: String, default: '' },
      expiresAt: { type: Date },
      resendAvailableAt: { type: Date },
    },
  },
  { timestamps: true }
);

UserAccountSchema.index({ 'deletion.scheduledAt': 1 });

module.exports = mongoose.model('UserAccount', UserAccountSchema);
