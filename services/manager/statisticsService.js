const mongoose = require('mongoose');

const UserAccount = require('../../models/UserAccount');
const Role = require('../../models/Role');
const Field = require('../../models/Field');
const Booking = require('../../models/Booking');
const BookingDetail = require('../../models/BookingDetail');
const Transaction = require('../../models/Transaction');

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toEndOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDateRange(query = {}) {
  // Accept either preset or from/to (YYYY-MM-DD)
  const preset = String(query.preset || '').trim();
  const fromRaw = String(query.from || '').trim();
  const toRaw = String(query.to || '').trim();

  const today = new Date();
  const todayStart = toStartOfDay(today);

  if (preset) {
    if (preset === 'today') {
      return { from: todayStart, to: toEndOfDay(today) };
    }

    if (preset === 'last7days') {
      const from = toStartOfDay(new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000));
      return { from, to: toEndOfDay(today) };
    }

    if (preset === 'thisWeek') {
      // ISO-like week start (Mon)
      const day = (todayStart.getDay() + 6) % 7; // Mon=0
      const from = toStartOfDay(new Date(todayStart.getTime() - day * 24 * 60 * 60 * 1000));
      return { from, to: toEndOfDay(today) };
    }

    if (preset === 'thisMonth') {
      const from = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
      return { from: toStartOfDay(from), to: toEndOfDay(today) };
    }

    if (preset === 'lastMonth') {
      const start = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
      const end = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0);
      return { from: toStartOfDay(start), to: toEndOfDay(end) };
    }

    // ===== Year-based presets (<= 1 year) =====
    if (preset === 'thisYear') {
      const start = new Date(todayStart.getFullYear(), 0, 1);
      return { from: toStartOfDay(start), to: toEndOfDay(today) };
    }

    if (preset === 'lastYear') {
      const start = new Date(todayStart.getFullYear() - 1, 0, 1);
      const end = new Date(todayStart.getFullYear() - 1, 11, 31);
      return { from: toStartOfDay(start), to: toEndOfDay(end) };
    }

    // Rolling 12 months / 365 days (inclusive of today)
    if (preset === 'last365days' || preset === 'last12months') {
      const from = toStartOfDay(new Date(todayStart.getTime() - 364 * 24 * 60 * 60 * 1000));
      return { from, to: toEndOfDay(today) };
    }
  }

  if (fromRaw || toRaw) {
    const from = fromRaw ? toStartOfDay(new Date(fromRaw)) : undefined;
    const to = toRaw ? toEndOfDay(new Date(toRaw)) : undefined;
    return { from, to };
  }

  // Default: this month
  const defaultFrom = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  return { from: toStartOfDay(defaultFrom), to: toEndOfDay(today) };
}

function buildDateMatch(field, range) {
  const cond = {};
  if (range?.from) cond.$gte = range.from;
  if (range?.to) cond.$lte = range.to;
  if (!Object.keys(cond).length) return {};
  return { [field]: cond };
}

async function getOwnerRoleId() {
  // Role schema uses field `name`
  const role = await Role.findOne({ name: 'Owner' }).select('_id').lean();
  return role?._id;
}

async function resolveScopedOwnerIds(managerId, query = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) return [];

  const ownerRoleId = await getOwnerRoleId();
  if (!ownerRoleId) return [];

  const owners = await UserAccount.find({
    roleID: ownerRoleId,
    managerID: managerId,
    status: { $ne: 'Deleted' },
    ...(query.ownerId && mongoose.isValidObjectId(String(query.ownerId))
      ? { _id: String(query.ownerId) }
      : {}),
  })
    .select('_id')
    .lean();

  return owners.map((o) => o._id);
}

async function resolveOwnerInfo(managerId, ownerId) {
  if (!managerId || !ownerId) return null;
  if (!mongoose.isValidObjectId(String(managerId))) return null;
  if (!mongoose.isValidObjectId(String(ownerId))) return null;

  const ownerRoleId = await getOwnerRoleId();
  if (!ownerRoleId) return null;

  const owner = await UserAccount.findOne({
    _id: String(ownerId),
    roleID: ownerRoleId,
    managerID: managerId,
    status: { $ne: 'Deleted' },
  })
    .select('_id username email name phone address status createdAt')
    .lean();

  if (!owner) return null;

  return {
    id: owner._id,
    username: owner.username,
    email: owner.email,
    name: owner.name,
    phone: owner.phone,
    address: owner.address,
    status: owner.status,
    createdAt: owner.createdAt,
  };
}

async function resolveScopedFieldIds(ownerIds, query = {}) {
  if (!ownerIds?.length) return [];

  const fieldMatch = {
    ownerID: { $in: ownerIds },
    status: { $ne: 'Deleted' },
  };

  if (query.fieldId && mongoose.isValidObjectId(String(query.fieldId))) {
    fieldMatch._id = String(query.fieldId);
  }

  const fields = await Field.find(fieldMatch).select('_id fieldName ownerID').lean();
  return fields.map((f) => f._id);
}

async function resolveBookingIdsByFieldIds(fieldIds) {
  if (!fieldIds?.length) return [];

  // BookingDetail.fieldID is Mixed. We try to match both ObjectId and string.
  const idsAsString = fieldIds.map((id) => String(id));

  const details = await BookingDetail.find({
    $or: [{ fieldID: { $in: fieldIds } }, { fieldID: { $in: idsAsString } }],
  })
    .select('bookingID')
    .lean();

  const set = new Set(details.map((d) => String(d.bookingID)).filter(Boolean));
  return Array.from(set);
}

function normalizeGroupBy(groupByRaw) {
  const groupBy = String(groupByRaw || '').trim().toLowerCase();
  if (groupBy === 'day' || groupBy === 'week' || groupBy === 'month') return groupBy;
  return 'day';
}

function groupIdExpr(createdAtField, groupBy) {
  if (groupBy === 'month') {
    return {
      y: { $year: createdAtField },
      m: { $month: createdAtField },
    };
  }

  if (groupBy === 'week') {
    return {
      y: { $isoWeekYear: createdAtField },
      w: { $isoWeek: createdAtField },
    };
  }

  return {
    y: { $year: createdAtField },
    m: { $month: createdAtField },
    d: { $dayOfMonth: createdAtField },
  };
}

function formatLabelFromGroupId(id, groupBy) {
  if (!id) return '';
  if (groupBy === 'month') {
    const mm = String(id.m).padStart(2, '0');
    return `${id.y}-${mm}`;
  }
  if (groupBy === 'week') {
    return `${id.y}-W${String(id.w).padStart(2, '0')}`;
  }
  const mm = String(id.m).padStart(2, '0');
  const dd = String(id.d).padStart(2, '0');
  return `${id.y}-${mm}-${dd}`;
}

async function getSummary(managerId, query = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }

  const range = parseDateRange(query);

  const ownerIds = await resolveScopedOwnerIds(managerId, query);
  const ownersCount = ownerIds.length;

  const focusedOwner = query.ownerId ? await resolveOwnerInfo(managerId, query.ownerId) : null;

  const fieldsCount = ownerIds.length
    ? await Field.countDocuments({ ownerID: { $in: ownerIds }, status: { $ne: 'Deleted' } })
    : 0;

  const fieldIds = await resolveScopedFieldIds(ownerIds, query);
  const bookingIds = await resolveBookingIdsByFieldIds(fieldIds);

  // Total Bookings (unique Booking documents)
  const bookingMatch = {
    ...(bookingIds.length
      ? { _id: { $in: bookingIds.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { _id: { $in: [] } }),
    ...buildDateMatch('createdAt', range),
  };

  const totalBookingsCount = await Booking.countDocuments(bookingMatch);

  // Total slots booked (BookingDetail rows) - same unit as Top Fields
  let totalSlotsBooked = 0;
  if (fieldIds.length) {
    const idsAsString = fieldIds.map((id) => String(id));

    const detailRows = await BookingDetail.aggregate([
      {
        $match: {
          $or: [{ fieldID: { $in: fieldIds } }, { fieldID: { $in: idsAsString } }],
        },
      },
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingID',
          foreignField: '_id',
          as: 'booking',
        },
      },
      { $unwind: '$booking' },
      { $match: buildDateMatch('booking.createdAt', range) },
      { $count: 'total' },
    ]);

    totalSlotsBooked = detailRows?.[0]?.total || 0;
  }

  // Backward-compat: bookingsCount now equals totalBookingsCount
  const bookingsCount = totalBookingsCount;

  const txMatch = {
    ...(bookingIds.length
      ? { bookingID: { $in: bookingIds.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { bookingID: { $in: [] } }),
    ...buildDateMatch('createdAt', range),
  };

  // Field revenue: Field Payment only
  const fieldAgg = await Transaction.aggregate([
    { $match: { ...txMatch, type: 'Field Payment' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  // Service revenue: Service Payment only
  const serviceAgg = await Transaction.aggregate([
    { $match: { ...txMatch, type: 'Service Payment' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  // Gross: Field Payment + Service Payment
  const grossAgg = await Transaction.aggregate([
    { $match: { ...txMatch, type: { $in: ['Field Payment', 'Service Payment'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  // Refund: type=Refund (per your requirement: read refund by transaction status/type only)
  const refundAgg = await Transaction.aggregate([
    { $match: { ...txMatch, type: 'Refund' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const fieldRevenue = fieldAgg?.[0]?.total || 0;
  const serviceRevenue = serviceAgg?.[0]?.total || 0;
  const grossRevenue = grossAgg?.[0]?.total || 0;
  const refundAmount = refundAgg?.[0]?.total || 0;
  const netRevenue = grossRevenue - refundAmount;

  return {
    status: 200,
    body: {
      ownersCount,
      fieldsCount,
      bookingsCount,
      totalBookingsCount,
      totalSlotsBooked,
      fieldRevenue,
      serviceRevenue,
      grossRevenue,
      refundAmount,
      netRevenue,
      ...(focusedOwner ? { focusedOwner } : {}),
    },
  };
}

async function getBookingsTrend(managerId, query = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }

  const range = parseDateRange(query);
  const groupBy = normalizeGroupBy(query.groupBy);

  const ownerIds = await resolveScopedOwnerIds(managerId, query);
  const fieldIds = await resolveScopedFieldIds(ownerIds, query);
  const bookingIds = await resolveBookingIdsByFieldIds(fieldIds);

  const match = {
    ...(bookingIds.length ? { _id: { $in: bookingIds.map((id) => new mongoose.Types.ObjectId(id)) } } : { _id: { $in: [] } }),
    ...buildDateMatch('createdAt', range),
  };

  const rows = await Booking.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupIdExpr('$createdAt', groupBy),
        bookings: { $sum: 1 },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1, '_id.w': 1, '_id.d': 1 } },
  ]);

  const series = rows.map((r) => ({
    label: formatLabelFromGroupId(r._id, groupBy),
    bookings: r.bookings || 0,
  }));

  return {
    status: 200,
    body: {
      groupBy,
      range: {
        from: range.from ? range.from.toISOString() : null,
        to: range.to ? range.to.toISOString() : null,
      },
      series,
    },
  };
}

async function getRevenueTrend(managerId, query = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }

  const range = parseDateRange(query);
  const groupBy = normalizeGroupBy(query.groupBy);

  const ownerIds = await resolveScopedOwnerIds(managerId, query);
  const fieldIds = await resolveScopedFieldIds(ownerIds, query);
  const bookingIds = await resolveBookingIdsByFieldIds(fieldIds);

  const txMatch = {
    ...(bookingIds.length ? { bookingID: { $in: bookingIds.map((id) => new mongoose.Types.ObjectId(id)) } } : { bookingID: { $in: [] } }),
    ...buildDateMatch('createdAt', range),
  };

  const agg = await Transaction.aggregate([
    {
      // keep both payment types + refund in one scan
      $match: {
        ...txMatch,
        type: { $in: ['Field Payment', 'Service Payment', 'Refund'] },
      },
    },
    {
      $group: {
        _id: {
          g: groupIdExpr('$createdAt', groupBy),
          t: '$type',
        },
        total: { $sum: '$amount' },
      },
    },
    {
      $group: {
        _id: '$_id.g',
        fieldRevenue: {
          $sum: {
            $cond: [{ $eq: ['$_id.t', 'Field Payment'] }, '$total', 0],
          },
        },
        serviceRevenue: {
          $sum: {
            $cond: [{ $eq: ['$_id.t', 'Service Payment'] }, '$total', 0],
          },
        },
        gross: {
          $sum: {
            $cond: [{ $in: ['$_id.t', ['Field Payment', 'Service Payment']] }, '$total', 0],
          },
        },
        refund: {
          $sum: {
            $cond: [{ $eq: ['$_id.t', 'Refund'] }, '$total', 0],
          },
        },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1, '_id.w': 1 } },
  ]);

  const series = (agg || []).map((x) => ({
    label: formatLabelFromGroupId(x._id, groupBy),
    fieldRevenue: x.fieldRevenue || 0,
    serviceRevenue: x.serviceRevenue || 0,
    gross: x.gross || 0,
    refund: x.refund || 0,
    net: (x.gross || 0) - (x.refund || 0),
  }));

  return {
    status: 200,
    body: {
      groupBy,
      range,
      series,
    },
  };
}

async function getHotFields(managerId, query = {}) {
  if (!mongoose.isValidObjectId(String(managerId))) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }

  const range = parseDateRange(query);
  const limit = Math.max(1, Math.min(50, Number(query.limit) || 5));

  // STRICT scope: only owners assigned to this manager
  const ownerIds = await resolveScopedOwnerIds(managerId, query);
  const fieldIds = await resolveScopedFieldIds(ownerIds, query);

  if (!fieldIds.length) {
    return {
      status: 200,
      body: {
        range: { from: range.from?.toISOString() || null, to: range.to?.toISOString() || null },
        items: [],
      },
    };
  }

  const idsAsString = fieldIds.map((id) => String(id));

  // Join BookingDetail -> Booking to filter by Booking.createdAt (scoped)
  const rows = await BookingDetail.aggregate([
    {
      // BookingDetail.fieldID is Mixed, so we match both ObjectId and string
      $match: {
        $or: [{ fieldID: { $in: fieldIds } }, { fieldID: { $in: idsAsString } }],
      },
    },
    {
      $lookup: {
        from: 'bookings',
        localField: 'bookingID',
        foreignField: '_id',
        as: 'booking',
      },
    },
    { $unwind: '$booking' },
    { $match: buildDateMatch('booking.createdAt', range) },
    {
      $group: {
        _id: '$fieldID',
        bookingsCount: { $sum: 1 },
      },
    },
    { $sort: { bookingsCount: -1 } },
    { $limit: limit },
  ]);

  // Hydrate fieldName + ownerID from scoped fields only (double safety)
  const rowFieldIds = rows.map((r) => String(r._id));
  const scopedFieldIdStrings = fieldIds.map((x) => String(x));
  const allowSet = new Set(scopedFieldIdStrings);
  const safeFieldIds = rowFieldIds.filter((id) => allowSet.has(String(id)) && mongoose.isValidObjectId(String(id)));

  const fields = await Field.find({ _id: { $in: safeFieldIds } })
    .select('_id fieldName ownerID')
    .lean();
  const metaById = new Map(fields.map((f) => [String(f._id), { fieldName: f.fieldName, ownerId: f.ownerID ? String(f.ownerID) : '' }]));

  const items = rows
    .map((r) => {
      const meta = metaById.get(String(r._id)) || { fieldName: '', ownerId: '' };
      return {
        fieldId: String(r._id),
        fieldName: meta.fieldName || '',
        ownerId: meta.ownerId || '',
        bookingsCount: r.bookingsCount || 0,
      };
    })
    .filter((x) => allowSet.has(String(x.fieldId)));

  return {
    status: 200,
    body: {
      range: { from: range.from?.toISOString() || null, to: range.to?.toISOString() || null },
      items,
    },
  };
}

module.exports = {
  getSummary,
  getBookingsTrend,
  getRevenueTrend,
  getHotFields,
};
