const Voucher = require('../../models/Voucher');

// Get all vouchers for the owner
exports.getVouchers = async (req, res) => {
   try {
      const ownerId = req.user.sub || req.user.userId || req.user.id;
      const vouchers = await Voucher.find({ ownerID: ownerId })
         .populate('applicableFields.fieldID', 'fieldName')
         .sort({ createdAt: -1 });
      res.json({ success: true, vouchers });
   } catch (error) {
      console.error('getVouchers error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
   }
};

// Create a new voucher
exports.createVoucher = async (req, res) => {
   try {
      const ownerId = req.user.sub || req.user.userId || req.user.id;
      const { voucherName, discountValue, beginDate, endDate, quantity, maxDiscount, applicableFields } = req.body;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(beginDate);
      const end = new Date(endDate);

      if (start < today) {
         return res.status(400).json({ success: false, message: 'Start date cannot be in the past' });
      }
      if (end <= start) {
         return res.status(400).json({ success: false, message: 'End date must be after start date' });
      }
      if (discountValue <= 0 || discountValue > 100) {
         return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 100' });
      }
      if (maxDiscount < 0 || maxDiscount > 9999999) {
         return res.status(400).json({ success: false, message: 'Max discount must be between 0 and 9,999,999' });
      }

      if (!/^[A-Za-z0-9]+$/.test(voucherName)) {
         return res.status(400).json({ success: false, message: 'Voucher code can only contain letters and numbers' });
      }
      if (voucherName.length > 50) {
         return res.status(400).json({ success: false, message: 'Voucher code must be at most 50 characters' });
      }

      const existing = await Voucher.findOne({ voucherName: { $regex: new RegExp(`^${voucherName}$`, 'i') }, ownerID: ownerId });
      if (existing) {
         return res.status(400).json({ success: false, message: 'Voucher name already exists for this owner' });
      }

      const voucher = new Voucher({
         ownerID: ownerId,
         voucherName: voucherName.trim().toUpperCase(),
         discountValue,
         beginDate,
         endDate,
         quantity,
         maxDiscount,
         applicableFields: Array.isArray(applicableFields) ? applicableFields.map(id => ({ fieldID: id })) : []
      });

      await voucher.save();
      res.status(201).json({ success: true, voucher });
   } catch (error) {
      console.error('createVoucher error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
   }
};

// Update an existing voucher
exports.updateVoucher = async (req, res) => {
   try {
      const ownerId = req.user.sub || req.user.userId || req.user.id;
      const { id } = req.params;
      const { voucherName, discountValue, beginDate, endDate, quantity, maxDiscount, applicableFields } = req.body;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const voucher = await Voucher.findOne({ _id: id, ownerID: ownerId });
      if (!voucher) {
         return res.status(404).json({ success: false, message: 'Voucher not found or unauthorized' });
      }

      if (beginDate || endDate) {
         const start = new Date(beginDate || voucher.beginDate);
         const end = new Date(endDate || voucher.endDate);
         if (beginDate && new Date(beginDate) < today) {
            return res.status(400).json({ success: false, message: 'Start date cannot be in the past' });
         }
         if (end <= start) {
            return res.status(400).json({ success: false, message: 'End date must be after start date' });
         }
      }

      if (maxDiscount !== undefined) {
         if (maxDiscount < 0 || maxDiscount > 9999999) {
            return res.status(400).json({ success: false, message: 'Max discount must be between 0 and 9,999,999' });
         }
      }

      if (voucherName) {
         if (!/^[A-Za-z0-9]+$/.test(voucherName)) {
            return res.status(400).json({ success: false, message: 'Voucher code can only contain letters and numbers' });
         }
         if (voucherName.length > 50) {
            return res.status(400).json({ success: false, message: 'Voucher code must be at most 50 characters' });
         }
      }

      if (voucherName && voucherName.trim().toUpperCase() !== voucher.voucherName.toUpperCase()) {
         const existing = await Voucher.findOne({
            voucherName: { $regex: new RegExp(`^${voucherName}$`, 'i') },
            ownerID: ownerId
         });
         if (existing) {
            return res.status(400).json({ success: false, message: 'Voucher name already exists' });
         }
         voucher.voucherName = voucherName.trim().toUpperCase();
      }

      if (discountValue !== undefined) {
         if (discountValue <= 0 || discountValue > 100) {
            return res.status(400).json({ success: false, message: 'Discount percentage must be between 1 and 100' });
         }
         voucher.discountValue = discountValue;
      }
      if (beginDate) voucher.beginDate = beginDate;
      if (endDate) voucher.endDate = endDate;
      if (quantity !== undefined) voucher.quantity = quantity;
      if (maxDiscount !== undefined) voucher.maxDiscount = maxDiscount;
      if (applicableFields) {
         voucher.applicableFields = Array.isArray(applicableFields) ? applicableFields.map(fieldId => ({ fieldID: fieldId })) : [];
      }

      await voucher.save();
      res.json({ success: true, voucher });
   } catch (error) {
      console.error('updateVoucher error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
   }
};

// Delete a voucher
exports.deleteVoucher = async (req, res) => {
   try {
      const ownerId = req.user.sub || req.user.userId || req.user.id;
      const { id } = req.params;

      const voucher = await Voucher.findOneAndDelete({ _id: id, ownerID: ownerId });
      if (!voucher) {
         return res.status(404).json({ success: false, message: 'Voucher not found or unauthorized' });
      }

      res.json({ success: true, message: 'Voucher deleted successfully' });
   } catch (error) {
      console.error('deleteVoucher error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
   }
};
