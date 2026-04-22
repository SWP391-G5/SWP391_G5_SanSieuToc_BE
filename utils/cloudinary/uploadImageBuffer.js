/**
 * uploadImageBuffer.js
 * Uploads an image buffer to Cloudinary using upload_stream.
 * Useful when switching to multer memoryStorage later.
 */

const cloudinary = require('./cloudinaryClient');

const ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];

/**
 * uploadImageBuffer
 * @param {Buffer} buffer - file buffer
 * @param {object} options - upload options
 * @param {string} options.folder - Cloudinary folder
 * @returns {Promise<{url:string, publicId:string}>}
 */
function uploadImageBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const folder = String(options.folder || 'san-sieu-toc');

      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          allowed_formats: ALLOWED_IMAGE_FORMATS,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      );

      stream.end(buffer);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  uploadImageBuffer,
};
