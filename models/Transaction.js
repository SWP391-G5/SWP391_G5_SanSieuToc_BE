const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    bookingID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
    fromWalletID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: false,
    },
    toWalletID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
    },
    externalTransactionID: { type: String, default: '', trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: ['Field Payment', 'Add Credit', 'Commission Transaction', 'Refund', 'Service Payment', 'Withdraw'],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, default: 0 },
    balanceAfter: { type: Number, default: 0 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    bookingType: {
      type: String,
      enum: ['field', 'service'],
      default: 'field',
    },
    ownerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
    },
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    accountName: { type: String, trim: true },
    withdrawStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Completed'],
      default: 'Pending',
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

TransactionSchema.index({ fromWalletID: 1, createdAt: -1 });
TransactionSchema.index({ toWalletID: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
