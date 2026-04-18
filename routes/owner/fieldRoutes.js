const express = require('express');
const router = express.Router();

const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const asyncHandler = require('../../middlewares/asyncHandler');
const {
   getMyFields,
   getFieldById,
   createField,
   updateField,
   updateFieldStatus,
   deleteField,
} = require('../../controllers/owner/fieldController');

// Tất cả routes bên dưới yêu cầu đăng nhập + role Owner
router.use(authenticate, authorizeRoles(['Owner']));

// GET    /api/owner/fields         — danh sách sân của owner
router.get('/', asyncHandler(getMyFields));

// GET    /api/owner/fields/:id     — chi tiết 1 sân
router.get('/:id', asyncHandler(getFieldById));

// POST   /api/owner/fields         — tạo sân mới
router.post('/', asyncHandler(createField));

// PUT    /api/owner/fields/:id     — cập nhật thông tin sân
router.put('/:id', asyncHandler(updateField));

// PATCH  /api/owner/fields/:id/status — đổi trạng thái (Active/Maintain)
router.patch('/:id/status', asyncHandler(updateFieldStatus));

// DELETE /api/owner/fields/:id     — xóa mềm sân
router.delete('/:id', asyncHandler(deleteField));

module.exports = router;
