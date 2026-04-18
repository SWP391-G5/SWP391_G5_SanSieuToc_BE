const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authenticate');
const serviceController = require('../controllers/serviceController');

router.get('/field/:fieldId', serviceController.getServicesByField);
router.get('/booking-detail/:bookingDetailId', authenticate, serviceController.getServicesByBookingDetail);
router.get('/my', authenticate, serviceController.getMyServiceHistory);
router.post('/', authenticate, serviceController.bookServices);

module.exports = router;
