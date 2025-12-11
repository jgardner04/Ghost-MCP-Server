import sanitizeHtml from 'sanitize-html';
import Joi from 'joi';
import { createContextLogger } from '../utils/logger.js';
import { createPage as createGhostPage } from './ghostServiceImproved.js';

/**
 * Helper to generate a simple meta description from HTML content.
 * Uses sanitize-html to safely strip HTML tags and truncates.
 * @param {string} htmlContent - The HTML content of the page.
 * @param {number} maxLength - The maximum length of the description.
 * @returns {string} A plain text truncated description.
 */
const generateSimpleMetaDescription = (htmlContent, maxLength = 500) => {
  if (!htmlContent) return '';

  // Use sanitize-html to safely remove all HTML tags
  // This prevents ReDoS attacks and properly handles malformed HTML
  const textContent = sanitizeHtml(htmlContent, {
    allowedTags: [], // Remove all HTML tags
    allowedAttributes: {},
    textFilter: function (text) {
      return text.replace(/\s\s+/g, ' ').trim();
    },
  });

  // Truncate and add ellipsis if needed
  return textContent.length > maxLength
    ? textContent.substring(0, maxLength - 3) + '...'
    : textContent;
};

/**
 * Validation schema for page input
 * Pages are similar to posts but do NOT support tags
 */
const pageInputSchema = Joi.object({
  title: Joi.string().max(255).required(),
  html: Joi.string().required(),
  custom_excerpt: Joi.string().max(500).optional(),
  status: Joi.string().valid('draft', 'published', 'scheduled').optional(),
  published_at: Joi.string().isoDate().optional(),
  // NO tags field - pages don't support tags
  feature_image: Joi.string().uri().optional(),
  feature_image_alt: Joi.string().max(255).optional(),
  feature_image_caption: Joi.string().max(500).optional(),
  meta_title: Joi.string().max(70).optional(),
  meta_description: Joi.string().max(160).optional(),
});

/**
 * Service layer function to handle the business logic of creating a page.
 * Transforms input data, generates metadata defaults.
 * Note: Pages do NOT support tags (unlike posts).
 * @param {object} pageInput - Data received from the controller.
 * @returns {Promise<object>} The created page object from the Ghost API.
 */
const createPageService = async (pageInput) => {
  const logger = createContextLogger('page-service');

  // Validate input to prevent format string vulnerabilities
  const { error, value: validatedInput } = pageInputSchema.validate(pageInput);
  if (error) {
    logger.error('Page input validation failed', {
      error: error.details[0].message,
      inputKeys: Object.keys(pageInput),
    });
    throw new Error(`Invalid page input: ${error.details[0].message}`);
  }

  const {
    title,
    html,
    custom_excerpt,
    status,
    published_at,
    // NO tags destructuring - pages don't support tags
    feature_image,
    feature_image_alt,
    feature_image_caption,
    meta_title,
    meta_description,
  } = validatedInput;

  // NO tag resolution section (removed from postService)
  // Pages do not support tags in Ghost CMS

  // Metadata defaults
  const finalMetaTitle = meta_title || title;
  const finalMetaDescription =
    meta_description || custom_excerpt || generateSimpleMetaDescription(html);
  const truncatedMetaDescription =
    finalMetaDescription.length > 500
      ? finalMetaDescription.substring(0, 497) + '...'
      : finalMetaDescription;

  // Prepare data for Ghost API
  const pageDataForApi = {
    title,
    html,
    custom_excerpt,
    status: status || 'draft',
    published_at,
    // NO tags field
    feature_image,
    feature_image_alt,
    feature_image_caption,
    meta_title: finalMetaTitle,
    meta_description: truncatedMetaDescription,
  };

  logger.info('Creating Ghost page', {
    title: pageDataForApi.title,
    status: pageDataForApi.status,
    hasFeatureImage: !!pageDataForApi.feature_image,
  });

  const newPage = await createGhostPage(pageDataForApi);
  return newPage;
};

export { createPageService };
