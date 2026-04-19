const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema(
  {
    // Dynamic reference: can point to either UserAccount or AdminAccount
    walletOwnerModel: {
      type: String,
      enum: ['UserAccount', 'AdminAccount', 'Owner'],
      required: true,
      default: 'UserAccount',
    },
    walletOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'walletOwnerModel',
      required: true,
    },
    balance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Ensure one wallet per owner (per model)
WalletSchema.index({ walletOwnerModel: 1, walletOwnerId: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', WalletSchema);
