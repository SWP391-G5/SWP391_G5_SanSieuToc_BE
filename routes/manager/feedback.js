/**
 * routes/manager/feedback.js
 * Manager/Admin feedback routes.
 */

const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const feedbackController = require('../../controllers/manager/feedbackController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Manager']));

// GET /api/manager/feedback?ownerId=&fieldId=&q=&rate=&page=&limit=
router.get('/', asyncHandler(feedbackController.listFeedback));

// GET /api/manager/feedback/summary?ownerId=&fieldId=
router.get('/summary', asyncHandler(feedbackController.getSummary));

// DELETE /api/manager/feedback/:id  body: { reason }
router.delete('/:id', asyncHandler(feedbackController.deleteFeedback));

module.exports = router;
