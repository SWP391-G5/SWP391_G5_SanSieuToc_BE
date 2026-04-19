const cloudinary = require('cloudinary').v2;
const Field = require('../../models/Field');
const BookingDetail = require('../../models/BookingDetail');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Upload base64 image string to Cloudinary.
 * Returns secure_url or throws.
 */
async function uploadToCloudinary(base64String) {
   const result = await cloudinary.uploader.upload(base64String, {
      folder: 'ffms/fields',
      resource_type: 'image',
   });
   return result.secure_url;
}

/**
 * Process image list: upload base64 items, pass-through existing URLs.
 * @param {string[]} images - array of base64 strings or existing URLs
 * @returns {Promise<string[]>} - array of Cloudinary URLs
 */
async function processImages(images) {
   if (!Array.isArray(images) || images.length === 0) return [];

   const uploads = images.map(async (img) => {
      if (typeof img === 'string' && img.startsWith('data:')) {
         return await uploadToCloudinary(img);
      }
      return img; // already a URL
   });

   return await Promise.all(uploads);
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/owner/fields
 * Lấy danh sách sân của owner đang đăng nhập.
 * Query: ?status=Active|Maintain
 */
async function getMyFields(req, res) {
   const ownerID = req.user.sub;
   const { status } = req.query;

   const filter = {
      ownerID,
      status: { $ne: 'Deleted' },
   };

   if (status && ['Active', 'Maintain'].includes(status)) {
      filter.status = status;
   }

   const fields = await Field.find(filter).sort({ createdAt: -1 });
   return res.json({ fields });
}

/**
 * GET /api/owner/fields/:id
 * Xem chi tiết 1 sân — chỉ xem được sân của chính mình.
 */
async function getFieldById(req, res) {
   const ownerID = req.user.sub;
   const { id } = req.params;

   const field = await Field.findOne({ _id: id, ownerID, status: { $ne: 'Deleted' } });
   if (!field) {
      return res.status(404).json({ message: 'Không tìm thấy sân.' });
   }

   return res.json({ field });
}

/**
 * POST /api/owner/fields
 * Tạo sân mới.
 */
async function createField(req, res) {
   const ownerID = req.user.sub;
   const {
      fieldName,
      fieldType,
      address,
      description,
      hourlyPrice,
      slotDuration,
      openingTime,
      closingTime,
      utilities,
      image,
   } = req.body || {};

   if (!fieldName || !String(fieldName).trim()) {
      return res.status(400).json({ message: 'Tên sân là bắt buộc.' });
   }
   if (!fieldType || !String(fieldType).trim()) {
      return res.status(400).json({ message: 'Loại sân là bắt buộc.' });
   }

   if (hourlyPrice !== undefined) {
      const hourlyPriceNumber = Number(hourlyPrice);
      if (Number.isNaN(hourlyPriceNumber) || hourlyPriceNumber < 0) {
         return res.status(400).json({ message: 'Giá/giờ không hợp lệ.' });
      }
   }

   const imageUrls = await processImages(image);

   const field = await Field.create({
      ownerID,
      fieldName: String(fieldName).trim(),
      fieldType: String(fieldType).trim(),
      address: address ? String(address).trim() : '',
      description: description ? String(description).trim() : '',
      hourlyPrice: hourlyPrice !== undefined ? Number(hourlyPrice) : 0,
      price: hourlyPrice !== undefined ? Number(hourlyPrice) : 0,
      slotDuration: slotDuration ? Number(slotDuration) : 60,
      openingTime: openingTime ? String(openingTime).trim() : '06:00',
      closingTime: closingTime ? String(closingTime).trim() : '22:00',
      utilities: Array.isArray(utilities) ? utilities.map((u) => String(u).trim()).filter(Boolean) : [],
      image: imageUrls,
      status: 'Active',
   });

   return res.status(201).json({ message: 'Tạo sân thành công.', field });
}

/**
 * PUT /api/owner/fields/:id
 * Cập nhật thông tin sân — chỉ sân của chính mình.
 */
async function updateField(req, res) {
   const ownerID = req.user.sub;
   const { id } = req.params;

   const field = await Field.findOne({ _id: id, ownerID, status: { $ne: 'Deleted' } });
   if (!field) {
      return res.status(404).json({ message: 'Không tìm thấy sân.' });
   }

   const {
      fieldName,
      fieldType,
      address,
      description,
      hourlyPrice,
      slotDuration,
      openingTime,
      closingTime,
      utilities,
      image,
   } = req.body || {};

   if (hourlyPrice !== undefined) {
      const hourlyPriceNumber = Number(hourlyPrice);
      if (Number.isNaN(hourlyPriceNumber) || hourlyPriceNumber < 0) {
         return res.status(400).json({ message: 'Giá/giờ không hợp lệ.' });
      }
   }

   if (fieldName !== undefined) field.fieldName = String(fieldName).trim();
   if (fieldType !== undefined) field.fieldType = String(fieldType).trim();
   if (address !== undefined) field.address = String(address).trim();
   if (description !== undefined) field.description = String(description).trim();
   if (hourlyPrice !== undefined) {
      const hourlyPriceNumber = Number(hourlyPrice);
      field.hourlyPrice = hourlyPriceNumber;
      field.price = hourlyPriceNumber;
   }
   if (slotDuration !== undefined) field.slotDuration = Number(slotDuration);
   if (openingTime !== undefined) field.openingTime = String(openingTime).trim();
   if (closingTime !== undefined) field.closingTime = String(closingTime).trim();
   if (utilities !== undefined) {
      field.utilities = Array.isArray(utilities)
         ? utilities.map((u) => String(u).trim()).filter(Boolean)
         : [];
   }
   if (image !== undefined) {
      field.image = await processImages(image);
   }

   await field.save();
   return res.json({ message: 'Cập nhật sân thành công.', field });
}

/**
 * PATCH /api/owner/fields/:id/status
 * Đổi trạng thái sân: chỉ cho phép Active <-> Maintain.
 * Body: { status: "Active" | "Maintain" }
 */
async function updateFieldStatus(req, res) {
   const ownerID = req.user.sub;
   const { id } = req.params;
   const { status } = req.body || {};

   const ALLOWED_STATUSES = ['Active', 'Maintain'];
   if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
         message: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${ALLOWED_STATUSES.join(', ')}.`,
      });
   }

   const field = await Field.findOne({ _id: id, ownerID, status: { $ne: 'Deleted' } });
   if (!field) {
      return res.status(404).json({ message: 'Không tìm thấy sân.' });
   }

   field.status = status;
   await field.save();

   return res.json({ message: `Cập nhật trạng thái sân thành "${status}" thành công.`, field });
}

/**
 * DELETE /api/owner/fields/:id
 * Soft delete: set status = 'Deleted'.
 * Chặn nếu còn booking đang active.
 */
async function deleteField(req, res) {
   const ownerID = req.user.sub;
   const { id } = req.params;

   const field = await Field.findOne({ _id: id, ownerID, status: { $ne: 'Deleted' } });
   if (!field) {
      return res.status(404).json({ message: 'Không tìm thấy sân.' });
   }

   // Kiểm tra BookingDetail đang active cho sân này
   const activeBooking = await BookingDetail.findOne({
      fieldID: field._id,
      status: 'Active',
   });

   if (activeBooking) {
      return res.status(409).json({
         message: 'Không thể xóa sân đang có booking chờ xác nhận hoặc đã xác nhận.',
      });
   }

   field.status = 'Deleted';
   await field.save();

   return res.json({ message: 'Xóa sân thành công.' });
}

module.exports = {
   getMyFields,
   getFieldById,
   createField,
   updateField,
   updateFieldStatus,
   deleteField,
};
