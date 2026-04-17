/**
 * bannerService.js
 * Business logic for Manager/Admin Banner management.
 *
 * NOTE: Implemented on top of MarketingResource (type/placement/order/isActive/image[])
 * instead of a dedicated Banner collection.
 */

const { MarketingResource } = require('../../models');

const MAX_ITEMS_PER_PLACEMENT = 50;

function normalizePlacement(placement) {
  return String(placement || 'home_hero').trim() || 'home_hero';
}

async function listBanners({ placement } = {}) {
  const filter = { type: 'banner' };
  if (placement) filter.placement = normalizePlacement(placement);

  const items = await MarketingResource.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .lean();

  return { items };
}

async function createBanner({ title, imageUrl, placement, order, isActive, userId }) {
  if (!imageUrl) {
    const err = new Error('imageUrl is required');
    err.status = 400;
    throw err;
  }

  const normalizedPlacement = normalizePlacement(placement);

  const count = await MarketingResource.countDocuments({
    type: 'banner',
    placement: normalizedPlacement,
  });

  if (count >= MAX_ITEMS_PER_PLACEMENT) {
    const err = new Error(`Max banners per placement is ${MAX_ITEMS_PER_PLACEMENT}`);
    err.status = 400;
    throw err;
  }

  const doc = await MarketingResource.create({
    managerID: userId,
    name: String(title || '').trim(),
    type: 'banner',
    placement: normalizedPlacement,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    isActive: typeof isActive === 'boolean' ? isActive : true,
    image: [String(imageUrl).trim()],
  });

  return doc;
}

async function updateBanner(id, { title, imageUrl, placement, order, isActive, userId }) {
  const doc = await MarketingResource.findById(id);
  if (!doc) {
    const err = new Error('Banner not found');
    err.status = 404;
    throw err;
  }

  // avoid updating wrong type by accident
  if (String(doc.type || '') !== 'banner') {
    const err = new Error('Resource is not a banner');
    err.status = 400;
    throw err;
  }

  if (title !== undefined) doc.name = String(title || '').trim();
  if (placement !== undefined) doc.placement = normalizePlacement(placement);
  if (order !== undefined) doc.order = Number.isFinite(Number(order)) ? Number(order) : 0;
  if (isActive !== undefined) doc.isActive = !!isActive;

  if (imageUrl !== undefined) {
    const v = String(imageUrl || '').trim();
    doc.image = v ? [v] : [];
  }

  // keep audit minimal: managerID is creator/owner, do not overwrite it on update
  if (!doc.managerID && userId) doc.managerID = userId;

  await doc.save();
  return doc;
}

async function deleteBanner(id) {
  const doc = await MarketingResource.findById(id);
  if (!doc) {
    const err = new Error('Banner not found');
    err.status = 404;
    throw err;
  }

  await MarketingResource.deleteOne({ _id: id });
  return { success: true };
}

module.exports = {
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
};
