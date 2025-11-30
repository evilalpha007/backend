const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload file buffer to Cloudinary
 * @param {Buffer} fileBuffer - File buffer from multer memory storage
 * @param {string} folder - Cloudinary folder name (e.g., 'avatars', 'daily', 'quests')
 * @param {string} resourceType - 'image' or 'video'
 * @returns {Promise<string>} - Cloudinary URL of uploaded file
 */
async function uploadToCloudinary(fileBuffer, folder, resourceType = 'auto') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `fitness-league/${folder}`,
        resource_type: resourceType,
        transformation: resourceType === 'image' ? [
          { width: 1000, crop: 'limit' },
          { quality: 'auto:good' }
        ] : undefined
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );
    
    uploadStream.end(fileBuffer);
  });
}

module.exports = {
  cloudinary,
  uploadToCloudinary
};
