const Service = require('../models/Service');
const Booking = require('../models/Booking');
const BookingDetail = require('../models/BookingDetail');
const BookingServiceHistory = require('../models/BookingServiceHistory');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const UserAccount = require('../models/UserAccount');

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

async function getMyServiceHistory(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    console.log('getMyServiceHistory for user:', userId);
    
    const bookings = await Booking.find({ 
      customerID: userId,
      status: { $ne: 'Cancel' }
    }).lean();
    console.log('Found bookings:', bookings.length);
    
    if (bookings.length === 0) {
      return res.json({ services: [] });
    }
    
    const bookingIds = bookings.map(b => b._id);
    
    const bookingDetails = await BookingDetail.find({ 
      bookingID: { $in: bookingIds }
    }).lean();
    console.log('Found bookingDetails:', bookingDetails.length);
    
    if (bookingDetails.length === 0) {
      return res.json({ services: [] });
    }
    
    const detailIds = bookingDetails.map(d => d._id);
    
    const serviceHistories = await BookingServiceHistory.find({ 
      bookingDetailID: { $in: detailIds }
    }).populate('bookingDetailID', 'fieldName fieldAddress startTime').lean();
    console.log('Found serviceHistories:', serviceHistories.length);
    
    const result = serviceHistories.map(sh => {
      const detail = bookingDetails.find(d => d._id.toString() === sh.bookingDetailID.toString());
      const booking = bookings.find(b => b._id.toString() === detail?.bookingID?.toString());
      return {
        id: sh._id,
        fieldName: detail?.fieldName || '',
        fieldAddress: detail?.fieldAddress || '',
        date: detail?.startTime ? new Date(detail.startTime).toISOString().split('T')[0] : '',
        time: detail?.startTime ? new Date(detail.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
        services: sh.service || [],
        totalPrice: sh.totalPriceSnapShot || 0,
        status: booking?.status || '',
        statusPayment: booking?.statusPayment || ''
      };
    });
    
    console.log('Result:', result);
    res.json({ services: result });
  } catch (err) {
    console.error('getMyServiceHistory error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function bookServices(req, res) {
  try {
    const userId = req.user.sub || req.user.userId || req.user.id;
    const { bookingDetailId, services, paymentMethod, totalPrice } = req.body;
    
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
    
    const newServices = services.map(s => ({
      serviceId: s.serviceId,
      serviceName: s.serviceName,
      price: s.price,
      quantity: s.quantity || 1,
    }));
    
    const calculatedTotalPrice = newServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);
    const finalTotal = totalPrice || calculatedTotalPrice;
    
    if (paymentMethod === 'wallet' && finalTotal > 0) {
      let wallet = await Wallet.findOne({ walletOwnerId: userId, walletOwnerModel: 'UserAccount' });
      
      if (!wallet) {
        wallet = await Wallet.create({
          walletOwnerId: userId,
          walletOwnerModel: 'UserAccount',
          balance: 0,
        });
      }
      
      if (wallet.balance < finalTotal) {
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }
      
      const balanceBefore = wallet.balance;
      wallet.balance -= finalTotal;
      await wallet.save();
      
      await Transaction.create({
        bookingID: booking._id,
        fromWalletID: wallet._id,
        toWalletID: null,
        type: 'Service Payment',
        amount: finalTotal,
        balanceBefore,
        balanceAfter: wallet.balance,
        description: `Service payment for ${bookingDetail.fieldName}`,
        bookingType: 'service',
      });

      const Field = require('../models/Field');
      const field = await Field.findById(bookingDetail.fieldID).lean();
      if (field?.ownerID) {
        const owner = await UserAccount.findById(field.ownerID).lean();
        const ownerName = owner?.name || owner?.username || 'Unknown Owner';
        
        let ownerWallet = await Wallet.findOne({ walletOwnerId: field.ownerID, walletOwnerModel: 'Owner' });
        
        if (!ownerWallet) {
          ownerWallet = await Wallet.create({
            walletOwnerId: field.ownerID,
            walletOwnerModel: 'Owner',
            balance: 0,
          });
        }
        
        const ownerBalanceBefore = ownerWallet.balance;
        ownerWallet.balance += finalTotal;
        await ownerWallet.save();
        
        await Transaction.create({
          bookingID: booking._id,
          fromWalletID: null,
          toWalletID: ownerWallet._id,
          type: 'Service Payment',
          amount: finalTotal,
          balanceBefore: ownerBalanceBefore,
          balanceAfter: ownerWallet.balance,
          description: `Doanh thu dịch vụ từ ${bookingDetail.fieldName}`,
          bookingType: 'service',
        });
      }
    }
    
    serviceHistory = await BookingServiceHistory.create({
      bookingDetailID: bookingDetailId,
      serviceID: newServices[0]?.serviceId,
      totalPriceSnapShot: finalTotal,
      service: newServices,
    });
    
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
  getMyServiceHistory,
  bookServices,
};
