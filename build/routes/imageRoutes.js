import express from "express";
import { upload, handleImageUpload } from "../controllers/imageController.js";

const router = express.Router();

// Define the route for uploading an image
// POST /api/images
// The `upload.single('image')` middleware handles the file upload.
// 'image' should match the field name in the form-data request.
router.post("/", upload.single("image"), handleImageUpload);

// Add other image-related routes here later if needed

export default router;
