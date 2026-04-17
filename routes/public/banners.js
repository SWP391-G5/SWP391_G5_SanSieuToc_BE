/**
 * public/banners.js
 * Public endpoints for banners to render on customer pages.
 *
 * Backed by MarketingResource (type='banner').
 */

const express = require('express');
const asyncHandler = require('../../middlewares/asyncHandler');
const { MarketingResource } = require('../../models');

const router = express.Router();

function normalizePlacement(placement) {
  return String(placement || 'home_hero').trim() || 'home_hero';
}

function toBannerDto(doc) {
  return {
    _id: doc?._id,
    title: doc?.title ?? doc?.name ?? '',
    placement: doc?.placement,
    order: doc?.order ?? 0,
    isActive: !!doc?.isActive,
    imageUrl: Array.isArray(doc?.image) ? doc.image[0] : undefined,
    createdAt: doc?.createdAt,
    updatedAt: doc?.updatedAt,
  };
}

// GET /api/banners?placement=home_hero
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { placement } = req.query;
    const filter = { type: 'banner', isActive: true };
    if (placement) filter.placement = normalizePlacement(placement);

    const items = await MarketingResource.find(filter).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ items: items.map(toBannerDto) });
  })
);

module.exports = router;
