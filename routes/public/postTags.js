/**
 * routes/public/postTags.js
 * Public endpoint to retrieve global Post Tag options.
 *
 * Used by Customer/Owner/Manager UIs to keep tag list consistent.
 */

const express = require('express');
const asyncHandler = require('../../middlewares/asyncHandler');

const router = express.Router();

const POST_TAG_OPTIONS = [
  { value: 'ThongBao', label: 'Thông báo' },
  { value: 'TimKeo', label: 'Tìm kèo' },
  { value: 'Tips', label: 'Tips / Kinh nghiệm' },
  { value: 'Review', label: 'Review' },
  { value: 'HoiDap', label: 'Hỏi đáp' },
  { value: 'GiaoLuu', label: 'Giao lưu' },
  { value: 'SuKien', label: 'Sự kiện / Giải đấu' },
  { value: 'KhuyenMai', label: 'Khuyến mãi' },
  { value: 'BaoLoi', label: 'Báo lỗi / Góp ý' },
  { value: 'Khac', label: 'Khác' },
];

// GET /api/public/post-tags
router.get(
  '/',
  asyncHandler(async (req, res) => {
    return res.status(200).json({ items: POST_TAG_OPTIONS });
  })
);

module.exports = router;
