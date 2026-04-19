const mongoose = require('mongoose');

const WithdrawRequestSchema = new mongoose.Schema(
  {
    ownerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Completed'],
      default: 'Pending',
    },
    note: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

WithdrawRequestSchema.index({ ownerID: 1, createdAt: -1 });

module.exports = mongoose.model('WithdrawRequest', WithdrawRequestSchema);