const express = require('express');

const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const asyncHandler = require('../../middlewares/asyncHandler');
const feedbackController = require('../../controllers/owner/feedbackController');

const router = express.Router();

// All routes require login + Owner role
router.use(authenticate, authorizeRoles(['Owner']));

// GET /api/owner/feedbacks/fields
router.get('/fields', asyncHandler(feedbackController.listMyFields));

// GET /api/owner/feedbacks?fieldId=&q=&rate=&limit=
router.get('/', asyncHandler(feedbackController.listFeedbacks));

// POST /api/owner/feedbacks/:id/report
router.post('/:id/report', asyncHandler(feedbackController.reportFeedback));

module.exports = router;
