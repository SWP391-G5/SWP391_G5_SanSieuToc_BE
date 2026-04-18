/**
 * public/fields.js
 * Public endpoints for fields to render on customer pages.
 *
 * Backed by Field model.
 */

const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../../middlewares/asyncHandler');
const { Field, Feedback } = require('../../models');

const router = express.Router();

function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function inferCity(doc) {
  const direct = String(doc?.city || '').trim();
  if (direct) return direct;

  const address = normalizeText(doc?.address);
  if (!address) return '';

  const isHcm =
    address.includes('tp.hcm') ||
    address.includes('tphcm') ||
    address.includes('hcmc') ||
    address.includes('ho chi minh') ||
    address.includes('hò chí minh') ||
    address.includes('ho chí minh');

  const isHanoi =
    address.includes('ha noi') ||
    address.includes('hanoi') ||
    address.includes('hà nọi') ||
    address.includes('ha noi');

  if (isHcm) return 'TP.HCM';
  if (isHanoi) return 'Ha Noi';
  return '';
}

function inferSizeKey(doc) {
  const direct = String(doc?.sizeKey || '').trim();
  if (direct) return direct;

  const haystack = `${doc?.fieldType || ''} ${doc?.fieldName || ''}`;
  const t = normalizeText(haystack);

  if (t.includes('11')) return '11';
  if (t.includes('7')) return '7';
  if (t.includes('5')) return '5';

  return '5';
}

function toUtilityKey(raw) {
  const t = normalizeText(raw).replace(/\s+/g, '');
  if (!t) return '';
  if (t.includes('parking') || t.includes('baixe') || t.includes('giuaxe') || t.includes('do xe')) return 'parking';
  if (t.includes('light') || t.includes('den') || t.includes('chieusang')) return 'lighting';
  if (t.includes('wifi') || t.includes('wi-fi')) return 'wifi';
  if (t.includes('shower') || t.includes('tam') || t.includes('vesinh') || t.includes('toilet')) return 'shower';
  return '';
}

function normalizeUtilities(list) {
  const arr = Array.isArray(list) ? list : [];
  const keys = arr.map(toUtilityKey).filter(Boolean);
  return Array.from(new Set(keys));
}

function formatVnd(n) {
  const value = Number(n) || 0;
  try {
    return `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
  } catch {
    const rounded = Math.round(value);
    return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.') }đ`;
  }
}

function computeSizeTone(sizeKey) {
  return String(sizeKey) === '7' ? 'tertiary' : 'primary';
}

function getEffectiveHourlyPrice(doc) {
  const hourly = Number(doc?.hourlyPrice);
  if (Number.isFinite(hourly) && hourly > 0) return hourly;

  // Backward-compatible fallback for legacy data shape.
  const legacyPrice = Number(doc?.price);
  if (Number.isFinite(legacyPrice) && legacyPrice > 0) return legacyPrice;

  return 0;
}

function toFieldDto(doc, ratingMap) {
  const id = String(doc?._id || '');
  const city = inferCity(doc);
  const sizeKey = inferSizeKey(doc);

  const avgRate = ratingMap.get(id);
  const ratingNumber = Number.isFinite(avgRate) ? avgRate : 5;
  const rating = ratingNumber.toFixed(1);

  const imageUrl = Array.isArray(doc?.image) && doc.image.length ? doc.image[0] : '';
  const hourlyPrice = getEffectiveHourlyPrice(doc);

  return {
    id,
    name: doc?.fieldName || '',
    address: doc?.address || '',
    city,
    rating,
    size: `${sizeKey}-A-SIDE`,
    sizeKey,
    sizeTone: computeSizeTone(sizeKey),
    hourlyPrice,
    price: hourlyPrice > 0 ? formatVnd(hourlyPrice) : 'Liên hệ',
    utilities: normalizeUtilities(doc?.utilities),
    image: imageUrl,
    imageAlt: 'Field image',
    createdAt: doc?.createdAt,
    updatedAt: doc?.updatedAt,
  };
}

async function getRatingMapByFieldIds(fieldIds) {
  const ids = (fieldIds || []).filter(Boolean).map((x) => new mongoose.Types.ObjectId(x));
  if (ids.length === 0) return new Map();

  const rows = await Feedback.aggregate([
    {
      $lookup: {
        from: 'bookingdetails',
        localField: 'bookingDetailID',
        foreignField: '_id',
        as: 'bd',
      },
    },
    { $unwind: '$bd' },
    { $match: { 'bd.fieldID': { $in: ids } } },
    {
      $group: {
        _id: '$bd.fieldID',
        avgRate: { $avg: '$rate' },
        count: { $sum: 1 },
      },
    },
  ]);

  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), Number(r.avgRate) || 0);
  }
  return map;
}

function parseUtilitiesParam(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map(toUtilityKey)
    .filter(Boolean);
}

// GET /api/public/fields
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const city = String(req.query.city || '').trim();
    const sizeKey = String(req.query.sizeKey || '').trim();
    const priceMin = req.query.priceMin !== undefined ? Number(req.query.priceMin) : NaN;
    const priceMax = req.query.priceMax !== undefined ? Number(req.query.priceMax) : NaN;
    const sortBy = String(req.query.sortBy || '').trim();
    const selectedUtilities = parseUtilitiesParam(req.query.utilities);

    const filter = { status: { $ne: 'Deleted' } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ fieldName: rx }, { address: rx }];
    }

    let docs = await Field.find(filter).sort({ createdAt: -1 }).lean();

    // Price filter supports both `hourlyPrice` and legacy `price` schema.
    if (Number.isFinite(priceMin) || Number.isFinite(priceMax)) {
      docs = docs.filter((d) => {
        const p = getEffectiveHourlyPrice(d);
        if (Number.isFinite(priceMin) && p < priceMin) return false;
        if (Number.isFinite(priceMax) && p > priceMax) return false;
        return true;
      });
    }

    // In-memory filters for robust matching (city/sizeKey/utilities) regardless of how DB stores them.
    if (city) {
      docs = docs.filter((d) => inferCity(d) === city);
    }

    if (sizeKey) {
      docs = docs.filter((d) => inferSizeKey(d) === sizeKey);
    }

    if (selectedUtilities.length) {
      docs = docs.filter((d) => {
        const u = normalizeUtilities(d?.utilities);
        return selectedUtilities.every((x) => u.includes(x));
      });
    }

    const ratingMap = await getRatingMapByFieldIds(docs.map((d) => d?._id));

    let items = docs.map((d) => toFieldDto(d, ratingMap));

    // Sorting
    if (sortBy === 'priceAsc') {
      items.sort((a, b) => (Number(a?.hourlyPrice) || 0) - (Number(b?.hourlyPrice) || 0));
    } else if (sortBy === 'priceDesc') {
      items.sort((a, b) => (Number(b?.hourlyPrice) || 0) - (Number(a?.hourlyPrice) || 0));
    } else if (sortBy === 'topRated') {
      items.sort((a, b) => {
        const ra = Number(a?.rating) || 0;
        const rb = Number(b?.rating) || 0;
        if (rb !== ra) return rb - ra;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });
    }

    res.json({ items });
  })
);

module.exports = router;
