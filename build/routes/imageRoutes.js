import express from 'express';
import rateLimit from 'express-rate-limit';
import { upload, handleImageUpload } from '../controllers/imageController.js';

const router = express.Router();

// Create rate limiter for image uploads using express-rate-limit
// More restrictive than general API: 10 uploads per minute
const imageUploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many image upload attempts from this IP, please try again after a minute',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the 10 image uploads per minute limit. Please try again later.',
      retryAfter: 60,
    });
  },
});

// Define the route for uploading an image
// POST /api/images
// The `upload.single('image')` middleware handles the file upload.
// 'image' should match the field name in the form-data request.
// Added rate limiting to prevent abuse of file system operations
router.post('/', imageUploadRateLimiter, upload.single('image'), handleImageUpload);

// Add other image-related routes here later if needed

export default router;
