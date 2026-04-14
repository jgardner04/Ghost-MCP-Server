import { GhostAPIError, ValidationError } from '../errors/index.js';
import { handleApiRequest } from './ghostApiClient.js';
import { validators } from './validators.js';

const ALLOWED_PURPOSES = new Set(['image', 'profile_image', 'icon']);
const REF_MAX_LENGTH = 200;

/**
 * Uploads an image to Ghost CMS from a local file path.
 *
 * @param {string} imagePath - Absolute path to the image file.
 * @param {object} [opts]
 * @param {'image'|'profile_image'|'icon'} [opts.purpose] - Intended use.
 *   Ghost applies format/size validation per purpose (icon/profile_image
 *   must be square; icon also accepts ICO).
 * @param {string} [opts.ref] - Caller-supplied identifier (e.g. original
 *   filename). Ghost echoes it back in the response. Max 200 chars.
 * @returns {Promise<Object>} The uploaded image object with URL (and ref,
 *   if provided and the SDK forwards it).
 * @throws {ValidationError} If inputs are invalid or upload fails.
 * @throws {NotFoundError} If the file does not exist.
 * @throws {GhostAPIError} If the API request fails.
 */
export async function uploadImage(imagePath, opts = {}) {
  await validators.validateImagePath(imagePath);

  const { purpose, ref } = opts;
  if (purpose !== undefined && !ALLOWED_PURPOSES.has(purpose)) {
    throw new ValidationError(
      `Invalid purpose "${purpose}". Must be one of: ${[...ALLOWED_PURPOSES].join(', ')}`
    );
  }
  if (ref !== undefined) {
    if (typeof ref !== 'string') {
      throw new ValidationError('ref must be a string');
    }
    if (ref.length > REF_MAX_LENGTH) {
      throw new ValidationError(`ref cannot exceed ${REF_MAX_LENGTH} characters`);
    }
  }

  const imageData = { file: imagePath };
  if (purpose !== undefined) imageData.purpose = purpose;
  if (ref !== undefined) imageData.ref = ref;

  try {
    return await handleApiRequest('images', 'upload', imageData);
  } catch (error) {
    if (error instanceof GhostAPIError) {
      throw new ValidationError(`Image upload failed: ${error.originalError}`);
    }
    throw error;
  }
}
