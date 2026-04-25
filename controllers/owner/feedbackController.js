const mongoose = require('mongoose');

const Feedback = require('../../models/Feedback');
const BookingDetail = require('../../models/BookingDetail');
const Booking = require('../../models/Booking');
const Field = require('../../models/Field');
const UserAccount = require('../../models/UserAccount');
const Report = require('../../models/Report');

function toObjectIdLike(raw) {
  if (!raw) return null;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  if (typeof raw === 'object') return raw._id || raw.id || raw.$oid || null;
  return raw;
}

function parseIntSafe(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRate(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const r = Number(raw);
  if (!Number.isFinite(r)) return null;
  if (r < 1 || r > 5) return null;
  return Math.round(r);
}

function canonicalizeReportType(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase();

  if (!raw) return '';

  if (key === 'spam') return 'Spam';
  if (key === 'inappropriate behavior' || key === 'inappropriate' || key === 'behavior') return 'Inappropriate Behavior';
  if (key === 'system problem' || key === 'system' || key === 'system issue' || key === 'problem') return 'System Problem';

  return raw;
}

function isAllowedReportType(canonicalType) {
  return ['Spam', 'Inappropriate Behavior', 'System Problem'].includes(canonicalType);
}

function validateEvidence(list) {
  const arr = Array.isArray(list) ? list.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (arr.length < 1) return { ok: false, message: 'Vui lòng cung cấp ít nhất 1 ảnh bằng chứng.' };
  if (arr.length > 5) return { ok: false, message: 'Bằng chứng tối đa 5 ảnh.' };
  return { ok: true, value: arr.slice(0, 5) };
}

async function getOwnerFieldIds(ownerId) {
  const ids = await Field.find({ ownerID: ownerId, status: { $ne: 'Deleted' } }).distinct('_id');
  return ids.map((x) => String(x)).filter(Boolean);
}

async function listMyFields(req, res) {
  const ownerId = req.user?.sub;
  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });

  const fields = await Field.find({ ownerID: ownerId, status: { $ne: 'Deleted' } })
    .select('fieldName')
    .sort({ createdAt: -1 })
    .lean();

  return res.json({
    items: (fields || []).map((f) => ({ id: f._id, fieldName: f.fieldName })),
  });
}

// GET /api/owner/feedbacks?fieldId=&q=&rate=&limit=
async function listFeedbacks(req, res) {
  const ownerId = req.user?.sub;
  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });

  const ownerFieldIds = await getOwnerFieldIds(ownerId);
  if (!ownerFieldIds.length) return res.json({ items: [] });

  const fieldId = String(req.query?.fieldId || '').trim();
  const q = String(req.query?.q || '').trim();
  const rate = parseRate(req.query?.rate);

  const limit = Math.min(500, Math.max(1, parseIntSafe(req.query?.limit, 200)));
  const period = String(req.query?.period || '').trim().toLowerCase();

  if (fieldId && !ownerFieldIds.includes(fieldId)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const allowedFieldIds = fieldId ? [fieldId] : ownerFieldIds;

  const matchStages = [{ $match: { isDeleted: { $ne: true } } }];
  if (rate) matchStages.push({ $match: { rate } });
  if (q) matchStages.push({ $match: { content: { $regex: new RegExp(escapeRegex(q), 'i') } } });

  if (period) {
    const now = new Date();
    let startDate = null;
    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }
    if (startDate) {
      matchStages.push({ $match: { createdAt: { $gte: startDate } } });
    }
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
                  { $eq: [{ $toString: '$ownerID' }, String(ownerId)] },
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

    { $sort: { createdAt: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        rate: 1,
        content: 1,
        createdAt: 1,
        bookingDetailID: 1,
        fieldId: '$fieldIdStr',
        fieldName: { $ifNull: ['$field.fieldName', '$bd.fieldName'] },
        customerId: '$customerIdStr',
        customerName: { $ifNull: ['$customer.name', { $ifNull: ['$customer.fullName', '$customer.username'] }] },
        customerEmail: '$customer.email',
      },
    },
  ];

  const items = await Feedback.aggregate(pipeline);
  return res.json({ items: Array.isArray(items) ? items : [] });
}

// POST /api/owner/feedbacks/:id/report
async function reportFeedback(req, res) {
  const ownerId = req.user?.sub;
  const feedbackId = req.params?.id;

  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });
  if (!mongoose.isValidObjectId(feedbackId)) return res.status(400).json({ message: 'ID feedback không hợp lệ.' });

  const canonicalType = canonicalizeReportType(req.body?.reportType);
  if (!isAllowedReportType(canonicalType)) {
    return res.status(400).json({ message: 'Kiểu report không hợp lệ.' });
  }

  const descriptionRaw = String(req.body?.description || '').trim();
  if (!descriptionRaw) return res.status(400).json({ message: 'Mô tả là bắt buộc.' });

  const ev = validateEvidence(req.body?.evidence);
  if (!ev.ok) return res.status(400).json({ message: ev.message });

  const ownerFieldIds = await getOwnerFieldIds(ownerId);
  if (!ownerFieldIds.length) return res.status(403).json({ message: 'Forbidden' });

  const feedback = await Feedback.findById(feedbackId).lean();
  if (!feedback) return res.status(404).json({ message: 'Không tìm thấy feedback.' });

  const bd = await BookingDetail.findById(feedback.bookingDetailID).lean();
  if (!bd) return res.status(404).json({ message: 'Không tìm thấy booking detail.' });

  const fieldIdStr = String(toObjectIdLike(bd.fieldID) || '').trim();
  if (!fieldIdStr || !ownerFieldIds.includes(fieldIdStr)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const booking = await Booking.findById(bd.bookingID).lean();
  const customerId = String(toObjectIdLike(booking?.customerID) || '').trim();
  if (!mongoose.isValidObjectId(customerId)) {
    return res.status(400).json({ message: 'Không xác định được customer của feedback.' });
  }

  // Add minimal context so admin can correlate to the feedback quickly.
  const field = await Field.findById(fieldIdStr).select('fieldName').lean();
  const customer = await UserAccount.findById(customerId).select('name username email fullName').lean();

  const ctxLines = [
    '---',
    `FeedbackId: ${String(feedbackId)}`,
    `Sân: ${String(field?.fieldName || bd?.fieldName || '').trim()}`,
    `Rating: ${String(feedback?.rate ?? '')}`,
    `Nội dung feedback: ${String(feedback?.content || '').trim()}`,
  ].filter((x) => String(x).trim().length > 0);

  let description = descriptionRaw;
  if (ctxLines.length) {
    description = `${descriptionRaw}\n\n${ctxLines.join('\n')}`;
  }

  // Enforce schema max length 5000
  if (description.length > 5000) description = description.slice(0, 5000);

  const doc = await Report.create({
    reporterID: ownerId,
    targetType: 'Customer',
    targetID: customerId,
    reportType: canonicalType,
    description,
    evidence: ev.value,
    status: 'Pending',
  });

  return res.status(201).json({
    message: 'Đã gửi report feedback.',
    item: {
      id: doc._id,
      reportType: doc.reportType,
      targetType: 'Customer',
      target: {
        id: customer?._id || customerId,
        username: customer?.username || '',
        email: customer?.email || '',
        name: customer?.name || customer?.fullName || customer?.username || '',
      },
      description: doc.description,
      evidence: doc.evidence,
      status: doc.status,
      createdAt: doc.createdAt,
    },
  });
}

module.exports = {
  listMyFields,
  listFeedbacks,
  reportFeedback,
};
