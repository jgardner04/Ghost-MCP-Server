import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os'; // Import the os module
import Joi from 'joi';
import crypto from 'crypto';
import { createContextLogger } from '../utils/logger.js';
import { uploadImage as uploadGhostImage } from '../services/ghostService.js'; // Assuming uploadImage is in ghostService
import { processImage } from '../services/imageProcessingService.js'; // Import the processing service

// --- Use OS temporary directory for uploads ---
const uploadDir = os.tmpdir(); // Use the OS default temp directory
// We generally don't need to create os.tmpdir(), it should exist
// if (!fs.existsSync(uploadDir)){
//     fs.mkdirSync(uploadDir);
// }

// Validation schema for uploaded files (excluding size - validated by multer limits)
const fileValidationSchema = Joi.object({
  originalname: Joi.string().max(255).required(),
  mimetype: Joi.string()
    .pattern(/^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/i)
    .required(),
});

// Post-upload validation schema (when file.size is available)
const uploadedFileValidationSchema = Joi.object({
  originalname: Joi.string().max(255).required(),
  mimetype: Joi.string()
    .pattern(/^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/i)
    .required(),
  size: Joi.number()
    .max(10 * 1024 * 1024)
    .required(), // 10MB max
  path: Joi.string().required(),
});

// Safe filename generation
const generateSafeFilename = (originalName) => {
  const ext = path.extname(originalName);
  // Validate extension against whitelist
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const normalizedExt = ext.toLowerCase();

  if (!allowedExtensions.includes(normalizedExt)) {
    throw new Error('Invalid file extension');
  }

  // Generate cryptographically secure random filename
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `mcp-upload-${timestamp}-${randomBytes}${normalizedExt}`;
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure we're using the temp directory, no user input for path
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    try {
      // Generate safe filename that prevents path traversal
      const safeFilename = generateSafeFilename(file.originalname);
      cb(null, safeFilename);
    } catch (error) {
      cb(error);
    }
  },
});

// Enhanced filter for image files with validation
const imageFileFilter = (req, file, cb) => {
  // Validate file properties (excluding size - not available at this stage)
  const validation = fileValidationSchema.validate({
    originalname: file.originalname,
    mimetype: file.mimetype,
  });

  if (validation.error) {
    return cb(new Error(`File validation failed: ${validation.error.details[0].message}`), false);
  }

  // Additional security checks
  const filename = file.originalname;

  // Check for path traversal attempts
  if (filename.includes('../') || filename.includes('..\\') || path.isAbsolute(filename)) {
    return cb(new Error('Invalid filename: Path traversal detected'), false);
  }

  // Check for null bytes
  if (filename.includes('\0')) {
    return cb(new Error('Invalid filename: Null byte detected'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1, // Only allow 1 file per request
  },
});

/**
 * Extracts a base filename without extension or unique identifiers.
 * Example: 'mcp-upload-1678886400000-123456789.jpg' -> 'image' (if original was image.jpg)
 * Note: This might be simplified depending on how original filename is best accessed.
 * Multer's `file.originalname` is the best source.
 */
const getDefaultAltText = (originalName) => {
  try {
    // Use the original filename directly instead of a file path to avoid path traversal
    // Validate the input is a string and not a path
    if (!originalName || typeof originalName !== 'string') {
      return 'Uploaded image';
    }

    // Ensure no path separators are present (defense in depth)
    const sanitizedName = originalName.replace(/[/\\:]/g, '');

    const originalFilename = sanitizedName.split('.').slice(0, -1).join('.');

    // Attempt to remove common prefixes/suffixes added during upload/processing
    const nameWithoutIds = originalFilename.replace(/^(processed-|mcp-upload-)\d+-\d+-?/, '');
    return nameWithoutIds.replace(/[-_]/g, ' ') || 'Uploaded image';
  } catch (e) {
    return 'Uploaded image'; // Fallback
  }
};

/**
 * Controller to handle image uploads.
 * Processes the image and includes alt text in the response.
 */
const handleImageUpload = async (req, res, next) => {
  const logger = createContextLogger('image-controller');
  let originalPath = null;
  let processedPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded.' });
    }

    // Post-upload validation with complete file information
    const fileValidation = uploadedFileValidationSchema.validate({
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
    });

    if (fileValidation.error) {
      // Delete the uploaded file since validation failed
      // Validate file path is within upload directory before deletion
      const filePath = req.file.path;
      const resolvedFilePath = path.resolve(filePath);
      const resolvedUploadDir = path.resolve(uploadDir);

      if (resolvedFilePath.startsWith(resolvedUploadDir)) {
        fs.unlink(filePath, () => {});
      }

      return res.status(400).json({
        message: `File validation failed: ${fileValidation.error.details[0].message}`,
      });
    }

    // Validate the file path is within our temp directory (defense in depth)
    originalPath = req.file.path;
    const resolvedPath = path.resolve(originalPath);
    const resolvedUploadDir = path.resolve(uploadDir);

    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      logger.error('Security violation: File path outside upload directory', {
        filePath: path.basename(originalPath),
        uploadDir: path.basename(uploadDir),
      });
      throw new Error('Security violation: File path outside of upload directory');
    }

    logger.info('Image received for processing', {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      tempFile: path.basename(originalPath),
    });

    // Process Image (output directory is still the temp dir)
    processedPath = await processImage(originalPath, uploadDir);

    // --- Handle Alt Text ---
    // Validate and sanitize alt text from the request body
    const altSchema = Joi.string().max(500).allow('').optional();
    const { error, value: sanitizedAlt } = altSchema.validate(req.body.alt);

    if (error) {
      return res.status(400).json({ message: `Invalid alt text: ${error.details[0].message}` });
    }

    const providedAlt = sanitizedAlt;
    // Generate a default alt text from the original filename if none provided
    const defaultAlt = getDefaultAltText(req.file.originalname);
    const altText = providedAlt || defaultAlt;
    logger.debug('Alt text determined', {
      provided: !!providedAlt,
      generated: !providedAlt,
      altText,
    });
    // --- End Alt Text Handling ---

    // Call ghostService to upload the processed image
    const uploadResult = await uploadGhostImage(processedPath);
    logger.info('Image uploaded to Ghost successfully', {
      ghostUrl: uploadResult.url,
      processedFile: path.basename(processedPath),
    });

    // Respond with the URL and the determined alt text
    res.status(200).json({ url: uploadResult.url, alt: altText });
  } catch (error) {
    logger.error('Image upload controller error', {
      error: error.message,
      stack: error.stack,
      originalFile: originalPath ? path.basename(originalPath) : null,
      processedFile: processedPath ? path.basename(processedPath) : null,
    });
    // If it's a multer error (e.g., file filter), it might need specific handling
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: error.message });
    }
    // Pass other errors to the global handler
    next(error);
  } finally {
    // Cleanup: Delete temporary files with path validation
    if (originalPath) {
      const resolvedOriginalPath = path.resolve(originalPath);
      const resolvedUploadDir = path.resolve(uploadDir);

      if (resolvedOriginalPath.startsWith(resolvedUploadDir)) {
        fs.unlink(originalPath, (err) => {
          if (err)
            logger.warn('Failed to delete original temp file', {
              file: path.basename(originalPath),
              error: err.message,
            });
        });
      }
    }
    if (processedPath && processedPath !== originalPath) {
      const resolvedProcessedPath = path.resolve(processedPath);
      const resolvedUploadDir = path.resolve(uploadDir);

      if (resolvedProcessedPath.startsWith(resolvedUploadDir)) {
        fs.unlink(processedPath, (err) => {
          if (err)
            logger.warn('Failed to delete processed temp file', {
              file: path.basename(processedPath),
              error: err.message,
            });
        });
      }
    }
  }
};

export { upload, handleImageUpload }; // Export upload middleware and controller
