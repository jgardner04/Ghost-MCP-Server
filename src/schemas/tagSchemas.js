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
 * Base schema for tag query/filter parameters (without refinement)
 * Exported for use in MCP server where .partial() is needed
 */
export const tagQueryBaseSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-zA-Z0-9\s\-_']+$/,
      'Tag name contains invalid characters. Only letters, numbers, spaces, hyphens, underscores, and apostrophes are allowed'
    )
    .optional()
    .describe('Filter by exact tag name (legacy parameter, converted to filter internally)'),
  slug: z.string().optional().describe('Filter by tag slug'),
  visibility: visibilitySchema.optional().describe('Filter by visibility'),
  limit: z
    .union([z.number().int().min(1).max(100), z.string().regex(/^\d+$/).transform(Number)])
    .default(15)
    .optional(),
  page: z
    .union([z.number().int().min(1), z.string().regex(/^\d+$/).transform(Number)])
    .default(1)
    .optional(),
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
 * Schema for tag query/filter parameters with validation
 * Note: Only one of 'name' or 'filter' should be provided, not both
 */
export const tagQuerySchema = tagQueryBaseSchema.refine((data) => !(data.name && data.filter), {
  message: 'Cannot specify both "name" and "filter" parameters. Use "filter" for advanced queries.',
  path: ['filter'],
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
