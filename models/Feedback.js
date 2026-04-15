const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema(
  {
    bookingDetailID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingDetail',
      required: true,
    },
    rate: { type: Number, required: true, min: 1, max: 5 },
    content: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

FeedbackSchema.index({ bookingDetailID: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', FeedbackSchema);
