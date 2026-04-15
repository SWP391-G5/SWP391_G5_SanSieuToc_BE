const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema(
  {
    walletOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', WalletSchema);
