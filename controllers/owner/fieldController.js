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

function escapeRegex(input) {
   return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTimeToMinutes(value) {
   const s = String(value || '').trim();
   const parts = s.split(':');
   if (parts.length !== 2) return null;
   const h = Number(parts[0]);
   const m = Number(parts[1]);
   if (Number.isNaN(h) || Number.isNaN(m)) return null;
   if (h < 0 || h > 23 || m < 0 || m > 59) return null;
   return h * 60 + m;
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

   const fieldNameTrimmed = String(fieldName || '').trim();
   const fieldTypeTrimmed = String(fieldType || '').trim();
   const addressTrimmed = String(address || '').trim();
   const openingTimeTrimmed = String(openingTime || '').trim();
   const closingTimeTrimmed = String(closingTime || '').trim();

   if (!fieldNameTrimmed) {
      return res.status(400).json({ message: 'Tên sân là bắt buộc.' });
   }
   if (!fieldTypeTrimmed) {
      return res.status(400).json({ message: 'Loại sân là bắt buộc.' });
   }
   if (!addressTrimmed) {
      return res.status(400).json({ message: 'Địa chỉ sân là bắt buộc.' });
   }
   if (!openingTimeTrimmed) {
      return res.status(400).json({ message: 'Giờ mở cửa là bắt buộc.' });
   }
   if (!closingTimeTrimmed) {
      return res.status(400).json({ message: 'Giờ đóng cửa là bắt buộc.' });
   }
   if (hourlyPrice === undefined || hourlyPrice === null || String(hourlyPrice).trim() === '') {
      return res.status(400).json({ message: 'Giá/slot là bắt buộc.' });
   }
   if (slotDuration === undefined || slotDuration === null || String(slotDuration).trim() === '') {
      return res.status(400).json({ message: 'Thời lượng slot là bắt buộc.' });
   }

   const hourlyPriceNumber = Number(hourlyPrice);
   if (Number.isNaN(hourlyPriceNumber) || hourlyPriceNumber < 0) {
      return res.status(400).json({ message: 'Giá/slot không hợp lệ.' });
   }

   const slotDurationNumber = Number(slotDuration);
   if (Number.isNaN(slotDurationNumber) || slotDurationNumber <= 0) {
      return res.status(400).json({ message: 'Thời lượng slot không hợp lệ.' });
   }
   if (slotDurationNumber % 30 !== 0) {
      return res.status(400).json({ message: 'Thời lượng slot phải là bội số của 30 phút.' });
   }

   const openingMinutes = parseTimeToMinutes(openingTimeTrimmed);
   const closingMinutes = parseTimeToMinutes(closingTimeTrimmed);
   if (openingMinutes === null || closingMinutes === null) {
      return res.status(400).json({ message: 'Giờ mở/đóng cửa không hợp lệ.' });
   }
   if (closingMinutes <= openingMinutes) {
      return res.status(400).json({ message: 'Giờ đóng cửa phải lớn hơn giờ mở cửa.' });
   }

   const duplicate = await Field.findOne({
      ownerID,
      status: { $ne: 'Deleted' },
      fieldName: { $regex: new RegExp(`^${escapeRegex(fieldNameTrimmed)}$`, 'i') },
   }).lean();
   if (duplicate) {
      return res.status(409).json({ message: 'Tên sân đã tồn tại. Vui lòng chọn tên khác.' });
   }

   if (Array.isArray(image) && image.length > 5) {
      return res.status(400).json({ message: 'Chỉ được phép tải lên tối đa 5 hình ảnh.' });
   }

   const imageUrls = await processImages(image);

   const field = await Field.create({
      ownerID,
      fieldName: fieldNameTrimmed,
      fieldType: fieldTypeTrimmed,
      address: addressTrimmed,
      description: description ? String(description).trim() : '',
      hourlyPrice: hourlyPriceNumber,
      price: hourlyPriceNumber,
      slotDuration: slotDurationNumber,
      openingTime: openingTimeTrimmed || '06:00',
      closingTime: closingTimeTrimmed || '22:00',
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

   if (fieldName !== undefined) {
      const nextName = String(fieldName).trim();
      if (!nextName) return res.status(400).json({ message: 'Tên sân là bắt buộc.' });

      const duplicate = await Field.findOne({
         ownerID,
         status: { $ne: 'Deleted' },
         _id: { $ne: field._id },
         fieldName: { $regex: new RegExp(`^${escapeRegex(nextName)}$`, 'i') },
      }).lean();
      if (duplicate) {
         return res.status(409).json({ message: 'Tên sân đã tồn tại. Vui lòng chọn tên khác.' });
      }

      field.fieldName = nextName;
   }
   if (fieldType !== undefined) {
      const nextType = String(fieldType).trim();
      if (!nextType) return res.status(400).json({ message: 'Loại sân là bắt buộc.' });
      field.fieldType = nextType;
   }
   if (address !== undefined) {
      const nextAddress = String(address).trim();
      if (!nextAddress) return res.status(400).json({ message: 'Địa chỉ sân là bắt buộc.' });
      field.address = nextAddress;
   }
   if (description !== undefined) field.description = String(description).trim();
   if (hourlyPrice !== undefined) {
      const hourlyPriceNumber = Number(hourlyPrice);
      if (Number.isNaN(hourlyPriceNumber) || hourlyPriceNumber < 0) {
         return res.status(400).json({ message: 'Giá/slot không hợp lệ.' });
      }
      field.hourlyPrice = hourlyPriceNumber;
      field.price = hourlyPriceNumber;
   }
   if (slotDuration !== undefined) {
      const slotDurationNumber = Number(slotDuration);
      if (Number.isNaN(slotDurationNumber) || slotDurationNumber <= 0) {
         return res.status(400).json({ message: 'Thời lượng slot không hợp lệ.' });
      }
      if (slotDurationNumber % 30 !== 0) {
         return res.status(400).json({ message: 'Thời lượng slot phải là bội số của 30 phút.' });
      }
      field.slotDuration = slotDurationNumber;
   }
   if (openingTime !== undefined) {
      const nextOpening = String(openingTime).trim();
      if (!nextOpening) return res.status(400).json({ message: 'Giờ mở cửa là bắt buộc.' });
      field.openingTime = nextOpening;
   }
   if (closingTime !== undefined) {
      const nextClosing = String(closingTime).trim();
      if (!nextClosing) return res.status(400).json({ message: 'Giờ đóng cửa là bắt buộc.' });
      field.closingTime = nextClosing;
   }

   if (openingTime !== undefined || closingTime !== undefined) {
      const openingMinutes = parseTimeToMinutes(field.openingTime);
      const closingMinutes = parseTimeToMinutes(field.closingTime);
      if (openingMinutes === null || closingMinutes === null) {
         return res.status(400).json({ message: 'Giờ mở/đóng cửa không hợp lệ.' });
      }
      if (closingMinutes <= openingMinutes) {
         return res.status(400).json({ message: 'Giờ đóng cửa phải lớn hơn giờ mở cửa.' });
      }
   }
   if (utilities !== undefined) {
      field.utilities = Array.isArray(utilities)
         ? utilities.map((u) => String(u).trim()).filter(Boolean)
         : [];
   }
   if (image !== undefined) {
      if (Array.isArray(image) && image.length > 5) {
         return res.status(400).json({ message: 'Chỉ được phép tải lên tối đa 5 hình ảnh.' });
      }
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
