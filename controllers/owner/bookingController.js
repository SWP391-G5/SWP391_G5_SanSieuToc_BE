const Booking = require('../../models/Booking');
const BookingDetail = require('../../models/BookingDetail');
const BookingServiceHistory = require('../../models/BookingServiceHistory');
const Field = require('../../models/Field');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const UserAccount = require('../../models/UserAccount');
const Service = require('../../models/Service');

// GET /api/owner/bookings — Lấy danh sách booking của các sân thuộc Owner
async function getBookingsForOwner(req, res) {
   try {
      const ownerId = req.user.sub || req.user.userId || req.user.id;
      const { status } = req.query;

      // Bước 1: Lấy tất cả sân của Owner này
      const ownerFields = await Field.find({ ownerID: ownerId, status: { $ne: 'Deleted' } }).lean();
      if (!ownerFields.length) {
         return res.json({ bookings: [] });
      }
      const fieldIds = ownerFields.map((f) => f._id.toString());

      // Bước 2: Lấy tất cả BookingDetails có fieldID thuộc sân của Owner
      const details = await BookingDetail.find({ fieldID: { $in: fieldIds } })
         .sort({ createdAt: -1 })
         .lean();

      if (!details.length) {
         return res.json({ bookings: [] });
      }

      const bookingIds = [...new Set(details.map((d) => d.bookingID.toString()))];

      // Bước 3: Lấy Bookings với optional status filter
      const query = { _id: { $in: bookingIds } };
      if (status && status !== 'All') {
         query.status = status;
      }
      const bookings = await Booking.find(query).sort({ createdAt: -1 }).lean();

      // Bước 4: Map BookingDetail theo bookingID
      const detailsByBooking = {};
      for (const d of details) {
         const key = d.bookingID.toString();
         if (!detailsByBooking[key]) detailsByBooking[key] = [];
         detailsByBooking[key].push(d);
      }

      // Bước 5: Lấy thông tin Customer
      const customerIds = [...new Set(bookings.map((b) => b.customerID.toString()))];
      const customers = await UserAccount.find({ _id: { $in: customerIds } }, 'name email phone').lean();
      const customerMap = {};
      for (const c of customers) {
         customerMap[c._id.toString()] = c;
      }

      // Bước 6: Build response
      const result = bookings.map((b) => {
         const bDetails = detailsByBooking[b._id.toString()] || [];
         const fieldId = bDetails[0]?.fieldID?.toString();
         const fieldInfo = ownerFields.find((f) => f._id.toString() === fieldId) || {};
         const customer = customerMap[b.customerID.toString()] || {};

         const dateKeys = [...new Set(bDetails.map((d) => new Date(d.startTime).toISOString().split('T')[0]))].sort();
const slotsFormatted = bDetails.map((d) => {
             const s = new Date(d.startTime);
             const e = new Date(d.endTime);
             const startHour = String(s.getHours()).padStart(2, '0');
             const startMin = String(s.getMinutes()).padStart(2, '0');
             const endHour = String(e.getHours()).padStart(2, '0');
             const endMin = String(e.getMinutes()).padStart(2, '0');
             return `${startHour}:${startMin} - ${endHour}:${endMin}`;
          });

         return {
            id: b._id,
            bookingStatus: b.status,
            paymentStatus: b.statusPayment,
            totalPrice: b.totalPrice,
            refundReason: b.refundReason,
            createdAt: b.createdAt,
            customer: {
               id: b.customerID,
               name: customer.name || 'N/A',
               email: customer.email || '',
               phone: customer.phone || '',
            },
            field: {
               id: fieldInfo._id,
               name: fieldInfo.fieldName || bDetails[0]?.fieldName || 'N/A',
               type: fieldInfo.fieldType || '',
               image: fieldInfo.image?.[0] || bDetails[0]?.fieldImage || '',
            },
            dates: dateKeys,
            slots: slotsFormatted,
         };
      });

      res.json({ bookings: result, total: result.length });
   } catch (err) {
      console.error('getBookingsForOwner error:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
   }
}

// PATCH /api/owner/bookings/:id/approve-cancel — Duyệt hủy + hoàn ví (cả field và service)
async function approveCancel(req, res) {
   try {
      const ownerId = req.user.sub || req.user.userId || req.user.id;
      const { id } = req.params;

      const booking = await Booking.findById(id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      // Ownership check
      const details = await BookingDetail.find({ bookingID: id }).lean();
      if (!details || details.length === 0) {
         return res.status(404).json({ message: 'Booking detail not found' });
      }

      const fieldIds = details.map(d => d.fieldID?.toString ? d.fieldID.toString() : d.fieldID);
      const fields = await Field.find({ _id: { $in: fieldIds }, ownerID: ownerId, status: { $ne: 'Deleted' } }).lean();
      if (!fields || fields.length === 0) {
         return res.status(403).json({ message: 'Forbidden: Not your field' });
      }

      if (booking.status !== 'Cancel Request') {
         return res.status(400).json({ message: 'Booking is not in Cancel Request status' });
      }

      let totalRefund = 0;
      const ownerWalletsByField = {};

      // Lấy owner wallet
      let ownerWallet = await Wallet.findOne({
         walletOwnerId: ownerId,
         walletOwnerModel: 'Owner',
      });
if (!ownerWallet) {
          ownerWallet = await Wallet.create({
             walletOwnerId: ownerId,
             walletOwnerModel: 'Owner',
             balance: 0,
             reservedBalance: 0,
          });
       }

// Hoàn tiền field booking (80%)
      const fieldRefundAmount = Math.floor(booking.totalPrice * 0.8);
      if (fieldRefundAmount > 0 && booking.statusPayment === 'Pending Refund') {
         // Trừ tiền owner wallet
         const ownerBalanceBefore = ownerWallet.balance;
         ownerWallet.balance -= fieldRefundAmount;
         await ownerWallet.save();

         await Transaction.create({
            bookingID: booking._id,
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
         let customerWallet = await Wallet.findOne({
            walletOwnerId: booking.customerID,
            walletOwnerModel: 'UserAccount',
         });
         if (!customerWallet) {
            customerWallet = await Wallet.create({
               walletOwnerId: booking.customerID,
               walletOwnerModel: 'UserAccount',
               balance: 0,
            });
         }
         const customerBalanceBefore = customerWallet.balance;
         customerWallet.balance += fieldRefundAmount;
         await customerWallet.save();
         totalRefund += fieldRefundAmount;

         await Transaction.create({
            bookingID: booking._id,
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

      // Hoàn tiền service bookings (100%) và hoàn stock
      const detailIds = details.map(d => d._id);
      const serviceHistories = await BookingServiceHistory.find({ bookingDetailID: { $in: detailIds } }).lean();
      
      for (const sh of serviceHistories) {
         // Hoàn stock cho từng service
         if (sh.service && sh.service.length > 0) {
            for (const s of sh.service) {
               const service = await Service.findById(s.serviceId);
               if (service) {
                  service.stock += s.quantity;
                  await service.save();
               }
            }
         }
         
         if (sh.totalPriceSnapShot > 0) {
            // Trừ tiền owner wallet (100% service)
            const ownerBalanceBefore = ownerWallet.balance;
            ownerWallet.balance -= sh.totalPriceSnapShot;
            await ownerWallet.save();

            await Transaction.create({
               bookingID: booking._id,
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
            let customerWallet = await Wallet.findOne({
               walletOwnerId: booking.customerID,
               walletOwnerModel: 'UserAccount',
            });
            if (!customerWallet) {
               customerWallet = await Wallet.create({
                  walletOwnerId: booking.customerID,
                  walletOwnerModel: 'UserAccount',
                  balance: 0,
               });
            }
            const customerBalanceBefore = customerWallet.balance;
            customerWallet.balance += sh.totalPriceSnapShot;
            await customerWallet.save();
            totalRefund += sh.totalPriceSnapShot;

            await Transaction.create({
               bookingID: booking._id,
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

// Cập nhật trạng thái Booking
       booking.status = 'Cancelled';
       booking.statusPayment = 'Refunded';
       await booking.save();

       // Cập nhật tất cả BookingDetail sang Cancelled
       await BookingDetail.updateMany({ bookingID: id }, { status: 'Cancelled' });

      res.json({
         message: 'Cancellation approved and refund processed.',
         booking: { id: booking._id, status: booking.status, statusPayment: booking.statusPayment },
         totalRefund,
      });
   } catch (err) {
      console.error('approveCancel error:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
   }
}

// PATCH /api/owner/bookings/:id/reject-cancel — Từ chối hủy
async function rejectCancel(req, res) {
   try {
      const ownerId = req.user.sub || req.user.userId || req.user.id;
      const { id } = req.params;

      const booking = await Booking.findById(id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      // Ownership check
      const detail = await BookingDetail.findOne({ bookingID: id });
      const field = await Field.findOne({ _id: detail?.fieldID, ownerID: ownerId });
      if (!field) return res.status(403).json({ message: 'Forbidden: Not your field' });

      if (booking.status !== 'Cancel Request') {
         return res.status(400).json({ message: 'Booking is not in Cancel Request status' });
      }

booking.status = 'Active';
       booking.statusPayment = 'Completed';
       booking.refundReason = '';
       await booking.save();

       res.json({
          message: 'Cancellation request rejected. Booking restored.',
          booking: { id: booking._id, status: booking.status, statusPayment: booking.statusPayment },
       });
   } catch (err) {
      console.error('rejectCancel error:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
   }
}

module.exports = { getBookingsForOwner, approveCancel, rejectCancel };
