import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { z } from 'zod';
import { createContextLogger } from '../utils/logger.js';

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 80;

// Formats we re-encode via sharp when the image is oversized.
// Everything else is passed through untouched to preserve fidelity
// (SVG vectors, GIF animation, ICO, exotic formats).
const RESIZABLE_FORMATS = new Set(['jpeg', 'png', 'webp']);

const EXT_BY_FORMAT = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
  svg: '.svg',
  // ICO has no sharp `format` name; detected by extension.
};

const processImageParamsSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1),
});

const processImageOptsSchema = z
  .object({
    purpose: z.enum(['image', 'profile_image', 'icon']).optional(),
  })
  .optional();

/**
 * Process an image for upload to Ghost.
 *
 * Preserves the original format. Resizes (preserving format) only for
 * raster formats sharp can safely re-encode — JPEG, PNG, WEBP — when
 * wider than MAX_WIDTH. SVG, GIF, ICO, and unrecognized formats are
 * copied byte-for-byte so vectors, animation frames, and icon metadata
 * survive the round trip.
 *
 * @param {string} inputPath - Absolute path to the source image.
 * @param {string} outputDir - Directory to write the processed file into.
 * @param {{ purpose?: 'image'|'profile_image'|'icon' }} [opts]
 * @returns {Promise<string>} Absolute path to the processed (or copied) file.
 */
export async function processImage(inputPath, outputDir, opts = {}) {
  const logger = createContextLogger('image-processing');

  const params = processImageParamsSchema.safeParse({ inputPath, outputDir });
  if (!params.success) {
    throw new Error('Invalid processing parameters');
  }
  processImageOptsSchema.parse(opts);

  const resolvedInput = path.resolve(inputPath);
  const resolvedOutputDir = path.resolve(outputDir);

  if (!fs.existsSync(resolvedInput)) {
    throw new Error('Input file does not exist');
  }

  const inputExt = path.extname(resolvedInput).toLowerCase();
  const baseName = path.basename(resolvedInput, path.extname(resolvedInput));
  const timestamp = Date.now();

  try {
    // Non-raster passthrough: SVG and ICO are never handed to sharp.
    // (sharp can read SVG but would rasterize it, destroying the vector.)
    if (inputExt === '.svg' || inputExt === '.ico') {
      return await passthrough(resolvedInput, resolvedOutputDir, baseName, timestamp, inputExt);
    }

    const image = sharp(resolvedInput);
    const metadata = await image.metadata();
    const format = metadata.format; // 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | ...

    // GIF: never re-encode — sharp would drop animation frames.
    // SVG (if it slipped through by extension mismatch): also passthrough.
    if (format === 'gif' || format === 'svg') {
      const ext = EXT_BY_FORMAT[format] || inputExt || '';
      return await passthrough(resolvedInput, resolvedOutputDir, baseName, timestamp, ext);
    }

    // Unknown / unsupported format: safest is passthrough.
    if (!RESIZABLE_FORMATS.has(format)) {
      logger.info('Unknown format, passing through', {
        format,
        inputFile: path.basename(inputPath),
      });
      return await passthrough(resolvedInput, resolvedOutputDir, baseName, timestamp, inputExt);
    }

    const ext = EXT_BY_FORMAT[format];
    const outputPath = path.join(resolvedOutputDir, `processed-${timestamp}-${baseName}${ext}`);

    // Passthrough when no resize is needed — avoids generation loss.
    if (!metadata.width || metadata.width <= MAX_WIDTH) {
      await fsp.copyFile(resolvedInput, outputPath);
      logger.info('Image within size limits, passthrough copy', {
        format,
        width: metadata.width,
        inputFile: path.basename(inputPath),
      });
      return outputPath;
    }

    logger.info('Resizing image', {
      format,
      originalWidth: metadata.width,
      targetWidth: MAX_WIDTH,
      inputFile: path.basename(inputPath),
    });

    let pipeline = image.resize({ width: MAX_WIDTH });
    if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: JPEG_QUALITY });
    else if (format === 'png') pipeline = pipeline.png();
    else if (format === 'webp') pipeline = pipeline.webp();

    await pipeline.toFile(outputPath);
    return outputPath;
  } catch (error) {
    logger.error('Image processing failed', {
      inputFile: path.basename(inputPath),
      error: error.message,
    });
    throw new Error('Image processing failed: ' + error.message, { cause: error });
  }
}

async function passthrough(inputPath, outputDir, baseName, timestamp, ext) {
  const outputPath = path.join(outputDir, `processed-${timestamp}-${baseName}${ext}`);
  await fsp.copyFile(inputPath, outputPath);
  return outputPath;
}
