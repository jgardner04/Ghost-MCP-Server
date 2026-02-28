import { z } from 'zod';
import {
  ghostIdSchema,
  slugSchema,
  titleSchema,
  htmlContentSchema,
  excerptSchema,
  metaTitleSchema,
  metaDescriptionSchema,
  canonicalUrlSchema,
  featureImageSchema,
  featureImageAltSchema,
  featuredSchema,
  postStatusSchema,
  visibilitySchema,
  authorsSchema,
  tagsSchema,
  customExcerptSchema,
  ogImageSchema,
  twitterImageSchema,
  isoDateSchema,
} from './common.js';

/**
 * Post Schemas for Ghost CMS
 * Provides input/output validation for post operations
 */

// ----- Input Schemas -----

/**
 * Schema for creating a new post
 * Required: title, html
 * Optional: various metadata, feature image, authors, tags, etc.
 */
export const createPostSchema = z.object({
  title: titleSchema,
  html: htmlContentSchema.describe('HTML content of the post'),
  slug: slugSchema.optional(),
  status: postStatusSchema.default('draft'),
  visibility: visibilitySchema.default('public'),
  featured: featuredSchema,
  feature_image: featureImageSchema,
  feature_image_alt: featureImageAltSchema,
  feature_image_caption: z.string().max(500, 'Caption cannot exceed 500 characters').optional(),
  excerpt: excerptSchema,
  custom_excerpt: customExcerptSchema,
  meta_title: metaTitleSchema,
  meta_description: metaDescriptionSchema,
  og_image: ogImageSchema,
  og_title: z.string().max(300, 'OG title cannot exceed 300 characters').optional(),
  og_description: z.string().max(500, 'OG description cannot exceed 500 characters').optional(),
  twitter_image: twitterImageSchema,
  twitter_title: z.string().max(300, 'Twitter title cannot exceed 300 characters').optional(),
  twitter_description: z
    .string()
    .max(500, 'Twitter description cannot exceed 500 characters')
    .optional(),
  canonical_url: canonicalUrlSchema,
  tags: tagsSchema.describe(
    'Array of tag names or IDs to associate with the post. On update, this fully replaces the existing tags array (not merged).'
  ),
  authors: authorsSchema.describe(
    'Array of author IDs or emails. On update, this fully replaces the existing authors array (not merged).'
  ),
  published_at: isoDateSchema.optional().describe('Scheduled publish time (ISO 8601 format)'),
  codeinjection_head: z.string().optional(),
  codeinjection_foot: z.string().optional(),
  custom_template: z.string().optional().describe('Custom template filename'),
  email_only: z.boolean().default(false).describe('Whether post is email-only'),
});

/**
 * Schema for updating an existing post
 * All fields optional
 */
export const updatePostSchema = createPostSchema.partial();

/**
 * Schema for post query/filter parameters
 */
export const postQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(15).optional(),
  page: z.number().int().min(1).default(1).optional(),
  filter: z
    .string()
    .regex(/^[a-zA-Z0-9_\-:.'"\s,[\]<>=!+]+$/, 'Invalid filter: contains disallowed characters')
    .optional()
    .describe('NQL filter string (e.g., "status:published+featured:true")'),
  include: z
    .string()
    .optional()
    .describe('Comma-separated list of relations (e.g., "tags,authors")'),
  fields: z.string().optional().describe('Comma-separated list of fields to return'),
  formats: z
    .string()
    .optional()
    .describe('Comma-separated list of formats (html, plaintext, mobiledoc)'),
  order: z.string().optional().describe('Order results (e.g., "published_at DESC", "title ASC")'),
});

/**
 * Schema for post ID parameter
 */
export const postIdSchema = z.object({
  id: ghostIdSchema,
});

/**
 * Schema for post slug parameter
 */
export const postSlugSchema = z.object({
  slug: slugSchema,
});

// ----- Output Schemas -----

/**
 * Schema for an author object (nested in post)
 */
export const authorOutputSchema = z.object({
  id: ghostIdSchema,
  name: z.string(),
  slug: z.string(),
  email: z.string().email().optional(),
  profile_image: z.string().url().nullable().optional(),
  cover_image: z.string().url().nullable().optional(),
  bio: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  location: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
  twitter: z.string().nullable().optional(),
  url: z.string().url(),
});

/**
 * Schema for a tag object (nested in post)
 */
export const tagOutputSchema = z.object({
  id: ghostIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  feature_image: z.string().url().nullable().optional(),
  visibility: visibilitySchema,
  url: z.string().url(),
});

/**
 * Schema for a Ghost post object (as returned by the API)
 */
export const postOutputSchema = z.object({
  id: ghostIdSchema,
  uuid: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  html: z.string().nullable().optional(),
  comment_id: z.string().nullable().optional(),
  feature_image: z.string().url().nullable().optional(),
  feature_image_alt: z.string().nullable().optional(),
  feature_image_caption: z.string().nullable().optional(),
  featured: z.boolean(),
  status: postStatusSchema,
  visibility: visibilitySchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  published_at: z.string().datetime().nullable().optional(),
  custom_excerpt: z.string().nullable().optional(),
  codeinjection_head: z.string().nullable().optional(),
  codeinjection_foot: z.string().nullable().optional(),
  custom_template: z.string().nullable().optional(),
  canonical_url: z.string().url().nullable().optional(),
  url: z.string().url(),
  excerpt: z.string().nullable().optional(),
  reading_time: z.number().nullable().optional(),
  email_only: z.boolean().optional(),
  og_image: z.string().url().nullable().optional(),
  og_title: z.string().nullable().optional(),
  og_description: z.string().nullable().optional(),
  twitter_image: z.string().url().nullable().optional(),
  twitter_title: z.string().nullable().optional(),
  twitter_description: z.string().nullable().optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
  email_subject: z.string().nullable().optional(),
  authors: z.array(authorOutputSchema).optional(),
  tags: z.array(tagOutputSchema).optional(),
  primary_author: authorOutputSchema.nullable().optional(),
  primary_tag: tagOutputSchema.nullable().optional(),
});

/**
 * Schema for array of posts
 */
export const postsArraySchema = z.array(postOutputSchema);

/**
 * Schema for paginated post response
 */
export const postsPaginatedSchema = z.object({
  posts: postsArraySchema,
  meta: z.object({
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      pages: z.number(),
      total: z.number(),
      next: z.number().nullable(),
      prev: z.number().nullable(),
    }),
  }),
});
