import Joi from 'joi';
import { createContextLogger } from '../utils/logger.js';
import { createNewsletter as createGhostNewsletter } from './ghostServiceImproved.js';

/**
 * Validation schema for newsletter input
 */
const newsletterInputSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().optional(),
  sender_name: Joi.string().optional(),
  sender_email: Joi.string().email().optional(),
  sender_reply_to: Joi.string().valid('newsletter', 'support').optional(),
  subscribe_on_signup: Joi.boolean().strict().optional(),
  show_header_icon: Joi.boolean().strict().optional(),
  show_header_title: Joi.boolean().strict().optional(),
});

/**
 * Service layer function to handle the business logic of creating a newsletter.
 * Validates input and creates a newsletter in Ghost CMS.
 * @param {object} newsletterInput - Data received from the controller.
 * @returns {Promise<object>} The created newsletter object from the Ghost API.
 */
const createNewsletterService = async (newsletterInput) => {
  const logger = createContextLogger('newsletter-service');

  // Validate input
  const { error, value: validatedInput } = newsletterInputSchema.validate(newsletterInput);
  if (error) {
    logger.error('Newsletter input validation failed', {
      error: error.details[0].message,
      inputKeys: Object.keys(newsletterInput),
    });
    throw new Error(`Invalid newsletter input: ${error.details[0].message}`);
  }

  logger.info('Creating Ghost newsletter', {
    name: validatedInput.name,
    hasSenderEmail: !!validatedInput.sender_email,
  });

  const newNewsletter = await createGhostNewsletter(validatedInput);
  return newNewsletter;
};

export { createNewsletterService };
