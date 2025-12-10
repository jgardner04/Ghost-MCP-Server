import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import Joi from 'joi';
import { createContextLogger } from '../utils/logger.js';

// Define processing parameters (e.g., max width)
const MAX_WIDTH = 1200;
const OUTPUT_QUALITY = 80; // JPEG quality

/**
 * Processes an image: resizes if too large, ensures JPEG format (configurable).
 * @param {string} inputPath - Path to the original uploaded image.
 * @param {string} outputDir - Directory to save the processed image.
 * @returns {Promise<string>} Path to the processed image.
 */
// Validation schema for processing parameters
const processImageSchema = Joi.object({
  inputPath: Joi.string().required(),
  outputDir: Joi.string().required(),
});

const processImage = async (inputPath, outputDir) => {
  const logger = createContextLogger('image-processing');

  // Validate inputs to prevent path injection
  const { error } = processImageSchema.validate({ inputPath, outputDir });
  if (error) {
    logger.error('Invalid processing parameters', {
      error: error.details[0].message,
      inputPath: inputPath ? path.basename(inputPath) : 'undefined',
      outputDir: outputDir ? path.basename(outputDir) : 'undefined',
    });
    throw new Error('Invalid processing parameters');
  }

  // Ensure paths are safe
  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputDir = path.resolve(outputDir);

  // Verify input file exists
  if (!fs.existsSync(resolvedInputPath)) {
    throw new Error('Input file does not exist');
  }

  const filename = path.basename(resolvedInputPath);
  const nameWithoutExt = filename.split('.').slice(0, -1).join('.');
  // Use timestamp for unique output filename
  const timestamp = Date.now();
  const outputFilename = `processed-${timestamp}-${nameWithoutExt}.jpg`;
  const outputPath = path.join(resolvedOutputDir, outputFilename);

  try {
    logger.info('Processing image', {
      inputFile: path.basename(inputPath),
      outputDir: path.basename(outputDir),
    });
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    let processedImage = image;

    // Resize if wider than MAX_WIDTH
    if (metadata.width && metadata.width > MAX_WIDTH) {
      logger.info('Resizing image', {
        originalWidth: metadata.width,
        targetWidth: MAX_WIDTH,
        inputFile: path.basename(inputPath),
      });
      processedImage = processedImage.resize({ width: MAX_WIDTH });
    }

    // Convert to JPEG with specified quality
    // You could add options for PNG/WebP etc. if needed
    await processedImage.jpeg({ quality: OUTPUT_QUALITY }).toFile(outputPath);

    logger.info('Image processing completed', {
      inputFile: path.basename(inputPath),
      outputFile: path.basename(outputPath),
      originalSize: metadata.size,
      quality: OUTPUT_QUALITY,
    });
    return outputPath;
  } catch (error) {
    logger.error('Image processing failed', {
      inputFile: path.basename(inputPath),
      error: error.message,
      stack: error.stack,
    });
    // If processing fails, maybe fall back to using the original?
    // Or throw the error to fail the upload.
    throw new Error('Image processing failed: ' + error.message);
  }
};

export { processImage };
