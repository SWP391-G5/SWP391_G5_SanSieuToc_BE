const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema(
  {
    fieldID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      required: true,
    },
    serviceName: { type: String, required: true, trim: true, maxlength: 200 },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    image: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

ServiceSchema.index({ fieldID: 1 });

module.exports = mongoose.model('Service', ServiceSchema);
