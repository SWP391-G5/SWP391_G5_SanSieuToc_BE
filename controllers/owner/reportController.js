const mongoose = require('mongoose');

const Report = require('../../models/Report');
const UserAccount = require('../../models/UserAccount');
const Booking = require('../../models/Booking');
const BookingDetail = require('../../models/BookingDetail');
const Field = require('../../models/Field');

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

function normalizeReport(doc) {
  const reportTypeKey = String(doc.reportType || '').trim().toLowerCase();
  const inferredTargetType = doc.targetType || (!doc.targetID && reportTypeKey.includes('system') ? 'System' : 'Customer');

  return {
    id: doc._id,
    reportType: doc.reportType,
    targetType: inferredTargetType,
    target:
      inferredTargetType === 'System'
        ? { id: 'system', username: 'system', email: '', name: 'Hệ thống' }
        : doc.targetID
          ? {
              id: doc.targetID._id,
              username: doc.targetID.username,
              email: doc.targetID.email,
              name: doc.targetID.name,
            }
          : null,
    description: doc.description,
    evidence: Array.isArray(doc.evidence) ? doc.evidence : [],
    status: doc.status,
    adminNote: doc.adminNote || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function validateEvidence(list) {
  const arr = Array.isArray(list) ? list.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (arr.length < 1) return { ok: false, message: 'Vui lòng cung cấp ít nhất 1 ảnh bằng chứng.' };
  if (arr.length > 5) return { ok: false, message: 'Bằng chứng tối đa 5 ảnh.' };
  return { ok: true, value: arr.slice(0, 5) };
}

async function ownerHasCustomerBooking({ ownerId, customerId }) {
  if (!mongoose.isValidObjectId(ownerId) || !mongoose.isValidObjectId(customerId)) return false;

  const oId = new mongoose.Types.ObjectId(ownerId);
  const cId = new mongoose.Types.ObjectId(customerId);

  const fieldIds = await Field.find({ ownerID: oId, status: { $ne: 'Deleted' } }).distinct('_id');
  if (!fieldIds.length) return false;

  // Since fieldID in BookingDetail might be stored as String or ObjectId (it is Mixed type),
  // we should check for both.
  const fieldIdStrings = fieldIds.map((id) => id.toString());
  const combinedFieldIds = [...fieldIds, ...fieldIdStrings];

  const bookingIds = await Booking.find({ customerID: cId }).distinct('_id');
  if (!bookingIds.length) return false;

  const any = await BookingDetail.findOne({
    bookingID: { $in: bookingIds },
    fieldID: { $in: combinedFieldIds },
  }).select('_id');

  return Boolean(any);
}

async function listEligibleCustomers(req, res) {
  const ownerId = req.user?.sub;
  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });

  const oId = new mongoose.Types.ObjectId(ownerId);

  const fieldIds = await Field.find({ ownerID: oId, status: { $ne: 'Deleted' } }).distinct('_id');
  if (!fieldIds.length) return res.json({ items: [] });

  const fieldIdStrings = fieldIds.map((id) => id.toString());
  const combinedFieldIds = [...fieldIds, ...fieldIdStrings];

  const bookingIds = await BookingDetail.find({ fieldID: { $in: combinedFieldIds } }).distinct('bookingID');
  if (!bookingIds.length) return res.json({ items: [] });

  const customerIds = await Booking.find({ _id: { $in: bookingIds } }).distinct('customerID');
  if (!customerIds.length) return res.json({ items: [] });

  const customers = await UserAccount.find({ _id: { $in: customerIds } })
    .select('username email name')
    .sort({ createdAt: -1 });

  return res.json({
    items: customers.map((c) => ({ id: c._id, username: c.username, email: c.email, name: c.name })),
  });
}

async function listMyReports(req, res) {
  const ownerId = req.user?.sub;
  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });

  const reports = await Report.find({ reporterID: ownerId }).populate('targetID').sort({ createdAt: -1 });
  return res.json({ items: reports.map(normalizeReport) });
}

async function createReport(req, res) {
  const ownerId = req.user?.sub;
  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });

  const canonicalType = canonicalizeReportType(req.body?.reportType);
  if (!isAllowedReportType(canonicalType)) {
    return res.status(400).json({ message: 'Kiểu report không hợp lệ.' });
  }

  const description = String(req.body?.description || '').trim();
  if (!description) return res.status(400).json({ message: 'Mô tả là bắt buộc.' });

  const ev = validateEvidence(req.body?.evidence);
  if (!ev.ok) return res.status(400).json({ message: ev.message });

  const isSystem = canonicalType === 'System Problem';

  let targetType = 'Customer';
  let targetId = null;

  if (isSystem) {
    targetType = 'System';
    targetId = null;
  } else {
    const customerId = req.body?.targetCustomerId || req.body?.targetID || req.body?.targetId;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ message: 'Vui lòng chọn Customer bị report.' });
    }

    const ok = await ownerHasCustomerBooking({ ownerId, customerId });
    if (!ok) {
      return res.status(400).json({ message: 'Customer này chưa từng booking sân của bạn.' });
    }

    targetType = 'Customer';
    targetId = customerId;
  }

  const doc = await Report.create({
    reporterID: ownerId,
    targetType,
    targetID: targetId || undefined,
    reportType: canonicalType,
    description,
    evidence: ev.value,
    status: 'Pending',
  });

  const fresh = await Report.findById(doc._id).populate('targetID');
  return res.status(201).json({ message: 'Đã gửi report.', item: normalizeReport(fresh) });
}

async function updateReport(req, res) {
  const ownerId = req.user?.sub;
  const id = req.params?.id;

  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'ID không hợp lệ.' });

  const report = await Report.findOne({ _id: id, reporterID: ownerId }).populate('targetID');
  if (!report) return res.status(404).json({ message: 'Không tìm thấy report.' });

  if (report.status !== 'Pending') {
    return res.status(403).json({ message: 'Chỉ được sửa report khi admin chưa duyệt/từ chối.' });
  }

  const canonicalType = canonicalizeReportType(req.body?.reportType);
  if (!isAllowedReportType(canonicalType)) {
    return res.status(400).json({ message: 'Kiểu report không hợp lệ.' });
  }

  const description = String(req.body?.description || '').trim();
  if (!description) return res.status(400).json({ message: 'Mô tả là bắt buộc.' });

  const ev = validateEvidence(req.body?.evidence);
  if (!ev.ok) return res.status(400).json({ message: ev.message });

  const isSystem = canonicalType === 'System Problem';

  if (isSystem) {
    report.targetType = 'System';
    report.targetID = undefined;
  } else {
    const customerId = req.body?.targetCustomerId || req.body?.targetID || req.body?.targetId;
    if (!mongoose.isValidObjectId(customerId)) {
      return res.status(400).json({ message: 'Vui lòng chọn Customer bị report.' });
    }

    const ok = await ownerHasCustomerBooking({ ownerId, customerId });
    if (!ok) {
      return res.status(400).json({ message: 'Customer này chưa từng booking sân của bạn.' });
    }

    report.targetType = 'Customer';
    report.targetID = customerId;
  }

  report.reportType = canonicalType;
  report.description = description;
  report.evidence = ev.value;
  await report.save();

  const fresh = await Report.findById(report._id).populate('targetID');
  return res.json({ message: 'Đã cập nhật report.', item: normalizeReport(fresh) });
}

async function deleteReport(req, res) {
  const ownerId = req.user?.sub;
  const id = req.params?.id;

  if (!mongoose.isValidObjectId(ownerId)) return res.status(401).json({ message: 'Unauthorized' });
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'ID không hợp lệ.' });

  const report = await Report.findOne({ _id: id, reporterID: ownerId });
  if (!report) return res.status(404).json({ message: 'Không tìm thấy report.' });

  if (report.status !== 'Pending') {
    return res.status(403).json({ message: 'Chỉ được xóa report khi admin chưa duyệt/từ chối.' });
  }

  await Report.deleteOne({ _id: report._id });
  return res.json({ message: 'Đã xóa report.' });
}

module.exports = {
  listEligibleCustomers,
  listMyReports,
  createReport,
  updateReport,
  deleteReport,
};
