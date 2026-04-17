const Booking = require('../models/Booking');
const BookingDetail = require('../models/BookingDetail');
const Field = require('../models/Field');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const UserAccount = require('../models/UserAccount');
const { isEmailConfigured, sendBookingConfirmationEmail, sendBookingCancellationEmail } = require('../utils/mailer');

function parsePrice(priceText) {
  if (typeof priceText === 'number') return priceText;
  const digits = String(priceText ?? '').replace(/[^\d]/g, '');
  return Number(digits) || 0;
}

function formatVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount || 0);
}

async function deductWalletBalance(userId, amount, bookingId) {
  let wallet = await Wallet.findOne({ walletOwnerId: userId, walletOwnerModel: 'UserAccount' });
  
  if (!wallet) {
    wallet = await Wallet.create({
      walletOwnerId: userId,
      walletOwnerModel: 'UserAccount',
      balance: 0,
    });
  }

  if (wallet.balance < amount) {
    const err = new Error(`Insufficient wallet balance. Current: ${wallet.balance}, Required: ${amount}`);
    err.status = 400;
    throw err;
  }

  const balanceBefore = wallet.balance;
  wallet.balance -= amount;
  await wallet.save();

  await Transaction.create({
    bookingID: bookingId,
    fromWalletID: wallet._id,
    toWalletID: null,
    type: 'Booking Payment',
    amount: amount,
    balanceBefore,
    balanceAfter: wallet.balance,
    description: 'Booking payment',
  });

  return wallet;
}

async function getMyBookings(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    
    const bookings = await Booking.find({ customerID: userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!bookings || bookings.length === 0) {
      return res.json({ bookings: [] });
    }

    const bookingIds = bookings.map((b) => b._id);

    const details = await BookingDetail.find({ bookingID: { $in: bookingIds } })
      .populate('fieldID', 'fieldName fieldType address image')
      .lean();

    const detailsByBooking = {};
    for (const d of details) {
      if (!detailsByBooking[d.bookingID.toString()]) {
        detailsByBooking[d.bookingID.toString()] = [];
      }
      detailsByBooking[d.bookingID.toString()].push(d);
    }

    const result = bookings.map((b) => {
      const bDetails = detailsByBooking[b._id.toString()] || [];
      
      const field = bDetails[0]?.fieldID || {};
      const fieldName = bDetails[0]?.fieldName || (typeof field === 'object' ? field.fieldName : '') || '';
      const fieldImage = bDetails[0]?.fieldImage || (typeof field === 'object' && field.image ? field.image[0] : '') || '';
      const fieldAddress = typeof field === 'object' ? field.address : '';
      const fieldType = typeof field === 'object' ? field.fieldType : '';

      const groupedByDate = {};
      for (const d of bDetails) {
        const dateKey = new Date(d.startTime).toISOString().split('T')[0];
        if (!groupedByDate[dateKey]) {
          groupedByDate[dateKey] = [];
        }
        const startHour = new Date(d.startTime).getHours().toString().padStart(2, '0') + ':00';
        const endHour = new Date(d.endTime).getHours().toString().padStart(2, '0') + ':00';
        groupedByDate[dateKey].push({ start: startHour, end: endHour });
      }

      const dateKeys = Object.keys(groupedByDate).sort();
      const firstDate = dateKeys[0] || '';
      const timeSlots = groupedByDate[firstDate] || [];

      const allDates = dateKeys.map(date => ({
        date,
        slots: groupedByDate[date]
      }));

      const statusMap = {
        Booked: 'Confirmed',
        'Cancel Request': 'Cancel Requested',
        Cancel: 'Cancelled',
      };

      const paymentStatusMap = {
        Completed: 'Paid',
        Pending: 'Pending Payment',
        'Pending Refund': 'Pending Refund',
        Refunded: 'Refunded',
        Cancel: 'Refunded',
      };

      return {
        id: b._id,
        fieldName,
        fieldImage,
        fieldAddress,
        fieldType,
        date: firstDate,
        timeSlots,
        allDates,
        grandTotal: b.totalPrice,
        fieldTotal: b.fieldTotal || 0,
        servicesTotal: b.servicesTotal || 0,
        services: b.services || [],
        status: statusMap[b.status] || b.status,
        statusPayment: paymentStatusMap[b.statusPayment] || b.statusPayment,
        createdAt: b.createdAt,
      };
    });

    res.json({ bookings: result });
  } catch (err) {
    console.error('getMyBookings error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function createBooking(req, res) {
  const userId = req.user.sub || req.user.userId || req.user.id;
  const { fieldId, timeSlots, grandTotal } = req.body;

  console.log('=== CREATE BOOKING START ===');
  console.log('userId:', userId);
  console.log('fieldId:', fieldId);
  console.log('grandTotal:', grandTotal);
  console.log('paymentMethod:', req.body.paymentMethod);

  try {
    if (!fieldId) {
      return res.status(400).json({ message: 'fieldId is required' });
    }

    let field = null;
    let slotDuration = 60;
    let pricePerSlot = 0;

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(fieldId));
    if (isObjectId) {
      field = await Field.findById(fieldId);
      if (!field) {
        return res.status(404).json({ message: 'Field not found' });
      }
      slotDuration = field.slotDuration || 60;
      pricePerSlot = field.pricePerHour || 0;
    } else {
      pricePerSlot = parsePrice(req.body.fieldTotal) / (Array.isArray(timeSlots) ? timeSlots.length : 1);
    }

    const slotDetails = [];
    const fieldName = field?.fieldName || req.body.fieldName || '';
    const fieldImage = field?.image?.[0] || req.body.fieldImage || '';

    const timeSlotsArr = Array.isArray(req.body.timeSlots) ? req.body.timeSlots : [];
    for (const timeSlot of timeSlotsArr) {
      const baseDate = req.body.date ? new Date(req.body.date) : new Date();
      const [hours, minutes] = timeSlot.split(':').map(Number);
      const startTime = new Date(baseDate);
      startTime.setHours(hours, minutes || 0, 0, 0);
      
      const endTime = new Date(startTime.getTime() + slotDuration * 60 * 1000);

      slotDetails.push({
        fieldID: isObjectId ? fieldId : String(fieldId),
        fieldName,
        fieldImage,
        startTime,
        endTime,
        priceSnapShot: pricePerSlot,
        status: 'Active',
      });
    }

    const totalPrice = grandTotal || req.body.grandTotal || slotDetails.length * pricePerSlot;
    const fieldTotal = req.body.fieldTotal || slotDetails.length * pricePerSlot;
    const servicesTotal = req.body.servicesTotal || 0;
    const paymentMethod = req.body.paymentMethod || 'wallet';

    const services = Array.isArray(req.body.services) ? req.body.services.map(s => ({
      serviceId: s.id || s.serviceId || s,
      serviceName: s.name || s.serviceName || '',
      price: s.price || 0,
    })) : [];

    console.log('Creating booking with totalPrice:', totalPrice);

    const booking = new Booking({
      customerID: userId,
      totalPrice,
      fieldTotal,
      servicesTotal,
      services,
      statusPayment: 'Pending',
      status: 'Booked',
    });
    await booking.save();
    console.log('Booking saved:', booking._id);

    for (const detail of slotDetails) {
      detail.bookingID = booking._id;
    }
    if (slotDetails.length > 0) {
      await BookingDetail.insertMany(slotDetails);
      console.log('Booking details inserted:', slotDetails.length);
    }

    if (paymentMethod === 'wallet' && totalPrice > 0) {
      console.log('Processing wallet payment...');
      await deductWalletBalance(userId, totalPrice, booking._id);
      booking.statusPayment = 'Completed';
      await booking.save();
      console.log('Wallet deducted, booking completed');
    }

    console.log('=== CREATE BOOKING SUCCESS ===');

    const user = await UserAccount.findById(userId);
    if (user && isEmailConfigured()) {
      try {
        const dateStr = new Date(req.body.date).toLocaleDateString('vi-VN');
        const timeStr = Array.isArray(timeSlotsArr) ? timeSlotsArr.join(', ') : req.body.timeSlots;
        await sendBookingConfirmationEmail({
          to: user.email,
          name: user.name,
          bookingDetails: {
            fieldName,
            date: dateStr,
            time: timeStr,
            total: formatVnd(totalPrice),
            bookingId: booking._id.toString(),
          },
        });
        console.log('Confirmation email sent to:', user.email);
      } catch (emailErr) {
        console.error('Failed to send confirmation email:', emailErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: booking._id,
        totalPrice: booking.totalPrice,
        status: booking.status,
        statusPayment: booking.statusPayment,
      },
    });
  } catch (err) {
    console.error('=== CREATE BOOKING ERROR ===');
    console.error('Error:', err.message);
    console.error(err.stack);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
}

async function cancelBooking(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const { bookingId } = req.params;
    const { reason } = req.body;

    const booking = await Booking.findOne({ _id: bookingId, customerID: userId });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'Cancel Request' || booking.status === 'Cancel') {
      return res.status(400).json({ message: 'Booking already has a cancellation request' });
    }

    if (booking.statusPayment !== 'Completed') {
      return res.status(400).json({ message: 'Cannot cancel booking with pending payment' });
    }

    booking.status = 'Cancel Request';
    booking.statusPayment = 'Pending Refund';
    booking.refundReason = reason || 'Customer requested cancellation';
    await booking.save();

    const user = await UserAccount.findById(userId);
    if (user && isEmailConfigured()) {
      try {
        const details = await BookingDetail.find({ bookingID: bookingId }).lean();
        const firstDetail = details[0] || {};
        const dateStr = firstDetail.startTime ? new Date(firstDetail.startTime).toLocaleDateString('vi-VN') : '';
        const timeStr = firstDetail.startTime ? new Date(firstDetail.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
        
        await sendBookingCancellationEmail({
          to: user.email,
          name: user.name,
          bookingDetails: {
            fieldName: firstDetail.fieldName || '',
            date: dateStr,
            time: timeStr,
            total: formatVnd(booking.totalPrice),
            bookingId: booking._id.toString(),
            status: 'Đang chờ hoàn tiền',
          },
        });
        console.log('Cancellation email sent to:', user.email);
      } catch (emailErr) {
        console.error('Failed to send cancellation email:', emailErr.message);
      }
    }

    res.json({ 
      message: 'Cancellation request submitted. Please wait for owner to process refund.',
      booking: {
        id: booking._id,
        status: booking.status,
        statusPayment: booking.statusPayment,
      }
    });
  } catch (err) {
    console.error('cancelBooking error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = {
  getMyBookings,
  createBooking,
  cancelBooking,
};
