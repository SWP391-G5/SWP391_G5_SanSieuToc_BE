const mongoose = require('mongoose');

const ServiceItemSchema = new mongoose.Schema({
  serviceId: { type: String, required: true },
  serviceName: { type: String, required: true },
  price: { type: Number, required: true },
});

const BookingSchema = new mongoose.Schema(
  {
    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    totalPrice: { type: Number, default: 0, min: 0 },
    servicesTotal: { type: Number, default: 0 },
    services: [ServiceItemSchema],
    fieldTotal: { type: Number, default: 0 },
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
