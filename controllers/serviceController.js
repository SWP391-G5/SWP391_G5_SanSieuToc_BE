const Service = require('../models/Service');
const Booking = require('../models/Booking');
const BookingDetail = require('../models/BookingDetail');
const BookingServiceHistory = require('../models/BookingServiceHistory');

async function getServicesByField(req, res) {
  try {
    const { fieldId } = req.params;
    
    const services = await Service.find({ fieldID: fieldId })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ services });
  } catch (err) {
    console.error('getServicesByField error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getServicesByBookingDetail(req, res) {
  try {
    const { bookingDetailId } = req.params;
    
    const bookingDetail = await BookingDetail.findById(bookingDetailId).lean();
    if (!bookingDetail) {
      return res.status(404).json({ message: 'Booking detail not found' });
    }
    
    const fieldId = bookingDetail.fieldID;
    const services = await Service.find({ fieldID: fieldId, stock: { $gt: 0 } })
      .sort({ createdAt: -1 })
      .lean();
    
    const existingHistory = await BookingServiceHistory.findOne({ bookingDetailID: bookingDetailId }).lean();
    
    res.json({ 
      services,
      fieldId,
      fieldName: bookingDetail.fieldName,
      existingServices: existingHistory?.service || []
    });
  } catch (err) {
    console.error('getServicesByBookingDetail error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function bookServices(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const { bookingDetailId, services } = req.body;
    
    if (!bookingDetailId || !services || !Array.isArray(services)) {
      return res.status(400).json({ message: 'bookingDetailId and services array are required' });
    }
    
    const bookingDetail = await BookingDetail.findById(bookingDetailId).lean();
    if (!bookingDetail) {
      return res.status(404).json({ message: 'Booking detail not found' });
    }
    
    const booking = await Booking.findById(bookingDetail.bookingID).lean();
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    if (booking.customerID.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    if (booking.status === 'Cancel') {
      return res.status(400).json({ message: 'Cannot add services to cancelled booking' });
    }
    
    let serviceHistory = await BookingServiceHistory.findOne({ bookingDetailID: bookingDetailId });
    
    const newServices = services.map(s => ({
      serviceId: s.serviceId,
      serviceName: s.serviceName,
      price: s.price,
      quantity: s.quantity || 1,
    }));
    
    const totalPrice = newServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);
    
    if (serviceHistory) {
      serviceHistory.service = newServices;
      serviceHistory.totalPriceSnapShot = totalPrice;
      await serviceHistory.save();
    } else {
      serviceHistory = await BookingServiceHistory.create({
        bookingDetailID: bookingDetailId,
        serviceID: newServices[0]?.serviceId,
        totalPriceSnapShot: totalPrice,
        service: newServices,
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Services booked successfully',
      serviceHistory: {
        id: serviceHistory._id,
        totalPrice: serviceHistory.totalPriceSnapShot,
        services: serviceHistory.service,
      },
    });
  } catch (err) {
    console.error('bookServices error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = {
  getServicesByField,
  getServicesByBookingDetail,
  bookServices,
};
