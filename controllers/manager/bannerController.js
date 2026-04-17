/**
 * bannerController.js
 * HTTP handlers for Manager/Admin Banner management.
 *
 * NOTE: Data is stored in MarketingResource (type='banner').
 */

const asyncHandler = require('../../middlewares/asyncHandler');
const bannerService = require('../../services/manager/bannerService');
const { upload } = require('../../utils/upload/multerMemory');
const { uploadImageBuffer } = require('../../utils/cloudinary/uploadImageBuffer');

// 1 image per banner (keep field name 'images' to match existing FE FormData)
const uploadBannerImages = upload.array('images', 1);

function toBannerDto(doc) {
  if (!doc) return doc;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    ...d,
    title: d.title ?? d.name ?? '',
    imageUrl: d.imageUrl ?? (Array.isArray(d.image) ? d.image[0] : undefined),
  };
}

const listBanners = asyncHandler(async (req, res) => {
  const { placement } = req.query;
  const data = await bannerService.listBanners({ placement });
  const items = (data?.items || []).map(toBannerDto);
  res.json({ items });
});

const createBanner = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  const title = req.body?.title;
  const placement = req.body?.placement;
  const order = req.body?.order;
  const isActive = req.body?.isActive;

  const file = (req.files || [])[0];
  if (!file) return res.status(400).json({ message: 'images[0] is required' });

  const uploadResult = await uploadImageBuffer(file.buffer, {
    folder: 'banners',
  });

  const doc = await bannerService.createBanner({
    title,
    imageUrl: uploadResult?.url,
    placement,
    order,
    isActive: isActive === 'false' ? false : !!isActive,
    userId,
  });

  res.status(201).json(toBannerDto(doc));
});

const updateBanner = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { id } = req.params;

  const title = req.body?.title;
  const placement = req.body?.placement;
  const order = req.body?.order;
  const isActive = req.body?.isActive;

  let imageUrl;
  const file = (req.files || [])[0];
  if (file) {
    const uploadResult = await uploadImageBuffer(file.buffer, {
      folder: 'banners',
    });
    imageUrl = uploadResult?.url;
  }

  const doc = await bannerService.updateBanner(id, {
    title,
    placement,
    order,
    isActive: isActive === undefined ? undefined : isActive === 'false' ? false : !!isActive,
    imageUrl,
    userId,
  });

  res.json(toBannerDto(doc));
});

const deleteBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = await bannerService.deleteBanner(id);
  res.json(data);
});

module.exports = {
  uploadBannerImages,
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
};
