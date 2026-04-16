const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema(
  {
    ownerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    voucherName: { type: String, required: true, trim: true, maxlength: 200 },
    discount: { type: Number, required: true, min: 0 },
    beginDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

VoucherSchema.index({ ownerID: 1, beginDate: 1, endDate: 1 });

module.exports = mongoose.model('Voucher', VoucherSchema);
