const Service = require('../../models/Service');
const Field = require('../../models/Field');
const cloudinary = require('cloudinary').v2;

async function checkFieldOwnership(fieldID, ownerID) {
   const field = await Field.findOne({ _id: fieldID, ownerID, status: { $ne: 'Deleted' } });
   return !!field;
}

// 1. Lấy danh sách service của 1 sân
async function getServicesByField(req, res) {
   try {
      const { fieldId } = req.query;
      const ownerID = req.user.sub;

      if (!fieldId) return res.status(400).json({ message: 'Thiếu tham số fieldId.' });

      const isOwner = await checkFieldOwnership(fieldId, ownerID);
      if (!isOwner) return res.status(403).json({ message: 'Không có quyền truy cập sân này.' });

      const services = await Service.find({ fieldID: fieldId }).sort({ createdAt: -1 });
      return res.json({ services });
   } catch (error) {
      return res.status(500).json({ message: 'Lỗi server', error: error.message });
   }
}

// 2. Tạo service mới
async function createService(req, res) {
   try {
      const ownerID = req.user.sub;
      const { fieldID, serviceName, price, stock, image } = req.body;

      if (!fieldID || !serviceName || price === undefined) {
         return res.status(400).json({ message: 'Vui lòng nhập đủ fieldID, serviceName và price.' });
      }

      const isOwner = await checkFieldOwnership(fieldID, ownerID);
      if (!isOwner) return res.status(403).json({ message: 'Không có quyền tạo dịch vụ cho sân này.' });

      let imageUrl = '';
      if (image && image.startsWith('data:image')) {
         const result = await cloudinary.uploader.upload(image, { folder: 'ffms/services' });
         imageUrl = result.secure_url;
      } else if (image) {
         imageUrl = image;
      }

      const newService = new Service({
         fieldID,
         serviceName,
         price,
         stock: stock || 0,
         image: imageUrl
      });
      await newService.save();

      return res.status(201).json({ message: 'Tạo dịch vụ thành công.', service: newService });
   } catch (error) {
      return res.status(500).json({ message: 'Lỗi server', error: error.message });
   }
}

// 3. Cập nhật
async function updateService(req, res) {
   try {
      const ownerID = req.user.sub;
      const { id } = req.params;
      const { serviceName, price, stock, image } = req.body;

      const service = await Service.findById(id);
      if (!service) return res.status(404).json({ message: 'Dịch vụ không tồn tại.' });

      const isOwner = await checkFieldOwnership(service.fieldID, ownerID);
      if (!isOwner) return res.status(403).json({ message: 'Không có quyền sửa dịch vụ này.' });

      let imageUrl = service.image;
      if (image && image.startsWith('data:image')) {
         const result = await cloudinary.uploader.upload(image, { folder: 'ffms/services' });
         imageUrl = result.secure_url;
      } else if (image) {
         imageUrl = image;
      }

      service.serviceName = serviceName || service.serviceName;
      service.price = price !== undefined ? price : service.price;
      service.stock = stock !== undefined ? stock : service.stock;
      service.image = imageUrl;

      await service.save();
      return res.json({ message: 'Cập nhật dịch vụ thành công.', service });
   } catch (error) {
      return res.status(500).json({ message: 'Lỗi server', error: error.message });
   }
}

// 4. Xóa
async function deleteService(req, res) {
   try {
      const ownerID = req.user.sub;
      const { id } = req.params;

      const service = await Service.findById(id);
      if (!service) return res.status(404).json({ message: 'Dịch vụ không tồn tại.' });

      const isOwner = await checkFieldOwnership(service.fieldID, ownerID);
      if (!isOwner) return res.status(403).json({ message: 'Không có quyền xóa dịch vụ này.' });

      // Hard delete cho Service vì db không có field status
      await Service.findByIdAndDelete(id);
      return res.json({ message: 'Xóa dịch vụ thành công.' });
   } catch (error) {
      return res.status(500).json({ message: 'Lỗi server', error: error.message });
   }
}

module.exports = {
   getServicesByField,
   createService,
   updateService,
   deleteService,
};
