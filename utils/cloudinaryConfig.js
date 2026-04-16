const cloudinary = require('cloudinary').v2;

let cloudinaryConfigured = false;

function ensureCloudinaryConfigured() {
  if (cloudinaryConfigured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary chưa được cấu hình. Vui lòng set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET trong BE/.env'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  cloudinaryConfigured = true;
}

/**
 * Upload image to Cloudinary from base64 string
 * @param {string} base64String - Base64 string of image (includes data:image/...)
 * @param {string} folder - Folder name on Cloudinary (e.g., 'managers', 'customers')
 * @param {string} publicId - Public ID for image (optional, auto-generate if not provided)
 * @returns {Promise<string>} - URL of image after upload
 */
const uploadImageBase64 = async (base64String, folder = 'uploads', publicId = null) => {
  try {
    ensureCloudinaryConfigured();

    // Validate base64 format
    if (!base64String || !base64String.startsWith('data:image/')) {
      throw new Error('Invalid base64 image format');
    }

    const uploadOptions = {
      folder: folder,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.overwrite = true;
    }

    const result = await cloudinary.uploader.upload(base64String, uploadOptions);
    
    return result.secure_url; // Return HTTPS URL
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload image to Cloudinary: ${error.message}`);
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} imageUrl - URL of image to delete
 * @returns {Promise<void>}
 */
const deleteImage = async (imageUrl) => {
  try {
    ensureCloudinaryConfigured();

    if (!imageUrl || !imageUrl.includes('cloudinary.com')) {
      return; // Not a Cloudinary image, skip
    }

    // Extract public_id from URL
    // Format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{format}
    const parts = imageUrl.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return;

    const publicIdWithFormat = parts.slice(uploadIndex + 2).join('/'); // Skip version
    const publicId = publicIdWithFormat.substring(0, publicIdWithFormat.lastIndexOf('.')); // Remove extension

    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    // Don't throw error because deleting image is not as critical as updating profile
  }
};

/**
 * Upload image to Cloudinary from buffer (multer memoryStorage)
 * @param {Buffer} buffer - File buffer from multer
 * @param {string} folder - Folder name on Cloudinary
 * @returns {Promise<string>} - Secure URL of uploaded image
 */
const uploadImageBuffer = (buffer, folder = 'uploads') => {
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      (error, result) => {
        if (error) reject(new Error(`Cloudinary upload failed: ${error.message}`));
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

module.exports = {
  uploadImageBase64,
  uploadImageBuffer,
  deleteImage,
  cloudinary
};
