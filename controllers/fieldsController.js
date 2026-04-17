const { Field, Service } = require('../models');
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

  res.status(200).json({
    success: true,
    data: {
      field,
      services,
    },
  });
});

module.exports = exports;
