const mongoose = require('mongoose');

const BookingServiceHistorySchema = new mongoose.Schema(
  {
    bookingDetailID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingDetail',
      required: true,
    },
    serviceID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    totalPriceSnapShot: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Active', 'Cancelled'],
      default: 'Active',
    },
    service: [
      {
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
        serviceName: { type: String, required: true, trim: true, maxlength: 200 },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
  },
  { timestamps: true }
);

BookingServiceHistorySchema.index({ bookingDetailID: 1 });

module.exports = mongoose.model('BookingServiceHistory', BookingServiceHistorySchema);
