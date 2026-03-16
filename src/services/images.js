import { GhostAPIError, ValidationError } from '../errors/index.js';
import { handleApiRequest } from './ghostApiClient.js';
import { validators } from './validators.js';

/**
 * Uploads an image to Ghost CMS from a local file path.
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<Object>} The uploaded image object with URL
 * @throws {ValidationError} If the path is invalid or upload fails
 * @throws {NotFoundError} If the file does not exist
 * @throws {GhostAPIError} If the API request fails
 */
export async function uploadImage(imagePath) {
  // Validate input
  await validators.validateImagePath(imagePath);

  const imageData = { file: imagePath };

  try {
    return await handleApiRequest('images', 'upload', imageData);
  } catch (error) {
    if (error instanceof GhostAPIError) {
      throw new ValidationError(`Image upload failed: ${error.originalError}`);
    }
    throw error;
  }
}
