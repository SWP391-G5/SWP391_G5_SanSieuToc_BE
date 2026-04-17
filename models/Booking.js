const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    totalPrice: { type: Number, default: 0, min: 0 },
    statusPayment: {
      type: String,
      enum: ['Pending', 'Completed', 'Pending Refund', 'Refunded', 'Cancel'],
      default: 'Pending',
    },
    status: {
      type: String,
      enum: ['Booked', 'Cancel Request', 'Cancel'],
      default: 'Booked',
    },
    refundReason: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

BookingSchema.index({ customerID: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', BookingSchema);
