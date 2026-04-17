/**
 * routes/public/privacy.js
 * Public endpoint to read privacy policies shown to users.
 */

const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const Privacy = require('../../models/Privacy');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Privacy.find({}).sort({ updatedAt: -1, _id: -1 }).lean();
    return res.status(200).json({ items });
  })
);

module.exports = router;
