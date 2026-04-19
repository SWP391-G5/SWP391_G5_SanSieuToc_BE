/**
 * controllers/manager/feedbackController.js
 */

const feedbackService = require('../../services/manager/feedbackService');

async function listFeedback(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await feedbackService.listFeedback(managerId, req.query);
  return res.status(status).json(body);
}

async function getSummary(req, res) {
  const managerId = req.user?.sub;
  const { status, body } = await feedbackService.getSummary(managerId, req.query);
  return res.status(status).json(body);
}

async function deleteFeedback(req, res) {
  const managerId = req.user?.sub;
  const feedbackId = req.params.id;
  const { status, body } = await feedbackService.deleteFeedback(managerId, feedbackId, req.body);
  return res.status(status).json(body);
}

module.exports = {
  listFeedback,
  getSummary,
  deleteFeedback,
};
