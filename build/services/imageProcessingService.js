import sharp from "sharp";
import path from "path";
import fs from "fs";

// Define processing parameters (e.g., max width)
const MAX_WIDTH = 1200;
const OUTPUT_QUALITY = 80; // JPEG quality

/**
 * Processes an image: resizes if too large, ensures JPEG format (configurable).
 * @param {string} inputPath - Path to the original uploaded image.
 * @param {string} outputDir - Directory to save the processed image.
 * @returns {Promise<string>} Path to the processed image.
 */
const processImage = async (inputPath, outputDir) => {
  const filename = path.basename(inputPath);
  const outputFilename = `processed-${filename
    .split(".")
    .slice(0, -1)
    .join(".")}.jpg`; // Force JPEG output
  const outputPath = path.join(outputDir, outputFilename);

  try {
    console.log(`Processing image: ${inputPath}`);
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    let processedImage = image;

    // Resize if wider than MAX_WIDTH
    if (metadata.width && metadata.width > MAX_WIDTH) {
      console.log(`Resizing image from ${metadata.width}px wide.`);
      processedImage = processedImage.resize({ width: MAX_WIDTH });
    }

    // Convert to JPEG with specified quality
    // You could add options for PNG/WebP etc. if needed
    await processedImage.jpeg({ quality: OUTPUT_QUALITY }).toFile(outputPath);

    console.log(`Processed image saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`Error processing image ${inputPath}:`, error);
    // If processing fails, maybe fall back to using the original?
    // Or throw the error to fail the upload.
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

export { processImage };
