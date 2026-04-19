const mongoose = require('mongoose');
const { Field, Service, Feedback } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');

// Get field by ID
exports.getFieldById = asyncHandler(async (req, res) => {
  const { fieldId } = req.params;

  const field = await Field.findById(fieldId).select('-createdAt -updatedAt');

  if (!field) {
    return res.status(404).json({
      success: false,
      message: 'Field not found',
    });
  }

  res.status(200).json({
    success: true,
    data: field,
  });
});

// Get all fields (with filtering)
exports.getAllFields = asyncHandler(async (req, res) => {
  const { status = 'Active', fieldType } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (fieldType) filter.fieldType = fieldType;

  const fields = await Field.find(filter)
    .select('-createdAt -updatedAt')
    .limit(50);

  res.status(200).json({
    success: true,
    data: fields,
  });
});

// Get services for a field
exports.getFieldServices = asyncHandler(async (req, res) => {
  const { fieldId } = req.params;

  const services = await Service.find({ fieldID: fieldId }).select('-createdAt -updatedAt');

  res.status(200).json({
    success: true,
    data: services,
  });
});

// Get field with services (full detail)
exports.getFieldWithServices = asyncHandler(async (req, res) => {
  const { fieldId } = req.params;

  const field = await Field.findById(fieldId);
  if (!field) {
    return res.status(404).json({
      success: false,
      message: 'Field not found',
    });
  }

  const services = await Service.find({ fieldID: fieldId });

  const fieldIdString = String(fieldId);
  const hasObjectId = mongoose.isValidObjectId(fieldIdString);
  const fieldIdObject = hasObjectId ? new mongoose.Types.ObjectId(fieldIdString) : null;

  const feedbackFieldMatch = hasObjectId
    ? {
        $or: [
          { 'detail.fieldID': fieldIdString },
          { 'detail.fieldID': fieldIdObject },
        ],
      }
    : { 'detail.fieldID': fieldIdString };

  const feedbackPipelineBase = [
    { $match: { isDeleted: { $ne: true } } },
    {
      $lookup: {
        from: 'bookingdetails',
        localField: 'bookingDetailID',
        foreignField: '_id',
        as: 'detail',
      },
    },
    { $unwind: '$detail' },
    { $match: feedbackFieldMatch },
    {
      $lookup: {
        from: 'bookings',
        localField: 'detail.bookingID',
        foreignField: '_id',
        as: 'booking',
      },
    },
    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'useraccounts',
        localField: 'booking.customerID',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
  ];

  const [feedbackRows, feedbackSummaryRows] = await Promise.all([
    Feedback.aggregate([
      ...feedbackPipelineBase,
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 1,
          bookingDetailID: 1,
          rate: 1,
          content: 1,
          createdAt: 1,
          user: {
            id: '$customer._id',
            name: '$customer.name',
            username: '$customer.username',
            image: '$customer.image',
          },
        },
      },
    ]),
    Feedback.aggregate([
      ...feedbackPipelineBase,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRate: { $avg: '$rate' },
        },
      },
    ]),
  ]);

  const summary = feedbackSummaryRows[0] || { total: 0, avgRate: 0 };

  const feedbacks = feedbackRows.map((x) => ({
    id: String(x._id),
    bookingDetailID: String(x.bookingDetailID),
    rate: Number(x.rate) || 0,
    content: x.content || '',
    createdAt: x.createdAt,
    user: {
      id: x.user?.id ? String(x.user.id) : '',
      name: x.user?.name || x.user?.username || 'User',
      image: x.user?.image || '',
    },
  }));

  res.status(200).json({
    success: true,
    data: {
      field,
      services,
      feedbackSummary: {
        total: Number(summary.total) || 0,
        avgRate: Number(summary.avgRate) || 0,
      },
      feedbacks,
    },
  });
});

module.exports = exports;
