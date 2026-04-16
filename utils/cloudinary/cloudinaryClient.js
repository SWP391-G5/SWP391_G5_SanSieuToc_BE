/**
 * cloudinaryClient.js
 * Cloudinary SDK initialization for server-side uploads.
 */

const cloudinary = require('cloudinary').v2;

/**
 * configureCloudinary
 * Configures Cloudinary from environment variables.
 *
 * @returns {void}
 */
function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

configureCloudinary();

module.exports = cloudinary;
