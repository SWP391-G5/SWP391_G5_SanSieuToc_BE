const mongoose = require('mongoose');
const { Field, Wishlist } = require('../../models');

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function getAuthenticatedUserId(req) {
  return String(req?.user?.sub || req?.user?.id || req?.user?.userId || '').trim();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCity(fieldDoc) {
  const direct = String(fieldDoc?.city || '').trim();
  if (direct) return direct;

  const address = normalizeText(fieldDoc?.address);
  if (!address) return '';

  const isHcm =
    address.includes('tp.hcm') ||
    address.includes('tphcm') ||
    address.includes('hcmc') ||
    address.includes('ho chi minh');

  const isHanoi =
    address.includes('ha noi') ||
    address.includes('hanoi');

  if (isHcm) return 'TP.HCM';
  if (isHanoi) return 'Ha Noi';
  return '';
}

function inferSizeKey(fieldDoc) {
  const direct = String(fieldDoc?.sizeKey || '').trim();
  if (direct) return direct;

  const t = normalizeText(`${fieldDoc?.fieldType || ''} ${fieldDoc?.fieldName || ''}`);
  if (t.includes('11')) return '11';
  if (t.includes('7')) return '7';
  if (t.includes('5')) return '5';
  return '5';
}

function toUtilityKey(rawValue) {
  const t = normalizeText(rawValue).replace(/\s+/g, '');
  if (!t) return '';
  if (t.includes('parking') || t.includes('baixe') || t.includes('giuaxe') || t.includes('doxe')) return 'parking';
  if (t.includes('light') || t.includes('den') || t.includes('chieusang')) return 'lighting';
  if (t.includes('wifi') || t.includes('wi-fi')) return 'wifi';
  if (t.includes('shower') || t.includes('tam') || t.includes('vesinh') || t.includes('toilet')) return 'shower';
  return '';
}

function normalizeUtilities(values) {
  const arr = Array.isArray(values) ? values : [];
  const keys = arr.map(toUtilityKey).filter(Boolean);
  return Array.from(new Set(keys));
}

function formatVnd(value) {
  const amount = Number(value) || 0;
  try {
    return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
  } catch {
    const rounded = Math.round(amount);
    return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
  }
}

function computeSizeTone(sizeKey) {
  return String(sizeKey) === '7' ? 'tertiary' : 'primary';
}

function getEffectiveHourlyPrice(fieldDoc) {
  const hourly = Number(fieldDoc?.hourlyPrice);
  if (Number.isFinite(hourly) && hourly > 0) return hourly;

  const legacy = Number(fieldDoc?.price);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;

  return 0;
}

function toWishlistItemDto(fieldDoc) {
  const sizeKey = inferSizeKey(fieldDoc);
  const hourlyPrice = getEffectiveHourlyPrice(fieldDoc);
  const city = inferCity(fieldDoc);

  return {
    id: String(fieldDoc?._id || ''),
    name: fieldDoc?.fieldName || '',
    address: fieldDoc?.address || '',
    city,
    rating: '5.0',
    size: `${sizeKey}-A-SIDE`,
    sizeKey,
    sizeTone: computeSizeTone(sizeKey),
    hourlyPrice,
    price: hourlyPrice > 0 ? formatVnd(hourlyPrice) : 'Liên hệ',
    utilities: normalizeUtilities(fieldDoc?.utilities),
    image: Array.isArray(fieldDoc?.image) && fieldDoc.image.length ? fieldDoc.image[0] : '',
    imageAlt: 'Field image',
    createdAt: fieldDoc?.createdAt,
    updatedAt: fieldDoc?.updatedAt,
  };
}

function toUniqueValidObjectIdStrings(values) {
  const list = Array.isArray(values) ? values : [];
  const ids = list
    .map((value) => String(value || '').trim())
    .filter((value) => value && mongoose.Types.ObjectId.isValid(value));
  return Array.from(new Set(ids));
}

function getFieldIdFromRequest(req) {
  const bodyFieldId = req?.body?.fieldID ?? req?.body?.fieldId ?? req?.body?.id;
  if (bodyFieldId !== undefined && bodyFieldId !== null) {
    return String(bodyFieldId).trim();
  }

  const paramFieldId = req?.params?.fieldID ?? req?.params?.fieldId ?? req?.params?.id;
  return String(paramFieldId || '').trim();
}

async function loadCustomerWishlistItems(customerID) {
  const docs = await Wishlist.find({ customerID })
    .sort({ createdAt: -1 })
    .populate({ path: 'fieldID', select: 'fieldName address city fieldType sizeKey hourlyPrice price utilities image status createdAt updatedAt' })
    .lean();

  return docs
    .map((doc) => doc?.fieldID)
    .filter((fieldDoc) => fieldDoc && String(fieldDoc.status || '').trim() !== 'Deleted')
    .map(toWishlistItemDto);
}

async function getMyWishlist(req, res) {
  const customerID = getAuthenticatedUserId(req);
  if (!customerID) throw createHttpError(401, 'Unauthorized.');

  const items = await loadCustomerWishlistItems(customerID);
  return res.status(200).json({ success: true, items });
}

async function addWishlistItem(req, res) {
  const customerID = getAuthenticatedUserId(req);
  if (!customerID) throw createHttpError(401, 'Unauthorized.');

  const fieldID = getFieldIdFromRequest(req);
  if (!mongoose.Types.ObjectId.isValid(fieldID)) {
    throw createHttpError(400, 'fieldID is invalid.');
  }

  const existingField = await Field.findOne({ _id: fieldID, status: { $ne: 'Deleted' } }).select('_id').lean();
  if (!existingField) throw createHttpError(404, 'Field not found.');

  await Wishlist.updateOne(
    { customerID, fieldID },
    { $setOnInsert: { customerID, fieldID } },
    { upsert: true }
  );

  const items = await loadCustomerWishlistItems(customerID);
  return res.status(200).json({ success: true, items });
}

async function removeWishlistItem(req, res) {
  const customerID = getAuthenticatedUserId(req);
  if (!customerID) throw createHttpError(401, 'Unauthorized.');

  const fieldID = getFieldIdFromRequest(req);
  if (!mongoose.Types.ObjectId.isValid(fieldID)) {
    throw createHttpError(400, 'fieldID is invalid.');
  }

  await Wishlist.deleteOne({ customerID, fieldID });

  const items = await loadCustomerWishlistItems(customerID);
  return res.status(200).json({ success: true, items });
}

async function mergeGuestWishlist(req, res) {
  const customerID = getAuthenticatedUserId(req);
  if (!customerID) throw createHttpError(401, 'Unauthorized.');

  const guestFieldIds = toUniqueValidObjectIdStrings(req?.body?.guestFieldIds);
  if (guestFieldIds.length === 0) {
    const items = await loadCustomerWishlistItems(customerID);
    return res.status(200).json({ success: true, mergedCount: 0, items });
  }

  const availableFields = await Field.find({
    _id: { $in: guestFieldIds },
    status: { $ne: 'Deleted' },
  })
    .select('_id')
    .lean();

  const availableFieldIds = availableFields.map((fieldDoc) => String(fieldDoc._id));
  if (availableFieldIds.length === 0) {
    const items = await loadCustomerWishlistItems(customerID);
    return res.status(200).json({ success: true, mergedCount: 0, items });
  }

  const existingWishlistRows = await Wishlist.find({
    customerID,
    fieldID: { $in: availableFieldIds },
  })
    .select('fieldID')
    .lean();

  const existingFieldIdSet = new Set(existingWishlistRows.map((row) => String(row.fieldID)));
  const rowsToInsert = availableFieldIds
    .filter((fieldID) => !existingFieldIdSet.has(fieldID))
    .map((fieldID) => ({ customerID, fieldID }));

  if (rowsToInsert.length > 0) {
    try {
      await Wishlist.insertMany(rowsToInsert, { ordered: false });
    } catch (error) {
      const isDuplicateKey = error?.code === 11000;
      const duplicateWriteErrors = Array.isArray(error?.writeErrors)
        ? error.writeErrors.every((writeError) => writeError?.code === 11000)
        : false;

      if (!isDuplicateKey && !duplicateWriteErrors) throw error;
    }
  }

  const items = await loadCustomerWishlistItems(customerID);
  return res.status(200).json({ success: true, mergedCount: rowsToInsert.length, items });
}

module.exports = {
  getMyWishlist,
  addWishlistItem,
  removeWishlistItem,
  mergeGuestWishlist,
};