/**
 * routes/public/posts.js
 * Public endpoints to read community posts for customer pages.
 */

const express = require('express');
const mongoose = require('mongoose');

const asyncHandler = require('../../middlewares/asyncHandler');
const { Post } = require('../../models');

const router = express.Router();

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePaging(query) {
  const rawPage = Number(query?.page);
  const rawLimit = Number(query?.limit);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 12;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function toOwnerName(ownerDoc, ownerModel) {
  const name = String(ownerDoc?.name || ownerDoc?.username || '').trim();
  if (name) return name;
  return ownerModel === 'AdminAccount' ? 'SanSieuToc Team' : 'Community Member';
}

function toExcerpt(content, maxLength = 140) {
  const text = String(content || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function toPostTag(ownerModel) {
  return ownerModel === 'AdminAccount' ? 'Announcement' : 'Community';
}

function toPostDto(doc) {
  const ownerDoc = doc?.postOwnerID && typeof doc.postOwnerID === 'object' ? doc.postOwnerID : null;
  const images = Array.isArray(doc?.postImage) ? doc.postImage.filter(Boolean) : [];

  return {
    id: String(doc?._id || ''),
    postOwnerModel: doc?.postOwnerModel || '',
    postOwnerID: ownerDoc?._id ? String(ownerDoc._id) : String(doc?.postOwnerID || ''),
    postName: doc?.postName || '',
    postContent: doc?.postContent || '',
    postImage: images,
    status: doc?.status || '',
    createdAt: doc?.createdAt,
    updatedAt: doc?.updatedAt,

    // FE-friendly aliases for community cards/detail page.
    title: doc?.postName || '',
    content: doc?.postContent || '',
    excerpt: toExcerpt(doc?.postContent),
    image: images[0] || '',
    imageAlt: 'Post image',
    tag: toPostTag(doc?.postOwnerModel),
    author: toOwnerName(ownerDoc, doc?.postOwnerModel),
    authorImage: ownerDoc?.image || '',
  };
}

// GET /api/public/posts?page=1&limit=12&q=...
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query);

    const filter = { status: 'Posted' };

    const q = String(req.query?.q || '').trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ postName: rx }, { postContent: rx }];
    }

    const ownerModel = String(req.query?.ownerModel || '').trim();
    if (ownerModel && ['UserAccount', 'AdminAccount'].includes(ownerModel)) {
      filter.postOwnerModel = ownerModel;
    }

    const ownerId = String(req.query?.ownerId || '').trim();
    if (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) {
      filter.postOwnerID = ownerId;
    }

    const [items, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'postOwnerID', select: 'name username image' })
        .lean(),
      Post.countDocuments(filter),
    ]);

    res.status(200).json({
      items: items.map(toPostDto),
      pagination: { page, limit, total },
    });
  })
);

// GET /api/public/posts/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid post id.' });
    }

    const doc = await Post.findOne({ _id: id, status: 'Posted' })
      .populate({ path: 'postOwnerID', select: 'name username image' })
      .lean();

    if (!doc) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    return res.status(200).json({ item: toPostDto(doc) });
  })
);

module.exports = router;
