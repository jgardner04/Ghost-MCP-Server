import express from "express";
import { upload, handleImageUpload } from "../controllers/imageController.js";
import { RateLimiter } from "../middleware/errorMiddleware.js";

const router = express.Router();

// Create rate limiter for image uploads
// More restrictive than general API: 10 uploads per minute
const imageUploadRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10  // max 10 image uploads per minute per IP
});

// Define the route for uploading an image
// POST /api/images
// The `upload.single('image')` middleware handles the file upload.
// 'image' should match the field name in the form-data request.
// Added rate limiting to prevent abuse of file system operations
router.post("/", imageUploadRateLimiter.middleware(), upload.single("image"), handleImageUpload);

// Add other image-related routes here later if needed

export default router;
