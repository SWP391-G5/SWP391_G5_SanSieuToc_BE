const express = require('express');
const router = express.Router();
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const { getBookingsForOwner, approveCancel, rejectCancel } = require('../../controllers/owner/bookingController');

const ownerOnly = [authenticate, authorizeRoles(['Owner'])];

// GET /api/owner/bookings?status=
router.get('/', ownerOnly, getBookingsForOwner);

// PATCH /api/owner/bookings/:id/approve-cancel
router.patch('/:id/approve-cancel', ownerOnly, approveCancel);

// PATCH /api/owner/bookings/:id/reject-cancel
router.patch('/:id/reject-cancel', ownerOnly, rejectCancel);

module.exports = router;
