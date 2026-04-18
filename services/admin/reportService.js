const mongoose = require('mongoose');

const Report = require('../../models/Report');

function normalizeReport(doc) {
  return {
    id: doc._id,
    reporter: doc.reporterID
      ? { id: doc.reporterID._id, username: doc.reporterID.username, email: doc.reporterID.email, name: doc.reporterID.name }
      : null,
    target: doc.targetID
      ? { id: doc.targetID._id, username: doc.targetID.username, email: doc.targetID.email, name: doc.targetID.name }
      : null,
    reportType: doc.reportType,
    description: doc.description,
    evidence: Array.isArray(doc.evidence) ? doc.evidence : [],
    status: doc.status,
    adminNote: doc.adminNote || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listReports() {
  const reports = await Report.find()
    .populate('reporterID')
    .populate('targetID')
    .sort({ createdAt: -1 });

  return { status: 200, body: { items: reports.map(normalizeReport) } };
}

async function updateStatus({ id, payload }) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };

  const { status, adminNote } = payload || {};
  const nextStatus = String(status || '').trim();

  if (!['Resolved', 'Rejected'].includes(nextStatus)) {
    return { status: 400, body: { message: 'Trạng thái không hợp lệ.' } };
  }

  const note = typeof adminNote === 'string' ? adminNote.trim() : '';
  if (nextStatus === 'Rejected' && !note) {
    return { status: 400, body: { message: 'Vui lòng nhập note khi reject.' } };
  }

  const report = await Report.findById(id).populate('reporterID').populate('targetID');
  if (!report) return { status: 404, body: { message: 'Không tìm thấy report.' } };

  report.status = nextStatus;
  if (typeof adminNote === 'string') report.adminNote = note;
  await report.save();

  const fresh = await Report.findById(id).populate('reporterID').populate('targetID');
  return { status: 200, body: { message: 'Cập nhật report thành công.', item: normalizeReport(fresh) } };
}

module.exports = {
  listReports,
  updateStatus,
};
