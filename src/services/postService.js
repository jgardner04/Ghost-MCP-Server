import {
  createPost as createGhostPost,
  getTags as getGhostTags,
  createTag as createGhostTag,
  // Import other necessary functions from ghostService later
} from "./ghostService.js"; // Note the relative path

/**
 * Helper to generate a simple meta description from HTML content.
 * Strips HTML tags and truncates.
 * @param {string} htmlContent - The HTML content of the post.
 * @param {number} maxLength - The maximum length of the description.
 * @returns {string} A plain text truncated description.
 */
const generateSimpleMetaDescription = (htmlContent, maxLength = 500) => {
  if (!htmlContent) return "";
  // Basic HTML tag stripping (consider a library for robustness if needed)
  const textContent = htmlContent
    .replace(/<[^>]+>/g, " ")
    .replace(/\s\s+/g, " ")
    .trim();
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
const createPostService = async (postInput) => {
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
  } = postInput;

  // --- Resolve Tag Names to Tag Objects (ID/Slug/Name) ---
  let resolvedTags = [];
  if (tags && Array.isArray(tags) && tags.length > 0) {
    console.log("Resolving provided tag names:", tags);
    resolvedTags = await Promise.all(
      tags.map(async (tagName) => {
        if (typeof tagName !== "string" || !tagName.trim()) {
          console.warn(`Skipping invalid tag name: ${tagName}`);
          return null; // Skip invalid entries
        }
        tagName = tagName.trim();

        try {
          // Check if tag exists by name
          const existingTags = await getGhostTags(tagName);
          if (existingTags && existingTags.length > 0) {
            console.log(
              `Found existing tag: "${tagName}" (ID: ${existingTags[0].id})`
            );
            // Use the existing tag (Ghost usually accepts name, slug, or id)
            return { name: tagName }; // Or { id: existingTags[0].id } or { slug: existingTags[0].slug }
          } else {
            // Tag doesn't exist, create it
            console.log(`Tag "${tagName}" not found, creating...`);
            const newTag = await createGhostTag({ name: tagName });
            console.log(`Created new tag: "${tagName}" (ID: ${newTag.id})`);
            // Use the new tag
            return { name: tagName }; // Or { id: newTag.id }
          }
        } catch (tagError) {
          console.error(`Error processing tag "${tagName}":`, tagError.message);
          return null; // Skip tags that cause errors during processing
        }
      })
    );
    // Filter out any nulls from skipped/errored tags
    resolvedTags = resolvedTags.filter((tag) => tag !== null);
    console.log("Resolved tags for API:", resolvedTags);
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

  console.log("Calling ghostService.createPost with data:", postDataForApi);
  // Call the lower-level ghostService function
  const newPost = await createGhostPost(postDataForApi);
  return newPost;
};

export { createPostService };
