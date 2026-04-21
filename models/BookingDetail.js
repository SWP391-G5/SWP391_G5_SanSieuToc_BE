const mongoose = require('mongoose');

const BookingDetailSchema = new mongoose.Schema(
  {
    fieldID: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    fieldName: {
      type: String,
      default: '',
    },
    fieldImage: {
      type: String,
      default: '',
    },
    bookingID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    priceSnapShot: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Active', 'Ended', 'Not Arrive', 'Cancel Request', 'Cancelled'],
      default: 'Active',
    },
  },
  { timestamps: true }
);

BookingDetailSchema.index({ bookingID: 1 });

module.exports = mongoose.model('BookingDetail', BookingDetailSchema);
