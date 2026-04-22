/**
 * services/manager/feedbackService.js
 */

const mongoose = require('mongoose');

const Feedback = require('../../models/Feedback');
const BookingDetail = require('../../models/BookingDetail');
const Field = require('../../models/Field');
const managerScopeService = require('./managerScopeService');
const mailer = require('../../utils/mailer');
const UserAccount = require('../../models/UserAccount');
const Booking = require('../../models/Booking');

function toObjectIdLike(raw) {
  if (!raw) return null;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  if (typeof raw === 'object') return raw._id || raw.id || raw.$oid || null;
  return raw;
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseIntSafe(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseRate(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const r = Number(raw);
  if (!Number.isFinite(r)) return null;
  if (r < 1 || r > 5) return null;
  return Math.round(r);
}

async function getManagedFieldIds(managerId) {
  const { status, body } = await managerScopeService.listManagedOwners(managerId);
  if (status !== 200) return { status, message: body?.message || 'Unauthorized', fieldIds: [] };

  const fields = (body?.items || []).flatMap((o) => o?.fields || []);
  const ids = fields.map((f) => String(f?.id || f?._id || '')).filter(Boolean);
  return { status: 200, message: 'OK', fieldIds: ids };
}

async function listFeedback(managerId, query = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }

  const { fieldIds, status } = await getManagedFieldIds(managerId);
  if (status !== 200) return { status, body: { message: 'Unauthorized' } };

  const ownerId = String(query.ownerId || '').trim();
  const fieldId = String(query.fieldId || '').trim();
  const q = String(query.q || '').trim();
  const rate = parseRate(query.rate);
  const includeDeleted = String(query.includeDeleted || '').trim() === 'true';

  const page = Math.max(1, parseIntSafe(query.page, 1));
  const limit = Math.min(50, Math.max(5, parseIntSafe(query.limit, 10)));
  const skip = (page - 1) * limit;

  // If FE passes fieldId, enforce it belongs to managed field set.
  if (fieldId && !fieldIds.includes(fieldId)) {
    return { status: 403, body: { message: 'Forbidden' } };
  }

  // Build allowed field filter.
  const allowedFieldIds = fieldId ? [fieldId] : fieldIds;

  // Pipeline: Feedback -> BookingDetail (contains fieldID) -> Field (to get owner)
  const matchStages = [];

  // Include or exclude moderated-deleted feedback
  if (includeDeleted) matchStages.push({ $match: { isDeleted: true } });
  else matchStages.push({ $match: { isDeleted: { $ne: true } } });

  if (rate) {
    matchStages.push({ $match: { rate } });
  }

  if (q) {
    matchStages.push({ $match: { content: { $regex: new RegExp(escapeRegex(q), 'i') } } });
  }

  const pipeline = [
    ...matchStages,
    {
      $lookup: {
        from: 'bookingdetails',
        localField: 'bookingDetailID',
        foreignField: '_id',
        as: 'bd',
      },
    },
    { $unwind: '$bd' },
    // Normalize field id from BookingDetail.fieldID (Mixed)
    {
      $addFields: {
        fieldIdStr: {
          $cond: [
            { $eq: [{ $type: '$bd.fieldID' }, 'objectId'] },
            { $toString: '$bd.fieldID' },
            {
              $cond: [
                { $eq: [{ $type: '$bd.fieldID' }, 'string'] },
                '$bd.fieldID',
                { $toString: '$bd.fieldID' },
              ],
            },
          ],
        },
      },
    },
    // Filter by managed fields
    { $match: { fieldIdStr: { $in: allowedFieldIds } } },
    // Join Field for owner + field name (more reliable than snapshot)
    {
      $lookup: {
        from: 'fields',
        let: { fid: '$fieldIdStr' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [{ $toString: '$_id' }, '$$fid'] },
                  { $ne: ['$status', 'Deleted'] },
                ],
              },
            },
          },
          { $project: { _id: 1, fieldName: 1, ownerID: 1 } },
        ],
        as: 'field',
      },
    },
    { $unwind: { path: '$field', preserveNullAndEmptyArrays: true } },

    // Join Booking -> UserAccount to get customer name/email for UI + email notify.
    {
      $lookup: {
        from: 'bookings',
        localField: 'bd.bookingID',
        foreignField: '_id',
        as: 'booking',
      },
    },
    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        customerIdStr: {
          $cond: [
            { $eq: [{ $type: '$booking.customerID' }, 'objectId'] },
            { $toString: '$booking.customerID' },
            {
              $cond: [
                { $eq: [{ $type: '$booking.customerID' }, 'string'] },
                '$booking.customerID',
                { $toString: '$booking.customerID' },
              ],
            },
          ],
        },
      },
    },
    {
      $lookup: {
        from: 'useraccounts',
        let: { uid: '$customerIdStr' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$uid'] } } },
          { $project: { _id: 1, email: 1, name: 1, username: 1, fullName: 1 } },
        ],
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
  ];

  if (ownerId) {
    // ownerID is ObjectId; compare as string
    pipeline.push({ $match: { $expr: { $eq: [{ $toString: '$field.ownerID' }, ownerId] } } });
  }

  pipeline.push(
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              rate: 1,
              content: 1,
              createdAt: 1,
              // Hide raw ids from FE table if desired; still keep them for actions.
              bookingDetailID: 1,
              fieldId: '$fieldIdStr',
              fieldName: { $ifNull: ['$field.fieldName', '$bd.fieldName'] },
              ownerId: { $toString: '$field.ownerID' },

              customerName: { $ifNull: ['$customer.name', { $ifNull: ['$customer.fullName', '$customer.username'] }] },
              customerEmail: '$customer.email',

              // Soft-delete audit fields: needed by FE to display deletion reason & timestamp
              isDeleted: 1,
              deletedAt: 1,
              deleteReason: 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    }
  );

  const rows = await Feedback.aggregate(pipeline);
  const first = rows?.[0] || {};
  const items = Array.isArray(first.items) ? first.items : [];
  const total = Number(first.total?.[0]?.count) || 0;

  return {
    status: 200,
    body: {
      items,
      pagination: { page, limit, total },
    },
  };
}

async function getSummary(managerId, query = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }

  const { fieldIds, status } = await getManagedFieldIds(managerId);
  if (status !== 200) return { status, body: { message: 'Unauthorized' } };

  const ownerId = String(query.ownerId || '').trim();
  const fieldId = String(query.fieldId || '').trim();
  if (fieldId && !fieldIds.includes(fieldId)) return { status: 403, body: { message: 'Forbidden' } };

  const allowedFieldIds = fieldId ? [fieldId] : fieldIds;

  const pipeline = [
    { $match: { isDeleted: { $ne: true } } },
    {
      $lookup: {
        from: 'bookingdetails',
        localField: 'bookingDetailID',
        foreignField: '_id',
        as: 'bd',
      },
    },
    { $unwind: '$bd' },
    {
      $addFields: {
        fieldIdStr: {
          $cond: [
            { $eq: [{ $type: '$bd.fieldID' }, 'objectId'] },
            { $toString: '$bd.fieldID' },
            {
              $cond: [
                { $eq: [{ $type: '$bd.fieldID' }, 'string'] },
                '$bd.fieldID',
                { $toString: '$bd.fieldID' },
              ],
            },
          ],
        },
      },
    },
    { $match: { fieldIdStr: { $in: allowedFieldIds } } },
    {
      $lookup: {
        from: 'fields',
        let: { fid: '$fieldIdStr' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: [{ $toString: '$_id' }, '$$fid'] },
                  { $ne: ['$status', 'Deleted'] },
                ],
              },
            },
          },
          { $project: { _id: 1, ownerID: 1 } },
        ],
        as: 'field',
      },
    },
    { $unwind: { path: '$field', preserveNullAndEmptyArrays: true } },
  ];

  if (ownerId) {
    pipeline.push({ $match: { $expr: { $eq: [{ $toString: '$field.ownerID' }, ownerId] } } });
  }

  pipeline.push({
    $group: {
      _id: null,
      totalFeedback: { $sum: 1 },
      avgRating: { $avg: '$rate' },
      oneStar: { $sum: { $cond: [{ $eq: ['$rate', 1] }, 1, 0] } },
      fiveStar: { $sum: { $cond: [{ $eq: ['$rate', 5] }, 1, 0] } },
    },
  });

  const rows = await Feedback.aggregate(pipeline);
  const row = rows?.[0] || {};

  return {
    status: 200,
    body: {
      item: {
        totalFeedback: Number(row.totalFeedback) || 0,
        avgRating: row.avgRating ? Number(row.avgRating).toFixed(1) : 0,
        oneStar: Number(row.oneStar) || 0,
        fiveStar: Number(row.fiveStar) || 0,
      },
    },
  };
}

async function deleteFeedback(managerId, feedbackId, payload = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }
  if (!mongoose.isValidObjectId(String(feedbackId))) {
    return { status: 400, body: { message: 'Invalid feedbackId' } };
  }

  const reason = String(payload.reason || '').trim();
  if (!reason) {
    return { status: 400, body: { message: 'Delete reason is required' } };
  }

  // Scope check: ensure feedback belongs to a managed field
  const { fieldIds, status } = await getManagedFieldIds(managerId);
  if (status !== 200) return { status, body: { message: 'Unauthorized' } };

  const doc = await Feedback.findById(feedbackId).lean();
  if (!doc) return { status: 404, body: { message: 'Feedback not found' } };
  if (doc.isDeleted) return { status: 409, body: { message: 'Feedback already deleted' } };

  // Load booking detail to get fieldID
  const bd = await BookingDetail.findById(doc.bookingDetailID).lean();
  if (!bd) return { status: 404, body: { message: 'Booking detail not found' } };

  const fieldIdStr = String(toObjectIdLike(bd.fieldID) || '');
  if (!fieldIdStr || !fieldIds.includes(fieldIdStr)) {
    return { status: 403, body: { message: 'Forbidden' } };
  }

  const updated = await Feedback.findByIdAndUpdate(
    feedbackId,
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: managerId,
        deleteReason: reason,
      },
    },
    { new: true }
  ).lean();

  // Best-effort email notification (do not fail the delete if email is not configured)
  try {
    // Feedback does NOT store user reference; derive customer from BookingDetail.bookingID -> Booking.customerID.
    const booking = await Booking.findById(bd.bookingID).select('customerID').lean();
    const userId = String(toObjectIdLike(booking?.customerID) || '').trim();
    if (mongoose.isValidObjectId(userId)) {
      const user = await UserAccount.findById(userId).select('email name username fullName').lean();
      const email = user?.email;
      if (email) {
        await mailer.sendFeedbackDeletionNoticeEmail({
          to: email,
          name: user?.name || user?.fullName || user?.username || '',
          fieldName: bd?.fieldName || '',
          feedbackContent: updated?.content || '',
          reason,
        });
      }
    }
  } catch (_) {
    // ignore
  }

  return { status: 200, body: { item: updated } };
}

async function restoreFeedback(managerId, feedbackId) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }
  if (!mongoose.isValidObjectId(String(feedbackId))) {
    return { status: 400, body: { message: 'Invalid feedbackId' } };
  }

  // Scope check: ensure feedback belongs to a managed field
  const { fieldIds, status } = await getManagedFieldIds(managerId);
  if (status !== 200) return { status, body: { message: 'Unauthorized' } };

  const doc = await Feedback.findById(feedbackId).lean();
  if (!doc) return { status: 404, body: { message: 'Feedback not found' } };
  if (!doc.isDeleted) return { status: 409, body: { message: 'Feedback is not deleted' } };

  const bd = await BookingDetail.findById(doc.bookingDetailID).lean();
  if (!bd) return { status: 404, body: { message: 'Booking detail not found' } };

  const fieldIdStr = String(toObjectIdLike(bd.fieldID) || '');
  if (!fieldIdStr || !fieldIds.includes(fieldIdStr)) {
    return { status: 403, body: { message: 'Forbidden' } };
  }

  const updated = await Feedback.findByIdAndUpdate(
    feedbackId,
    {
      $set: {
        isDeleted: false,
      },
      $unset: {
        deletedAt: 1,
        deletedBy: 1,
        deleteReason: 1,
      },
    },
    { new: true }
  ).lean();

  return { status: 200, body: { item: updated } };
}

module.exports = {
  listFeedback,
  getSummary,
  deleteFeedback,
  restoreFeedback,
};
