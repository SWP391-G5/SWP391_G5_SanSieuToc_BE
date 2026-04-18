/**
 * deleteImageByUrl.js
 * Deletes a Cloudinary image by parsing public_id from a Cloudinary URL.
 */

const cloudinary = require('./cloudinaryClient');

/**
 * extractPublicIdFromCloudinaryUrl
 * Extracts public_id from Cloudinary URL of format:
 * https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{ext}
 *
 * @param {string} imageUrl - Cloudinary secure URL
 * @returns {string|null} public_id if parsable
 */
function extractPublicIdFromCloudinaryUrl(imageUrl) {
  if (typeof imageUrl !== 'string') return null;
  if (!imageUrl.includes('cloudinary.com')) return null;

  const parts = imageUrl.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;

  // After /upload, the next segment is usually a version (v123). Skip it.
  const afterUpload = parts.slice(uploadIndex + 1);
  if (afterUpload.length < 2) return null;

  const maybeVersion = afterUpload[1];
  const publicPathParts = afterUpload.slice(2);
  if (!/^v\d+$/.test(maybeVersion)) {
    // Some URLs can omit version - fallback to taking from afterUpload[1]
    publicPathParts.unshift(maybeVersion);
  }

  const publicIdWithExt = publicPathParts.join('/');
  const dotIndex = publicIdWithExt.lastIndexOf('.');
  if (dotIndex <= 0) return null;

  return publicIdWithExt.slice(0, dotIndex);
}

/**
 * deleteImageByUrl
 * Deletes an image if it looks like a Cloudinary URL.
 *
 * @param {string} imageUrl - Cloudinary secure URL
 * @returns {Promise<boolean>} true if deleted, false if skipped
 */
async function deleteImageByUrl(imageUrl) {
  try {
    const publicId = extractPublicIdFromCloudinaryUrl(imageUrl);
    if (!publicId) return false;

    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (error) {
    // Do not throw: deleting is best-effort
    console.error('[cloudinary.deleteImageByUrl] Failed:', error.message);
    return false;
  }
}

module.exports = {
  deleteImageByUrl,
  extractPublicIdFromCloudinaryUrl,
};
