import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os"; // Import the os module
import { uploadImage as uploadGhostImage } from "../services/ghostService.js"; // Assuming uploadImage is in ghostService
import { processImage } from "../services/imageProcessingService.js"; // Import the processing service

// --- Use OS temporary directory for uploads ---
const uploadDir = os.tmpdir(); // Use the OS default temp directory
// We generally don't need to create os.tmpdir(), it should exist
// if (!fs.existsSync(uploadDir)){
//     fs.mkdirSync(uploadDir);
// }

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Keep original extension, use timestamp for uniqueness
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Use a prefix to easily identify our temp files if needed
    cb(null, "mcp-upload-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// Filter for image files (optional but recommended)
const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Not an image! Please upload only images."), false);
  }
};

const upload = multer({ storage: storage, fileFilter: imageFileFilter });

/**
 * Extracts a base filename without extension or unique identifiers.
 * Example: 'mcp-upload-1678886400000-123456789.jpg' -> 'image' (if original was image.jpg)
 * Note: This might be simplified depending on how original filename is best accessed.
 * Multer's `file.originalname` is the best source.
 */
const getDefaultAltText = (filePath) => {
  try {
    const originalFilename = path
      .basename(filePath)
      .split(".")
      .slice(0, -1)
      .join(".");
    // Attempt to remove common prefixes/suffixes added during upload/processing
    // This is a basic heuristic and might need adjustment
    const nameWithoutIds = originalFilename.replace(
      /^(processed-|mcp-upload-)\d+-\d+-?/,
      ""
    );
    return nameWithoutIds.replace(/[-_]/g, " ") || "Uploaded image"; // Replace separators, provide default
  } catch (e) {
    return "Uploaded image"; // Fallback
  }
};

/**
 * Controller to handle image uploads.
 * Processes the image and includes alt text in the response.
 */
const handleImageUpload = async (req, res, next) => {
  let originalPath = null;
  let processedPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file uploaded." });
    }
    originalPath = req.file.path;
    console.log(`Image received (temp): ${originalPath}`);

    // Process Image (output directory is still the temp dir)
    processedPath = await processImage(originalPath, uploadDir);

    // --- Handle Alt Text ---
    // Get alt text from the request body (sent as a form field)
    const providedAlt = req.body.alt;
    // Generate a default alt text from the original filename if none provided
    const defaultAlt = getDefaultAltText(req.file.originalname);
    const altText = providedAlt || defaultAlt;
    console.log(`Using alt text: "${altText}"`);
    // --- End Alt Text Handling ---

    // Call ghostService to upload the processed image
    const uploadResult = await uploadGhostImage(processedPath);
    console.log("Processed image uploaded to Ghost:", uploadResult.url);

    // Respond with the URL and the determined alt text
    res.status(200).json({ url: uploadResult.url, alt: altText });
  } catch (error) {
    console.error("Error in handleImageUpload controller:", error.message);
    // If it's a multer error (e.g., file filter), it might need specific handling
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: error.message });
    }
    // Pass other errors to the global handler
    next(error);
  } finally {
    // Cleanup: Delete temporary files
    if (originalPath) {
      fs.unlink(originalPath, (err) => {
        if (err)
          console.error(
            "Error deleting original temp file:",
            originalPath,
            err
          );
      });
    }
    if (processedPath && processedPath !== originalPath) {
      // Don't delete if processing failed/skipped
      fs.unlink(processedPath, (err) => {
        if (err)
          console.error(
            "Error deleting processed temp file:",
            processedPath,
            err
          );
      });
    }
  }
};

export { upload, handleImageUpload }; // Export upload middleware and controller
