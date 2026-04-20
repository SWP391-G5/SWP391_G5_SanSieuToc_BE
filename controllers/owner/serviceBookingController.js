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
    for (const sh of serviceHistories) {
      historyMap[sh.bookingDetailID.toString()] = sh;
    }

    const filteredDetails = details.filter((d) => historyMap[d._id.toString()]);
    const bookingIds = [...new Set(filteredDetails.map((d) => d.bookingID.toString()))];

    const query = { _id: { $in: bookingIds } };
    if (status && status !== 'All') {
      query.status = status;
    }
    const bookings = await Booking.find(query).lean();

    const customerIds = [...new Set(bookings.map((b) => b.customerID.toString()))];
    const customers = await UserAccount.find({ _id: { $in: customerIds } }, 'name email phone').lean();
    const customerMap = {};
    for (const c of customers) {
      customerMap[c._id.toString()] = c;
    }

    const result = filteredDetails
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
