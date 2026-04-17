const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema(
  {
    reporterID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    targetID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAccount',
      required: true,
    },
    reportType: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    evidence: [{ type: String, trim: true, maxlength: 2000 }],
    status: {
      type: String,
      enum: ['Pending', 'Resolved', 'Rejected'],
      default: 'Pending',
    },
    adminNote: { type: String, default: '', trim: true, maxlength: 5000 },
  },
  { timestamps: true }
);

ReportSchema.index({ reporterID: 1, createdAt: -1 });
ReportSchema.index({ targetID: 1, createdAt: -1 });
ReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);
