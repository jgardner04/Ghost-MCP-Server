import Joi from 'joi';
import { createTier } from './ghostServiceImproved.js';
import { createContextLogger } from '../utils/logger.js';

const logger = createContextLogger('tierService');

/**
 * Joi schema for tier creation input validation
 */
const tierSchema = Joi.object({
  name: Joi.string().required().messages({
    'any.required': '"name" is required',
    'string.empty': '"name" is required',
  }),
  description: Joi.string().optional().allow(''),
  monthly_price: Joi.number().min(0).optional().messages({
    'number.base': '"monthly_price" must be a number',
    'number.min': '"monthly_price" must be non-negative',
  }),
  yearly_price: Joi.number().min(0).optional().messages({
    'number.base': '"yearly_price" must be a number',
    'number.min': '"yearly_price" must be non-negative',
  }),
  currency: Joi.string().optional().messages({
    'string.base': '"currency" must be a string',
  }),
  benefits: Joi.array().items(Joi.string()).optional().messages({
    'array.base': '"benefits" must be an array',
    'array.includes': '"benefits" must contain only strings',
  }),
  welcome_page_url: Joi.string().uri().optional().messages({
    'string.uri': '"welcome_page_url" must be a valid URL',
  }),
});

/**
 * Creates a new tier with validation
 * @param {Object} tierData - The tier data
 * @param {string} tierData.name - Tier name (required)
 * @param {string} [tierData.description] - Tier description
 * @param {number} [tierData.monthly_price] - Monthly price in cents
 * @param {number} [tierData.yearly_price] - Yearly price in cents
 * @param {string} [tierData.currency] - Currency code (e.g., "USD")
 * @param {string[]} [tierData.benefits] - Array of benefit strings
 * @param {string} [tierData.welcome_page_url] - Welcome page URL
 * @returns {Promise<Object>} The created tier
 * @throws {Error} If validation fails or tier creation fails
 */
export async function createTierService(tierData) {
  logger.info('Creating tier', { name: tierData.name });

  // Validate input using Joi schema
  const { error, value } = tierSchema.validate(tierData, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessage = `Invalid tier input: ${error.details.map((d) => d.message).join(', ')}`;
    logger.error('Tier validation failed', { error: errorMessage });
    throw new Error(errorMessage);
  }

  try {
    // Create the tier using ghostServiceImproved
    const createdTier = await createTier(value);
    logger.info('Tier created successfully', { tierId: createdTier.id });
    return createdTier;
  } catch (error) {
    logger.error('Failed to create tier', { error: error.message });
    throw error;
  }
}

export default {
  createTierService,
};
