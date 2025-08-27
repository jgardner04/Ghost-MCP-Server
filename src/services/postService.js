import sanitizeHtml from "sanitize-html";
import Joi from "joi";
import { createContextLogger } from "../utils/logger.js";
import {
  createPost as createGhostPost,
  getTags as getGhostTags,
  createTag as createGhostTag,
  // Import other necessary functions from ghostService later
} from "./ghostService.js"; // Note the relative path

/**
 * Helper to generate a simple meta description from HTML content.
 * Uses sanitize-html to safely strip HTML tags and truncates.
 * @param {string} htmlContent - The HTML content of the post.
 * @param {number} maxLength - The maximum length of the description.
 * @returns {string} A plain text truncated description.
 */
const generateSimpleMetaDescription = (htmlContent, maxLength = 500) => {
  if (!htmlContent) return "";
  
  // Use sanitize-html to safely remove all HTML tags
  // This prevents ReDoS attacks and properly handles malformed HTML
  const textContent = sanitizeHtml(htmlContent, {
    allowedTags: [], // Remove all HTML tags
    allowedAttributes: {},
    textFilter: function(text) {
      return text.replace(/\s\s+/g, ' ').trim();
    }
  });
  
  // Truncate and add ellipsis if needed
  return textContent.length > maxLength
    ? textContent.substring(0, maxLength - 3) + "..."
    : textContent;
};

/**
 * Service layer function to handle the business logic of creating a post.
 * Transforms input data, handles/resolves tags, includes feature image and metadata.
 * @param {object} postInput - Data received from the controller.
 * @returns {Promise<object>} The created post object from the Ghost API.
 */
// Validation schema for post input
const postInputSchema = Joi.object({
  title: Joi.string().max(255).required(),
  html: Joi.string().required(),
  custom_excerpt: Joi.string().max(500).optional(),
  status: Joi.string().valid('draft', 'published', 'scheduled').optional(),
  published_at: Joi.string().isoDate().optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  feature_image: Joi.string().uri().optional(),
  feature_image_alt: Joi.string().max(255).optional(),
  feature_image_caption: Joi.string().max(500).optional(),
  meta_title: Joi.string().max(70).optional(),
  meta_description: Joi.string().max(160).optional()
});

const createPostService = async (postInput) => {
  const logger = createContextLogger('post-service');
  
  // Validate input to prevent format string vulnerabilities
  const { error, value: validatedInput } = postInputSchema.validate(postInput);
  if (error) {
    logger.error('Post input validation failed', {
      error: error.details[0].message,
      inputKeys: Object.keys(postInput)
    });
    throw new Error(`Invalid post input: ${error.details[0].message}`);
  }
  
  const {
    title,
    html,
    custom_excerpt,
    status,
    published_at,
    tags, // Expecting array of strings (tag names) here now
    feature_image,
    feature_image_alt,
    feature_image_caption,
    meta_title,
    meta_description,
  } = validatedInput;

  // --- Resolve Tag Names to Tag Objects (ID/Slug/Name) ---
  let resolvedTags = [];
  if (tags && Array.isArray(tags) && tags.length > 0) {
    logger.info('Resolving provided tag names', { tagCount: tags.length, tags });
    resolvedTags = await Promise.all(
      tags.map(async (tagName) => {
        if (typeof tagName !== "string" || !tagName.trim()) {
          logger.warn('Skipping invalid tag name', { tagName, type: typeof tagName });
          return null; // Skip invalid entries
        }
        tagName = tagName.trim();

        try {
          // Check if tag exists by name
          const existingTags = await getGhostTags(tagName);
          if (existingTags && existingTags.length > 0) {
            logger.debug('Found existing tag', {
              tagName,
              tagId: existingTags[0].id
            });
            // Use the existing tag (Ghost usually accepts name, slug, or id)
            return { name: tagName }; // Or { id: existingTags[0].id } or { slug: existingTags[0].slug }
          } else {
            // Tag doesn't exist, create it
            logger.info('Creating new tag', { tagName });
            const newTag = await createGhostTag({ name: tagName });
            logger.info('Created new tag successfully', {
              tagName,
              tagId: newTag.id
            });
            // Use the new tag
            return { name: tagName }; // Or { id: newTag.id }
          }
        } catch (tagError) {
          logger.error('Error processing tag', {
            tagName,
            error: tagError.message
          });
          return null; // Skip tags that cause errors during processing
        }
      })
    );
    // Filter out any nulls from skipped/errored tags
    resolvedTags = resolvedTags.filter((tag) => tag !== null);
    logger.debug('Resolved tags for API', {
      resolvedTagCount: resolvedTags.length,
      resolvedTags
    });
  }
  // --- End Tag Resolution ---

  // --- Metadata Defaults/Generation ---
  const finalMetaTitle = meta_title || title; // Default meta_title to title
  const finalMetaDescription =
    meta_description || custom_excerpt || generateSimpleMetaDescription(html); // Default meta_description
  // Ensure description does not exceed limit even after defaulting
  const truncatedMetaDescription =
    finalMetaDescription.length > 500
      ? finalMetaDescription.substring(0, 497) + "..."
      : finalMetaDescription;
  // --- End Metadata Defaults ---

  // Prepare data for the Ghost API, including feature image fields
  const postDataForApi = {
    title,
    html,
    custom_excerpt,
    status: status || "draft", // Default to draft
    published_at,
    tags: resolvedTags,
    feature_image,
    feature_image_alt,
    feature_image_caption,
    meta_title: finalMetaTitle, // Use final value
    meta_description: truncatedMetaDescription, // Use final, truncated value
    // Add metadata fields here if needed in the future
  };

  logger.info('Creating Ghost post', {
    title: postDataForApi.title,
    status: postDataForApi.status,
    tagCount: postDataForApi.tags?.length || 0,
    hasFeatureImage: !!postDataForApi.feature_image
  });
  // Call the lower-level ghostService function
  const newPost = await createGhostPost(postDataForApi);
  return newPost;
};

export { createPostService };
