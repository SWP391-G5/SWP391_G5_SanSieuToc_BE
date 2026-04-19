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

async function assertNoActiveDuplicate({ placement, order, excludeId } = {}) {
  const normalizedPlacement = normalizePlacement(placement);
  const normalizedOrder = Number.isFinite(Number(order)) ? Number(order) : 0;

  const filter = {
    type: 'banner',
    placement: normalizedPlacement,
    order: normalizedOrder,
    isActive: true,
  };
  if (excludeId) filter._id = { $ne: excludeId };

  const exists = await MarketingResource.exists(filter);
  if (exists) {
    const err = new Error('Duplicate active banner for this placement/order');
    err.status = 409;
    throw err;
  }
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

  const normalizedOrder = Number.isFinite(Number(order)) ? Number(order) : 0;
  const normalizedActive = typeof isActive === 'boolean' ? isActive : true;
  if (normalizedActive) {
    await assertNoActiveDuplicate({ placement: normalizedPlacement, order: normalizedOrder });
  }

  const doc = await MarketingResource.create({
    managerID: userId,
    name: String(title || '').trim(),
    type: 'banner',
    placement: normalizedPlacement,
    order: normalizedOrder,
    isActive: normalizedActive,
    image: [String(imageUrl).trim()],
  });

  return doc;
}

async function updateBanner(id, { title, imageUrl, placement, order, isActive, userId, __v }) {
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

  // Optimistic concurrency: require __v from client
  const expectedVersion = Number.isFinite(Number(__v)) ? Number(__v) : null;
  if (expectedVersion === null) {
    const err = new Error('Missing __v for concurrency control');
    err.status = 400;
    throw err;
  }

  // Build $set
  const $set = {};
  if (title !== undefined) $set.name = String(title || '').trim();
  if (placement !== undefined) $set.placement = normalizePlacement(placement);
  if (order !== undefined) $set.order = Number.isFinite(Number(order)) ? Number(order) : 0;
  if (isActive !== undefined) $set.isActive = !!isActive;
  if (imageUrl !== undefined) {
    const v = String(imageUrl || '').trim();
    $set.image = v ? [v] : [];
  }

  // keep audit minimal: managerID is creator/owner, do not overwrite it on update
  if (!doc.managerID && userId) $set.managerID = userId;

  const nextPlacement = $set.placement !== undefined ? $set.placement : doc.placement;
  const nextOrder = $set.order !== undefined ? $set.order : doc.order;
  const nextActive = $set.isActive !== undefined ? $set.isActive : doc.isActive;
  if (nextActive) await assertNoActiveDuplicate({ placement: nextPlacement, order: nextOrder, excludeId: id });

  const updated = await MarketingResource.findOneAndUpdate(
    { _id: id, __v: expectedVersion, type: 'banner' },
    { $set, $inc: { __v: 1 } },
    { new: true }
  );

  if (!updated) {
    const exists = await MarketingResource.exists({ _id: id, type: 'banner' });
    const err = new Error(
      exists
        ? 'This banner was updated by someone else. Please refresh and try again.'
        : 'Banner not found'
    );
    err.status = exists ? 409 : 404;
    throw err;
  }

  return updated;
}

async function deleteBanner(id) {
  const doc = await MarketingResource.findById(id);
  if (!doc) {
    const err = new Error('Banner not found');
    err.status = 404;
    throw err;
  }

  const result = await MarketingResource.deleteOne({ _id: id, type: 'banner' });
  if (!result?.deletedCount) {
    const err = new Error('Delete failed');
    err.status = 400;
    throw err;
  }
  return { success: true, id };
}

module.exports = {
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
};
