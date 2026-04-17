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
      required: true,
    },
    toWalletID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    externalTransactionID: { type: String, default: '', trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: ['Field Payment', 'Add Credit', 'Commission Transaction', 'Refund', 'Service Payment'],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, default: 0 },
    balanceAfter: { type: Number, default: 0 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

TransactionSchema.index({ fromWalletID: 1, createdAt: -1 });
TransactionSchema.index({ toWalletID: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
