const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authenticate');
const bookingController = require('../controllers/bookingController');

router.get('/my', authenticate, bookingController.getMyBookings);
router.get('/owner/refund-requests', authenticate, bookingController.getOwnerRefundRequests);
router.put('/refund/:bookingId/approve', authenticate, bookingController.approveRefund);
router.put('/refund/:bookingId/reject', authenticate, bookingController.rejectRefund);
router.get('/:bookingId/feedback-eligibility', authenticate, bookingController.getFeedbackEligibility);
router.post('/feedback', authenticate, bookingController.createFeedback);
router.get('/field/:fieldId/slots', bookingController.getBookedSlots);
router.post('/', authenticate, bookingController.createBooking);
router.put('/cancel/:bookingId', authenticate, bookingController.cancelBooking);

module.exports = router;
