const Booking = require('../models/Booking');
const BookingDetail = require('../models/BookingDetail');
const Field = require('../models/Field');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const UserAccount = require('../models/UserAccount');
const BookingServiceHistory = require('../models/BookingServiceHistory');
const Feedback = require('../models/Feedback');
const Voucher = require('../models/Voucher');
const mongoose = require('mongoose');
const { isEmailConfigured, sendBookingConfirmationEmail, sendBookingCancellationEmail, sendWalletRefundEmail } = require('../utils/mailer');

function parsePrice(priceText) {
  if (typeof priceText === 'number') return priceText;
  const digits = String(priceText ?? '').replace(/[^\d]/g, '');
  return Number(digits) || 0;
}

function formatVnd(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount || 0);
}

function toIdString(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return String(value._id || value.id || '');
  }
  return String(value);
}

function isDetailEnded(detail) {
  const statusKey = String(detail?.status || '').trim().toLowerCase();
  if (statusKey === 'end') return true;

  const endAt = detail?.endTime ? new Date(detail.endTime).getTime() : NaN;
  if (Number.isFinite(endAt)) {
    return Date.now() > endAt;
  }

  return false;
}

function formatTimeFromDate(date) {
  if (!date) return '--:--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--:--';
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function deductWalletBalance(userId, amount, bookingId, ownerId) {
  console.log('=== deductWalletBalance called ===');
  console.log('userId:', userId, 'amount:', amount, 'bookingId:', bookingId, 'ownerId:', ownerId);
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

  const customerBalanceBefore = wallet.balance;
  wallet.balance -= amount;
  await wallet.save();

  await Transaction.create({
    bookingID: bookingId,
    fromWalletID: wallet._id,
    toWalletID: null,
    type: 'Field Payment',
    amount: amount,
    balanceBefore: customerBalanceBefore,
    balanceAfter: wallet.balance,
    description: 'Booking payment',
    bookingType: 'field',
  });

  if (ownerId) {
    console.log('==> Creating owner wallet transaction for ownerId:', ownerId);
    let ownerWallet = await Wallet.findOne({ walletOwnerId: ownerId, walletOwnerModel: 'Owner' });

    if (!ownerWallet) {
      ownerWallet = await Wallet.create({
        walletOwnerId: ownerId,
        walletOwnerModel: 'Owner',
        balance: 0,
      });
      console.log('==> Created new owner wallet:', ownerWallet._id);
    }

    const ownerAmount = Math.floor(amount * 0.9);
    const managerAmount = Math.floor(amount * 0.1);
    const ownerBalanceBefore = ownerWallet.balance;
    ownerWallet.balance += ownerAmount;
    await ownerWallet.save();
    console.log('==> Owner wallet updated:', ownerBalanceBefore, '->', ownerWallet.balance);

    const Booking = require('../models/Booking');
    const BookingDetail = require('../models/BookingDetail');
    const UserAccount = require('../models/UserAccount');
    const Field = require('../models/Field');

    const booking = await Booking.findById(bookingId).lean();
    const customer = await UserAccount.findById(booking?.customerID).lean();
    const details = await BookingDetail.find({ bookingID: bookingId }).lean();
    const field = details[0]?.fieldID ? await Field.findById(details[0].fieldID).lean() : null;
    const owner = field?.ownerID ? await UserAccount.findById(field.ownerID).populate('managerID').lean() : null;
    const managerId = owner?.managerID?._id;
    const ownerName = owner?.name || owner?.username || 'Unknown Owner';
    const fieldName = field?.fieldName || details[0]?.fieldName || 'Unknown';
    const managerDescription = `Hoa hồng 10% từ owner ${ownerName}`;
    const ownerDescription = `Doanh thu 90% từ sân ${fieldName}`;

    console.log('==> owner:', owner?.name);
    console.log('==> owner.managerID:', owner?.managerID);
    console.log('==> managerId found:', managerId);
    console.log('==> managerAmount (10%):', managerAmount);

    if (!managerId) {
      console.log('==> SKIP: No managerId - managerID is null/undefined');
    } else {
      console.log('==> Processing manager wallet...');
      let managerWallet = await Wallet.findOne({ walletOwnerId: managerId });
      console.log('==> Manager wallet query result:', managerWallet);
      if (!managerWallet) {
        managerWallet = await Wallet.create({
          walletOwnerId: managerId,
          walletOwnerModel: 'AdminAccount',
          balance: 0,
        });
        console.log('==> Created new manager wallet:', managerWallet._id);
      } else {
        if (managerWallet.walletOwnerModel !== 'AdminAccount') {
          managerWallet.walletOwnerModel = 'AdminAccount';
          await managerWallet.save();
          console.log('==> Updated manager wallet model to AdminAccount');
        }
      }

      const managerBalanceBefore = managerWallet.balance;
      managerWallet.balance += managerAmount;
      await managerWallet.save();
      console.log('==> Manager wallet updated:', managerBalanceBefore, '->', managerWallet.balance);

      await Transaction.create({
        bookingID: bookingId,
        fromWalletID: null,
        toWalletID: managerWallet._id,
        type: 'Field Payment',
        amount: managerAmount,
        balanceBefore: managerBalanceBefore,
        balanceAfter: managerWallet.balance,
        description: managerDescription,
        bookingType: 'field',
      });
      console.log('==> Transaction created for manager');
    }

    await Transaction.create({
      bookingID: bookingId,
      fromWalletID: null,
      toWalletID: ownerWallet._id,
      type: 'Field Payment',
      amount: ownerAmount,
      balanceBefore: ownerBalanceBefore,
      balanceAfter: ownerWallet.balance,
      description: ownerDescription,
      bookingType: 'field',
    });
    console.log('==> Transaction created for owner');
  } else {
    console.log('==> NO ownerId - skipping owner wallet transfer');
  }

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

    const detailIds = details.map(d => d._id);
    const serviceHistories = await BookingServiceHistory.find({ 
      bookingDetailID: { $in: detailIds },
      status: { $ne: 'Cancelled' }
    }).lean();
    const feedbackRows = await Feedback.find({
      bookingDetailID: { $in: detailIds },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();
    const servicesByDetail = {};
    for (const sh of serviceHistories) {
      servicesByDetail[sh.bookingDetailID.toString()] = sh;
    }

    const feedbackByDetail = {};
    for (const fb of feedbackRows) {
      const key = fb.bookingDetailID.toString();
      if (!feedbackByDetail[key]) {
        feedbackByDetail[key] = fb;
      }
    }

    const detailsByBooking = {};
    for (const d of details) {
      if (!detailsByBooking[d.bookingID.toString()]) {
        detailsByBooking[d.bookingID.toString()] = [];
      }
      d.services = servicesByDetail[d._id.toString()] || null;
      d.feedback = feedbackByDetail[d._id.toString()] || null;
      detailsByBooking[d.bookingID.toString()].push(d);
    }

    const result = bookings.map((b) => {
      const bDetails = detailsByBooking[b._id.toString()] || [];

      const field = bDetails[0]?.fieldID || {};
      const fieldId = toIdString(bDetails[0]?.fieldID);
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
        const startHour = formatTimeFromDate(d.startTime);
        const endHour = formatTimeFromDate(d.endTime);
        groupedByDate[dateKey].push({
          start: startHour,
          end: endHour,
          id: d._id.toString(),
          status: d.status,
          hasFeedback: !!d.feedback,
        });
      }

      const dateKeys = Object.keys(groupedByDate).sort();
      const firstDate = dateKeys[0] || '';
      const timeSlots = groupedByDate[firstDate] || [];

      const allDates = dateKeys.map(date => ({
        date,
        slots: groupedByDate[date]
      }));

      // Combine all services from active details (not cancelled)
      let servicesList = [];
      let servicesTotal = 0;
      for (const d of bDetails) {
        if (d.services?.service?.length > 0 && d.status !== 'Cancel') {
          servicesList = [...servicesList, ...d.services.service];
          servicesTotal += d.services.totalPriceSnapShot || 0;
        }
      }

      // Remove duplicates - keep only unique services by serviceId
      const uniqueServicesMap = new Map();
      for (const s of servicesList) {
        const key = s.serviceId?.toString() || s.serviceName;
        if (!uniqueServicesMap.has(key)) {
          uniqueServicesMap.set(key, s);
        } else {
          // If already exists, add quantity
          const existing = uniqueServicesMap.get(key);
          existing.quantity = (existing.quantity || 1) + (s.quantity || 1);
        }
      }
      const uniqueServicesList = Array.from(uniqueServicesMap.values());
      const hasFeedback = bDetails.some((d) => !!d.feedback);
      const isPaid = String(b?.statusPayment || '').trim() === 'Completed';
      const canFeedback = isPaid && bDetails.some((d) => {
        const statusKey = String(d?.status || '').trim().toLowerCase();
        if (statusKey === 'cancel' || statusKey === 'cancel request') return false;
        return isDetailEnded(d);
      });

      const statusMap = {
        Active: 'Active',
        'Cancel Request': 'Cancel Request',
        Cancelled: 'Cancelled',
        Ended: 'Ended',
      };

      const paymentStatusMap = {
        Completed: 'Paid',
        Pending: 'Pending Payment',
        'Pending Refund': 'Pending Refund',
        Refunded: 'Refunded',
        Cancel: 'Refunded',
      };

      const allDetails = bDetails.map(d => {
        const servicesList = d.services?.service || [];
        const servicesTotal = d.services?.totalPriceSnapShot || 0;
        console.log(`DEBUG allDetails - detailId: ${d._id}, hasServices: ${!!d.services}, servicesCount: ${servicesList.length}, servicesTotal: ${servicesTotal}`);
        return {
          id: String(d._id),
          date: d.startTime ? new Date(d.startTime).toISOString().split('T')[0] : '',
          startTime: d.startTime,
          endTime: d.endTime,
          status: d.status,
          isEnded: isDetailEnded(d),
          priceSnapShot: d.priceSnapShot || 0,
          services: servicesList,
          servicesTotal,
          feedback: d.feedback
            ? {
                id: String(d.feedback._id),
                rate: d.feedback.rate,
                content: d.feedback.content || '',
                createdAt: d.feedback.createdAt,
                updatedAt: d.feedback.updatedAt,
              }
            : null,
        };
      });

      return {
        id: b._id,
        fieldId,
        fieldName,
        fieldImage,
        fieldAddress,
        fieldType,
        date: firstDate,
        timeSlots,
        allDates,
        allDetails,
        grandTotal: b.totalPrice,
        fieldTotal: b.fieldTotal || 0,
        services: uniqueServicesList,
        servicesTotal: servicesTotal,
        hasFeedback,
        canFeedback,

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

async function getBookedSlots(req, res) {
  try {
    const { fieldId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required' });
    }

    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    console.log('getBookedSlots:', { fieldId, date, startOfDay, endOfDay });

    const bookedDetails = await BookingDetail.find({
      fieldID: fieldId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'Cancel' },
    }).lean();

    console.log('bookedDetails found:', bookedDetails.length, bookedDetails.map(d => ({ startTime: d.startTime, status: d.status })));

    const bookedSlots = bookedDetails.map(d => {
      const start = new Date(d.startTime);
      const end = new Date(d.endTime);
      const startHour = start.getHours().toString().padStart(2, '0');
      const startMin = start.getMinutes().toString().padStart(2, '0');
      const endHour = end.getHours().toString().padStart(2, '0');
      const endMin = end.getMinutes().toString().padStart(2, '0');
      return `${startHour}:${startMin} - ${endHour}:${endMin}`;
    });

    res.json({ success: true, bookedSlots });
  } catch (err) {
    console.error('getBookedSlots error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function validateVoucher(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const { voucherCode, fieldId, grandTotal } = req.body;

    if (!voucherCode || !fieldId) {
      return res.status(400).json({ message: 'Missing voucherCode or fieldId' });
    }

    const now = new Date();
    const voucher = await Voucher.findOne({
      voucherName: voucherCode,
      beginDate: { $lte: now },
      endDate: { $gte: now },
      quantity: { $gt: 0 },
    }).lean();

    if (!voucher) {
      return res.status(400).json({ valid: false, message: 'Invalid or expired voucher' });
    }

    const isFieldApplicable = voucher.applicableFields?.some(
      f => f.fieldID?.toString() === fieldId || f.fieldID === fieldId
    );

    if (!isFieldApplicable) {
      return res.status(400).json({ valid: false, message: 'Voucher not applicable for this field' });
    }

    const discountPercent = voucher.discountValue || 0;
    const maxDiscount = voucher.maxDiscount || 0;
    let discountAmount = Math.floor(grandTotal * (discountPercent / 100));
    
    if (maxDiscount > 0 && discountAmount > maxDiscount) {
      discountAmount = maxDiscount;
    }

    res.json({
      valid: true,
      discountAmount,
      discountPercent,
      maxDiscount,
      voucherName: voucher.voucherName,
    });
  } catch (err) {
    console.error('validateVoucher error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function createBooking(req, res) {
  const userId = req.user.sub || req.user.userId || req.user.id;
  const { fieldId, timeSlots, grandTotal } = req.body;

  console.log('=== CREATE BOOKING START ===');
  console.log('Full request body:', JSON.stringify(req.body));
  console.log('userId:', userId);
  console.log('fieldId:', fieldId);
  console.log('timeSlots:', timeSlots);
  console.log('grandTotal:', grandTotal);
  console.log('paymentMethod from body:', req.body.paymentMethod);

  try {
    if (!fieldId) {
      console.log('fieldId is missing');
      return res.status(400).json({ message: 'fieldId is required' });
    }

    const timeSlotsArr = Array.isArray(req.body.timeSlots) ? req.body.timeSlots : [];
    if (timeSlotsArr.length === 0) {
      console.log('timeSlots is missing or empty');
      return res.status(400).json({ message: 'timeSlots is required' });
    }

    let field = null;
    let slotDuration = 60;
    let pricePerSlot = 0;

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(fieldId));
    if (isObjectId) {
      field = await Field.findById(fieldId);
      if (!field) {
        console.log('Field not found for fieldId:', fieldId);
        return res.status(404).json({ message: 'Field not found' });
      }
      slotDuration = field.slotDuration || 60;
      const hourlyPrice = field.hourlyPrice || field.price || 0;
      pricePerSlot = Math.round(hourlyPrice * (slotDuration / 60));
    } else {
      pricePerSlot = parsePrice(req.body.fieldTotal) / (Array.isArray(timeSlots) ? timeSlots.length : 1);
    }

    console.log('pricePerSlot:', pricePerSlot);

    const slotDetails = [];
    const fieldName = field?.fieldName || req.body.fieldName || '';
    let fieldImage = field?.image?.[0] || req.body.fieldImage || '';
    if (Array.isArray(fieldImage)) fieldImage = fieldImage[0] || '';
    if (typeof fieldImage !== 'string') fieldImage = String(fieldImage || '');

    for (const timeSlot of timeSlotsArr) {
      let baseDate;
      if (req.body.date) {
        const [y, m, d] = req.body.date.split('-').map(Number);
        baseDate = new Date(y, m - 1, d);
      } else {
        baseDate = new Date();
      }
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
    const paymentMethod = req.body.paymentMethod || 'wallet';

    console.log('Creating booking with totalPrice:', totalPrice);

    const booking = new Booking({
      customerID: userId,
      totalPrice,
      statusPayment: 'Pending',
      status: 'Active',
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
      let ownerId = field?.ownerID || null;

      if (!ownerId && fieldId) {
        const Field = require('../models/Field');
        const fieldForOwner = await Field.findById(fieldId);
        ownerId = fieldForOwner?.ownerID || null;
        console.log('ownerId from refetch:', ownerId);
      }

      console.log('=== PAYMENT DEBUG ===');
      console.log('fieldId:', fieldId);
      console.log('ownerId:', ownerId);
      console.log('totalPrice:', totalPrice);
      console.log('paymentMethod:', paymentMethod);

      await deductWalletBalance(userId, totalPrice, booking._id, ownerId);
      booking.statusPayment = 'Completed';
      await booking.save();
      console.log('Wallet deducted, booking completed, ownerId:', ownerId);
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
    console.error('Stack:', err.stack);
    return res.status(500).json({ message: 'Server error: ' + err.message });
  }
}

async function cancelSlot(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const { bookingId } = req.params;
    const { bookingDetailIds, reason } = req.body;

    if (!bookingDetailIds || !Array.isArray(bookingDetailIds) || bookingDetailIds.length === 0) {
      return res.status(400).json({ message: 'bookingDetailIds is required' });
    }

    console.log('cancelSlot - bookingDetailIds:', bookingDetailIds);

    const Booking = require('../models/Booking');
    const BookingDetail = require('../models/BookingDetail');
    const BookingServiceHistory = require('../models/BookingServiceHistory');
    const Wallet = require('../models/Wallet');
    const Transaction = require('../models/Transaction');
    const Field = require('../models/Field');

    const booking = await Booking.findOne({ _id: bookingId, customerID: userId });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'Cancel') {
      return res.status(400).json({ message: 'Booking already cancelled' });
    }

    if (booking.statusPayment !== 'Completed') {
      return res.status(400).json({ message: 'Cannot cancel booking with pending payment' });
    }

    const hoursSinceBooked = (Date.now() - booking.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceBooked >= 12) {
      return res.status(400).json({ message: 'Cannot cancel booking after 12 hours from booking time' });
    }

    const detailsToCancel = await BookingDetail.find({ _id: { $in: bookingDetailIds } }).lean();
    if (detailsToCancel.length === 0) {
      return res.status(400).json({ message: 'No valid booking details found' });
    }

    console.log('cancelSlot - detailsToCancel:', JSON.stringify(detailsToCancel.map(d => ({ id: d._id, priceSnapShot: d.priceSnapShot }))));

    const detailsToCancelIds = detailsToCancel.map(d => d._id.toString());
    const allDetails = await BookingDetail.find({ bookingID: bookingId }).lean();
    const remainingDetails = allDetails.filter(d => !detailsToCancelIds.includes(d._id.toString()));

    let refundAmount = 0;

    for (const detail of detailsToCancel) {
      const fieldRefund = Math.floor((detail.priceSnapShot || 0) * 0.8);
      refundAmount += fieldRefund;

      const serviceHistories = await BookingServiceHistory.find({ bookingDetailID: detail._id }).lean();
      for (const sh of serviceHistories) {
        refundAmount += sh.totalPriceSnapShot || 0;
      }
    }

    booking.status = 'Cancel Request';
    booking.statusPayment = 'Pending Refund';
    booking.refundReason = reason || 'Customer requested cancellation';
    booking.refundDetailIds = detailsToCancelIds;
    await booking.save();

    await BookingDetail.updateMany(
      { _id: { $in: bookingDetailIds } },
      { $set: { status: 'Cancel Request' } }
    );

    res.json({
      message: `Yêu cầu hủy ${detailsToCancel.length} slot. Vui lòng chờ chủ sân xác nhận.`,
      refundAmount,
      cancelledSlots: detailsToCancelIds.length,
      remainingSlots: remainingDetails.length
    });
  } catch (err) {
    console.error('cancelSlot error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
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

    if (booking.status === 'Cancel') {
      return res.status(400).json({ message: 'Booking already cancelled' });
    }

    if (booking.statusPayment !== 'Completed') {
      return res.status(400).json({ message: 'Cannot cancel booking with pending payment' });
    }

    const hoursSinceBooked = (Date.now() - booking.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceBooked >= 12) {
      return res.status(400).json({ message: 'Cannot cancel booking after 12 hours from booking time' });
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

async function getFeedbackEligibility(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const { bookingId } = req.params;

    if (!mongoose.isValidObjectId(String(bookingId))) {
      return res.status(400).json({ message: 'Invalid bookingId.' });
    }

    const booking = await Booking.findOne({ _id: bookingId, customerID: userId }).lean();
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    const isPaid = String(booking?.statusPayment || '').trim() === 'Completed';

    const details = await BookingDetail.find({ bookingID: bookingId }).sort({ startTime: 1 }).lean();
    if (!details.length) {
      return res.json({
        item: {
          bookingId: String(booking._id),
          fieldId: '',
          fieldName: '',
          isPaid,
          canSubmit: false,
          eligibleSlots: [],
          submittedSlots: [],
        },
      });
    }

    const detailIds = details.map((d) => d._id);
    const feedbackRows = await Feedback.find({
      bookingDetailID: { $in: detailIds },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    const feedbackByDetail = new Map();
    for (const row of feedbackRows) {
      const key = String(row.bookingDetailID);
      if (!feedbackByDetail.has(key)) {
        feedbackByDetail.set(key, row);
      }
    }

    const slots = details.map((d) => {
      const key = String(d._id);
      const feedback = feedbackByDetail.get(key) || null;
      const isEnded = isDetailEnded(d);

      return {
        id: key,
        startTime: d.startTime,
        endTime: d.endTime,
        status: d.status,
        isEnded,
        hasFeedback: !!feedback,
        feedback: feedback
          ? {
              id: String(feedback._id),
              rate: feedback.rate,
              content: feedback.content || '',
              createdAt: feedback.createdAt,
            }
          : null,
      };
    });

    const eligibleSlots = slots.filter((s) => s.isEnded && !s.hasFeedback);
    const submittedSlots = slots.filter((s) => s.isEnded && s.hasFeedback);
    const firstDetail = details[0] || {};

    return res.json({
      item: {
        bookingId: String(booking._id),
        fieldId: toIdString(firstDetail.fieldID),
        fieldName: firstDetail.fieldName || '',
        isPaid,
        canSubmit: isPaid && eligibleSlots.length > 0,
        eligibleSlots,
        submittedSlots,
      },
    });
  } catch (err) {
    console.error('getFeedbackEligibility error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getFeedbackEligibilityByField(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const { fieldId } = req.params;

    if (!mongoose.isValidObjectId(fieldId)) {
      return res.status(400).json({ message: 'Invalid fieldId.' });
    }

    const bookings = await Booking.find({
      customerID: userId,
      statusPayment: 'Completed',
      status: { $ne: 'Cancel' },
    }).lean();

    if (!bookings.length) {
      return res.json({ item: { fieldId, reviewableSlots: [] } });
    }

    const bIds = bookings.map((b) => b._id);
    const details = await BookingDetail.find({
      bookingID: { $in: bIds },
      fieldID: fieldId,
      status: { $ne: 'Cancel' },
    }).lean();

    if (!details.length) {
      return res.json({ item: { fieldId, reviewableSlots: [] } });
    }

    const dIds = details.map((d) => d._id);
    const feedbacks = await Feedback.find({
      bookingDetailID: { $in: dIds },
      isDeleted: false,
    }).lean();

    const fbMap = new Map();
    for (const f of feedbacks) {
      fbMap.set(String(f.bookingDetailID), f);
    }

    const slots = details
      .map((d) => {
        const fb = fbMap.get(String(d._id));
        const ended = isDetailEnded(d);
        return {
          id: String(d._id),
          startTime: d.startTime,
          endTime: d.endTime,
          isEnded: ended,
          hasFeedback: !!fb,
          feedback: fb
            ? {
                id: String(fb._id),
                rate: fb.rate,
                content: fb.content || '',
                createdAt: fb.createdAt,
              }
            : null,
        };
      })
      .filter((s) => s.isEnded)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    return res.json({
      item: {
        fieldId,
        isPaid: true,
        reviewableSlots: slots,
      },
    });
  } catch (err) {
    console.error('getFeedbackEligibilityByField error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function createFeedback(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const bookingDetailId = String(req.body?.bookingDetailId || '').trim();
    const rate = Number(req.body?.rate);
    const content = String(req.body?.content || '').trim();

    if (!mongoose.isValidObjectId(bookingDetailId)) {
      return res.status(400).json({ message: 'Invalid bookingDetailId.' });
    }

    if (!Number.isInteger(rate) || rate < 1 || rate > 5) {
      return res.status(400).json({ message: 'Rate must be an integer between 1 and 5.' });
    }

    const detail = await BookingDetail.findById(bookingDetailId).lean();
    if (!detail) {
      return res.status(404).json({ message: 'Booking detail not found.' });
    }

    const booking = await Booking.findOne({ _id: detail.bookingID, customerID: userId }).lean();
    if (!booking) {
      return res.status(403).json({ message: 'You cannot feedback this booking detail.' });
    }

    if (String(booking?.statusPayment || '').trim() !== 'Completed') {
      return res.status(409).json({ message: 'You can only feedback paid bookings.' });
    }

    if (!isDetailEnded(detail)) {
      return res.status(409).json({ message: 'You can only feedback after the slot has ended.' });
    }

    const existing = await Feedback.findOne({ bookingDetailID: detail._id, isDeleted: false }).lean();
    if (existing) {
      return res.status(409).json({ message: 'Feedback already submitted for this slot.' });
    }

    const created = await Feedback.create({
      bookingDetailID: detail._id,
      rate,
      content,
    });

    return res.status(201).json({
      message: 'Feedback submitted successfully.',
      item: {
        id: String(created._id),
        bookingDetailId: String(detail._id),
        fieldId: toIdString(detail.fieldID),
        fieldName: detail.fieldName || '',
        rate: created.rate,
        content: created.content || '',
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    });
  } catch (err) {
    console.error('createFeedback error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function updateFeedback(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const feedbackId = String(req.params?.feedbackId || '').trim();
    const rate = Number(req.body?.rate);
    const content = String(req.body?.content || '').trim();

    if (!mongoose.isValidObjectId(feedbackId)) {
      return res.status(400).json({ message: 'Invalid feedbackId.' });
    }

    if (!Number.isInteger(rate) || rate < 1 || rate > 5) {
      return res.status(400).json({ message: 'Rate must be an integer between 1 and 5.' });
    }

    const feedback = await Feedback.findOne({ _id: feedbackId, isDeleted: false });
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    const detail = await BookingDetail.findById(feedback.bookingDetailID).lean();
    if (!detail) {
      return res.status(404).json({ message: 'Booking detail not found.' });
    }

    const booking = await Booking.findOne({ _id: detail.bookingID, customerID: userId }).lean();
    if (!booking) {
      return res.status(403).json({ message: 'You cannot edit this feedback.' });
    }

    if (String(booking?.statusPayment || '').trim() !== 'Completed') {
      return res.status(409).json({ message: 'You can only edit feedback for paid bookings.' });
    }

    if (!isDetailEnded(detail)) {
      return res.status(409).json({ message: 'You can only edit feedback after the slot has ended.' });
    }

    feedback.rate = rate;
    feedback.content = content;
    await feedback.save();

    return res.json({
      message: 'Feedback updated successfully.',
      item: {
        id: String(feedback._id),
        bookingDetailId: String(detail._id),
        fieldId: toIdString(detail.fieldID),
        fieldName: detail.fieldName || '',
        rate: feedback.rate,
        content: feedback.content || '',
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      },
    });
  } catch (err) {
    console.error('updateFeedback error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function deleteFeedback(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const feedbackId = String(req.params?.feedbackId || '').trim();

    if (!mongoose.isValidObjectId(feedbackId)) {
      return res.status(400).json({ message: 'Invalid feedbackId.' });
    }

    const feedback = await Feedback.findOne({ _id: feedbackId, isDeleted: false });
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    const detail = await BookingDetail.findById(feedback.bookingDetailID).lean();
    if (!detail) {
       // If detail is gone, still allow delete if they are the owner? 
       // Better to check feedback ownership directly if we stored it, but we didn't.
       // We rely on detail -> booking -> customerID
      return res.status(404).json({ message: 'Booking detail not found.' });
    }

    const booking = await Booking.findOne({ _id: detail.bookingID, customerID: userId }).lean();
    if (!booking) {
      return res.status(403).json({ message: 'You cannot delete this feedback.' });
    }

    feedback.isDeleted = true;
    feedback.deletedAt = new Date();
    feedback.deletedBy = userId; // Even though it's user deleted, we store who did it
    feedback.deleteReason = 'User deleted';
    await feedback.save();

    return res.json({
      success: true,
      message: 'Feedback deleted successfully.',
    });
  } catch (err) {
    console.error('deleteFeedback error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getOwnerRefundRequests(req, res) {
  try {
    const ownerId = req.user.sub || req.user.id || req.user._id;
    const Booking = require('../models/Booking');
    const BookingDetail = require('../models/BookingDetail');
    const BookingServiceHistory = require('../models/BookingServiceHistory');
    const Field = require('../models/Field');
    const mongoose = require('mongoose');

    const ownerFields = await Field.find({ ownerID: ownerId, status: { $ne: 'Deleted' } }).lean();
    if (!ownerFields.length) {
      return res.json({ count: 0, refunds: [] });
    }
    const fieldIds = ownerFields.map(f => f._id.toString());

    const details = await BookingDetail.find({ fieldID: { $in: fieldIds } }).lean();
    if (!details.length) {
      return res.json({ count: 0, refunds: [] });
    }
    const bookingIds = [...new Set(details.map(d => d.bookingID.toString()))];

    const bookings = await Booking.find({ 
      _id: { $in: bookingIds },
      status: 'Cancel Request'
    }).lean();

    const detailIds = details.map(d => d._id);
    const serviceHistories = await BookingServiceHistory.find({ 
      bookingDetailID: { $in: detailIds },
      status: { $ne: 'Cancelled' }
    }).lean();

    const refunds = bookings.map(b => {
      const isPartialCancel = b.refundDetailIds && b.refundDetailIds.length > 0;
      console.log('getOwnerRefundRequests - b.refundDetailIds raw:', b.refundDetailIds);
      
      const bookingDetails = details.filter(d => d.bookingID.toString() === b._id.toString());
      
      console.log('getOwnerRefundRequests - booking:', b._id);
      console.log('getOwnerRefundRequests - isPartialCancel:', isPartialCancel);
      console.log('getOwnerRefundRequests - refundDetailIds:', b.refundDetailIds);
      console.log('getOwnerRefundRequests - bookingDetails count:', bookingDetails.length);
      
      let serviceTotal = 0;
      const bookingDetailIds = bookingDetails.map(d => d._id.toString());
      const bookingServiceHistories = serviceHistories.filter(sh => 
        bookingDetailIds.includes(sh.bookingDetailID.toString())
      );
      
      let fieldRefund = 0;
      
      if (isPartialCancel) {
        const refundDetailIds = b.refundDetailIds;
        
        for (const d of bookingDetails) {
          if (refundDetailIds.includes(d._id.toString())) {
            fieldRefund += Math.floor((d.priceSnapShot || 0) * 0.8);
          }
        }
        
        for (const sh of bookingServiceHistories) {
          if (refundDetailIds.includes(sh.bookingDetailID.toString())) {
            serviceTotal += sh.totalPriceSnapShot || 0;
          }
        }
        console.log('getOwnerRefundRequests - fieldRefund (partial):', fieldRefund);
      } else {
        for (const sh of bookingServiceHistories) {
          serviceTotal += sh.totalPriceSnapShot || 0;
        }
        fieldRefund = Math.floor(b.totalPrice * 0.8);
      }

      return {
        ...b,
        serviceTotalPrice: serviceTotal,
        fieldRefundAmount: fieldRefund,
        isPartialCancel,
        cancelledSlotCount: isPartialCancel ? b.refundDetailIds.length : bookingDetails.length,
      };
    });

    res.json({ count: refunds.length, refunds });
  } catch (err) {
    console.error('getOwnerRefundRequests error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function approveRefund(req, res) {
  try {
    const { bookingId } = req.params;
    const ownerId = req.user.sub || req.user.id || req.user._id;
    console.log('approveRefund bookingId:', bookingId);
    const Booking = require('../models/Booking');
    const BookingDetail = require('../models/BookingDetail');
    const BookingServiceHistory = require('../models/BookingServiceHistory');
    const Wallet = require('../models/Wallet');
    const Transaction = require('../models/Transaction');
    const Field = require('../models/Field');
    const mongoose = require('mongoose');

    const booking = await Booking.findById(bookingId);
    console.log('approveRefund - booking found:', !!booking);
    console.log('approveRefund - booking.refundDetailIds:', booking?.refundDetailIds);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const allDetails = await BookingDetail.find({ bookingID: bookingId }).lean();
    const fieldIds = allDetails.map(d => d.fieldID?.toString ? d.fieldID.toString() : d.fieldID);
    const fields = await Field.find({ _id: { $in: fieldIds }, ownerID: ownerId, status: { $ne: 'Deleted' } }).lean();
    if (!fields || fields.length === 0) {
      return res.status(403).json({ message: 'Forbidden: Not your field' });
    }

    const isPartialCancel = booking.refundDetailIds && booking.refundDetailIds.length > 0;
    console.log('approveRefund - isPartialCancel:', isPartialCancel);
    console.log('approveRefund - refundDetailIds:', booking.refundDetailIds);
    console.log('approveRefund - allDetails.length:', allDetails.length);
    
    const detailIdsToRefund = isPartialCancel 
      ? booking.refundDetailIds 
      : allDetails.map(d => d._id.toString());

    console.log('approveRefund - detailIdsToRefund:', detailIdsToRefund);
    
    const details = allDetails.filter(d => detailIdsToRefund.includes(d._id.toString()));
    console.log('approveRefund - details to refund count:', details.length);
    console.log('approveRefund - details priceSnapShot:', details.map(d => d.priceSnapShot));
    const customerId = booking.customerID;

    let totalRefund = 0;

    let ownerWallet = await Wallet.findOne({ walletOwnerId: new mongoose.Types.ObjectId(ownerId), walletOwnerModel: 'Owner' });
    if (!ownerWallet) {
      ownerWallet = await Wallet.create({
        walletOwnerId: new mongoose.Types.ObjectId(ownerId),
        walletOwnerModel: 'Owner',
        balance: 0,
      });
    }

    // Hoàn tiền field booking (80%) - dùng priceSnapShot
    let fieldRefundAmount = 0;
    for (const detail of details) {
      const refund = Math.floor((detail.priceSnapShot || 0) * 0.8);
      console.log('approveRefund - slot priceSnapShot:', detail.priceSnapShot, '-> refund:', refund);
      fieldRefundAmount += refund;
    }
    console.log('approveRefund - total fieldRefundAmount:', fieldRefundAmount);

    if (fieldRefundAmount > 0) {
      // Trừ tiền owner wallet
      const ownerBalanceBefore = ownerWallet.balance;
      ownerWallet.balance -= fieldRefundAmount;
      await ownerWallet.save();

      await Transaction.create({
        bookingID: bookingId,
        fromWalletID: ownerWallet._id,
        toWalletID: null,
        type: 'Refund',
        amount: -fieldRefundAmount,
        balanceBefore: ownerBalanceBefore,
        balanceAfter: ownerWallet.balance,
        description: 'Hoàn tiền cho khách hàng (80% tiền sân)',
        bookingType: 'field',
        ownerID: ownerId,
      });

      // Hoàn tiền vào ví customer
      let customerWallet = await Wallet.findOne({ walletOwnerId: new mongoose.Types.ObjectId(customerId), walletOwnerModel: 'UserAccount' });
      if (!customerWallet) {
        customerWallet = await Wallet.create({
          walletOwnerId: new mongoose.Types.ObjectId(customerId),
          walletOwnerModel: 'UserAccount',
          balance: 0,
        });
      }
      const customerBalanceBefore = customerWallet.balance;
      customerWallet.balance += fieldRefundAmount;
      await customerWallet.save();
      totalRefund += fieldRefundAmount;

      await Transaction.create({
        bookingID: bookingId,
        fromWalletID: null,
        toWalletID: customerWallet._id,
        type: 'Refund',
        amount: fieldRefundAmount,
        balanceBefore: customerBalanceBefore,
        balanceAfter: customerWallet.balance,
        description: 'Hoàn tiền hủy sân (80%)',
        bookingType: 'field',
      });
    }

    // Hoàn tiền service bookings (100%)
    const detailIds = details.map(d => d._id);
    const serviceHistories = await BookingServiceHistory.find({ bookingDetailID: { $in: detailIds } }).lean();

    for (const sh of serviceHistories) {
      if (sh.totalPriceSnapShot > 0) {
        // Trừ tiền owner wallet (100% service)
        const ownerBalanceBefore = ownerWallet.balance;
        ownerWallet.balance -= sh.totalPriceSnapShot;
        await ownerWallet.save();

        await Transaction.create({
          bookingID: bookingId,
          fromWalletID: ownerWallet._id,
          toWalletID: null,
          type: 'Refund',
          amount: -sh.totalPriceSnapShot,
          balanceBefore: ownerBalanceBefore,
          balanceAfter: ownerWallet.balance,
          description: 'Hoàn tiền cho khách hàng (100% tiền dịch vụ)',
          bookingType: 'service',
          ownerID: ownerId,
        });

        // Hoàn tiền vào ví customer
        let customerWallet = await Wallet.findOne({ walletOwnerId: new mongoose.Types.ObjectId(customerId), walletOwnerModel: 'UserAccount' });
        if (!customerWallet) {
          customerWallet = await Wallet.create({
            walletOwnerId: new mongoose.Types.ObjectId(customerId),
            walletOwnerModel: 'UserAccount',
            balance: 0,
          });
        }
        const customerBalanceBefore = customerWallet.balance;
        customerWallet.balance += sh.totalPriceSnapShot;
        await customerWallet.save();
        totalRefund += sh.totalPriceSnapShot;

        await Transaction.create({
          bookingID: bookingId,
          fromWalletID: null,
          toWalletID: customerWallet._id,
          type: 'Refund',
          amount: sh.totalPriceSnapShot,
          balanceBefore: customerBalanceBefore,
          balanceAfter: customerWallet.balance,
          description: 'Hoàn tiền hủy dịch vụ (100%)',
          bookingType: 'service',
        });
      }
    }

      if (isPartialCancel) {
      console.log('approveRefund - isPartialCancel = true, processing partial');
      const cancelledDetailObjectIds = detailIdsToRefund.map(id => new mongoose.Types.ObjectId(id));
      await BookingDetail.updateMany(
        { _id: { $in: cancelledDetailObjectIds } },
        { $set: { status: 'Cancel' } }
      );
      
      await BookingServiceHistory.updateMany(
        { bookingDetailID: { $in: cancelledDetailObjectIds } },
        { $set: { status: 'Cancel' } }
      );
      
      const remainingActiveDetails = allDetails.filter(d => 
        !detailIdsToRefund.includes(d._id.toString()) && d.status !== 'Cancel'
      );
      console.log('approveRefund - remainingActiveDetails count:', remainingActiveDetails.length);
      if (remainingActiveDetails.length === 0) {
        console.log('approveRefund - all slots cancelled, setting status = Cancelled');
        booking.status = 'Cancelled';
        booking.statusPayment = 'Refunded';
        await booking.save();
      } else {
        console.log('approveRefund - some slots remain, setting status = Active');
        booking.status = 'Active';
        booking.statusPayment = 'Completed';
        booking.refundDetailIds = [];
        await booking.save();
      }
    } else {
      console.log('approveRefund - isPartialCancel = false (full cancel)');
      booking.status = 'Cancelled';
      booking.statusPayment = 'Refunded';
      await booking.save();

      await BookingDetail.updateMany(
        { bookingID: booking._id },
        { $set: { status: 'Cancel' } }
      );
    }

    const customer = await UserAccount.findById(customerId).lean();
    if (customer && isEmailConfigured()) {
      try {
        await sendWalletRefundEmail({
          to: customer.email,
          name: customer.name,
          amount: totalRefund,
          type: 'refund',
        });
      } catch (e) {
        console.log('Failed to send refund email:', e.message);
      }
    }

    res.json({ success: true, message: `Refund ${totalRefund} VND approved (field 80% + service 100%)`, ownerBalance: ownerWallet.balance, totalRefund });
  } catch (err) {
    console.error('approveRefund error:', err.message);
    console.error(err.stack);
    res.status(500).json({ message: 'Server error: ' + err.message, error: err.message });
  }
}

async function rejectRefund(req, res) {
  try {
    const { bookingId } = req.params;
    const Booking = require('../models/Booking');
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    booking.status = 'Booked';
    await booking.save();
    res.json({ success: true, message: 'Refund rejected' });
  } catch (err) {
    console.error('rejectRefund error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = {
  getMyBookings,
getBookedSlots,
  createBooking,
  validateVoucher,
  cancelBooking,
  cancelSlot,
  getFeedbackEligibility,
  getFeedbackEligibilityByField,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  getOwnerRefundRequests,
  approveRefund,
  rejectRefund,
};
