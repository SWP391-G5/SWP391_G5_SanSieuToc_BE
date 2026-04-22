const Booking = require('../../models/Booking');
const BookingDetail = require('../../models/BookingDetail');
const BookingServiceHistory = require('../../models/BookingServiceHistory');
const Field = require('../../models/Field');
const UserAccount = require('../../models/UserAccount');

async function getServiceBookingsForOwner(req, res) {
  try {
    const ownerId = req.user.sub || req.user.userId || req.user.id;
    const { status } = req.query;

    const ownerFields = await Field.find({ ownerID: ownerId, status: { $ne: 'Deleted' } }).lean();
    if (!ownerFields.length) {
      return res.json({ serviceBookings: [] });
    }
    const fieldIds = ownerFields.map((f) => f._id.toString());

    const details = await BookingDetail.find({ fieldID: { $in: fieldIds } })
      .sort({ createdAt: -1 })
      .lean();

    if (!details.length) {
      return res.json({ serviceBookings: [] });
    }

    const detailIds = details.map((d) => d._id);
    const serviceHistories = await BookingServiceHistory.find({ bookingDetailID: { $in: detailIds } })
      .lean();

    if (!serviceHistories.length) {
      return res.json({ serviceBookings: [] });
    }

    const historyMap = {};
    const serviceDetailIds = new Set();
    for (const sh of serviceHistories) {
      historyMap[sh.bookingDetailID.toString()] = sh;
      serviceDetailIds.add(sh.bookingDetailID.toString());
    }

    const filteredDetails = details.filter((d) => serviceDetailIds.has(d._id.toString()));
    const bookingIds = [...new Set(filteredDetails.map((d) => d.bookingID.toString()))];

    let bookings;
    if (status && status !== 'All') {
      const statusMap = {
        'Active': { $in: ['Active', 'Booked'] },
        'Cancel Request': 'Cancel Request',
        'Cancelled': 'Cancelled',
      };
      const query = { _id: { $in: bookingIds }, status: statusMap[status] || status };
      bookings = await Booking.find(query).lean();
    } else {
      bookings = await Booking.find({ _id: { $in: bookingIds } }).lean();
    }
    
    const validBookingIds = new Set(bookings.map(b => b._id.toString()));
    const finalDetails = filteredDetails.filter(d => validBookingIds.has(d.bookingID.toString()));

    const customerIds = [...new Set(bookings.map((b) => b.customerID.toString()))];
    const customers = await UserAccount.find({ _id: { $in: customerIds } }, 'name email phone').lean();
    const customerMap = {};
    for (const c of customers) {
      customerMap[c._id.toString()] = c;
    }

    const result = finalDetails
      .filter((d) => historyMap[d._id.toString()])
      .map((d) => {
        const sh = historyMap[d._id.toString()];
        const booking = bookings.find((b) => b._id.toString() === d.bookingID.toString());
        const customer = customerMap[booking?.customerID?.toString()] || {};
        const fieldInfo = ownerFields.find((f) => f._id.toString() === d.fieldID?.toString()) || {};

        return {
          id: sh._id,
          bookingDetailId: d._id,
          bookingId: d.bookingID,
          bookingStatus: booking?.status || 'Unknown',
          paymentStatus: booking?.statusPayment || 'Unknown',
          createdAt: sh.createdAt,
          customer: {
            name: customer.name || 'Unknown',
            email: customer.email || '',
            phone: customer.phone || '',
          },
          field: {
            id: fieldInfo._id || d.fieldID,
            name: d.fieldName || fieldInfo.fieldName || 'Unknown Field',
            image: d.fieldImage || (fieldInfo.image && fieldInfo.image[0]) || '',
          },
          serviceDate: d.startTime,
          services: sh.service || [],
          totalPrice: sh.totalPriceSnapShot || 0,
        };
      });

    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ serviceBookings: result });
  } catch (error) {
    console.error('getServiceBookingsForOwner error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
}

module.exports = {
  getServiceBookingsForOwner,
};
