const statisticsService = require('../../services/manager/statisticsService');

async function getSummary(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await statisticsService.getSummary(managerId, req.query);
  return res.status(status).json(body);
}

async function getBookingsTrend(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await statisticsService.getBookingsTrend(managerId, req.query);
  return res.status(status).json(body);
}

async function getRevenueTrend(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await statisticsService.getRevenueTrend(managerId, req.query);
  return res.status(status).json(body);
}

async function getHotFields(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await statisticsService.getHotFields(managerId, req.query);
  return res.status(status).json(body);
}

module.exports = {
  getSummary,
  getBookingsTrend,
  getRevenueTrend,
  getHotFields,
};
