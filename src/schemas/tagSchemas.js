import { z } from 'zod';
import {
  ghostIdSchema,
  slugSchema,
  tagNameSchema,
  metaTitleSchema,
  metaDescriptionSchema,
  canonicalUrlSchema,
  featureImageSchema,
  visibilitySchema,
  ogImageSchema,
  twitterImageSchema,
} from './common.js';

/**
 * Tag Schemas for Ghost CMS
 * Provides input/output validation for tag operations
 */

// ----- Input Schemas -----

/**
 * Schema for creating a new tag
 * Required: name
 * Optional: slug, description, feature_image, visibility, meta fields
 */
export const createTagSchema = z.object({
  name: tagNameSchema,
  slug: slugSchema.optional(),
  description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
  feature_image: featureImageSchema,
  visibility: visibilitySchema.default('public'),
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
  codeinjection_head: z.string().optional(),
  codeinjection_foot: z.string().optional(),
  canonical_url: canonicalUrlSchema,
  accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Accent color must be a hex color code (e.g., #FF5733)')
    .optional(),
});

/**
 * Schema for updating an existing tag
 * All fields optional except when doing full replacement
 */
export const updateTagSchema = createTagSchema.partial();

/**
 * Schema for tag query/filter parameters
 */
export const tagQuerySchema = z.object({
  name: z.string().optional().describe('Filter by exact tag name'),
  slug: z.string().optional().describe('Filter by tag slug'),
  visibility: visibilitySchema.optional().describe('Filter by visibility'),
  limit: z.number().int().min(1).max(100).default(15).optional(),
  page: z.number().int().min(1).default(1).optional(),
  filter: z
    .string()
    .regex(/^[a-zA-Z0-9_\-:.'"\s,[\]<>=!+]+$/, 'Invalid filter: contains disallowed characters')
    .optional()
    .describe('NQL filter string'),
  include: z
    .string()
    .optional()
    .describe('Comma-separated list of relations to include (e.g., "count.posts")'),
  order: z.string().optional().describe('Order results (e.g., "name ASC", "created_at DESC")'),
});

/**
 * Schema for tag ID parameter
 */
export const tagIdSchema = z.object({
  id: ghostIdSchema,
});

// ----- Output Schemas -----

/**
 * Schema for a Ghost tag object (as returned by the API)
 */
export const tagOutputSchema = z.object({
  id: ghostIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  feature_image: z.string().url().nullable().optional(),
  visibility: visibilitySchema,
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
  og_image: z.string().url().nullable().optional(),
  og_title: z.string().nullable().optional(),
  og_description: z.string().nullable().optional(),
  twitter_image: z.string().url().nullable().optional(),
  twitter_title: z.string().nullable().optional(),
  twitter_description: z.string().nullable().optional(),
  codeinjection_head: z.string().nullable().optional(),
  codeinjection_foot: z.string().nullable().optional(),
  canonical_url: z.string().url().nullable().optional(),
  accent_color: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  url: z.string().url(),
});

/**
 * Schema for array of tags
 */
export const tagsArraySchema = z.array(tagOutputSchema);

/**
 * Schema for paginated tag response
 */
export const tagsPaginatedSchema = z.object({
  tags: tagsArraySchema,
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
