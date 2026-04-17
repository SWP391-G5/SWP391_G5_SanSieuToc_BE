const reportService = require('../../services/admin/reportService');

async function listReports(req, res) {
  const { status, body } = await reportService.listReports();
  return res.status(status).json(body);
}

async function updateStatus(req, res) {
  const { status, body } = await reportService.updateStatus({ id: req.params?.id, payload: req.body });
  return res.status(status).json(body);
}

module.exports = {
  listReports,
  updateStatus,
};
