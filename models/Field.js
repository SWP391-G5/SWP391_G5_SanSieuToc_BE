const mongoose = require('mongoose');

const FieldSchema = new mongoose.Schema(
  {
    ownerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    fieldType: { type: String, required: true, trim: true, maxlength: 100 },
    fieldName: { type: String, required: true, trim: true, maxlength: 200 },
    address: { type: String, default: '', trim: true, maxlength: 500 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    city: { type: String, default: '', trim: true, maxlength: 100 },
    sizeKey: { type: String, default: '', trim: true, maxlength: 10 },
    hourlyPrice: { type: Number, default: 0, min: 0 },
    slotDuration: { type: Number, default: 60, min: 1 },
    openingTime: { type: String, default: '06:00', trim: true },
    closingTime: { type: String, default: '22:00', trim: true },
    utilities: [{ type: String, trim: true, maxlength: 200 }],
    status: {
      type: String,
      enum: ['Maintain', 'Active', 'Deleted'],
      default: 'Active',
    },
    image: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

FieldSchema.index({ ownerID: 1, status: 1 });

module.exports = mongoose.model('Field', FieldSchema);
