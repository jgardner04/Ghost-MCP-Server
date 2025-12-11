import { z } from 'zod';

/**
 * Common Zod schemas for validation across all Ghost MCP resources.
 * These validators provide consistent validation and security controls.
 */

// ----- Basic Type Validators -----

/**
 * Email validation schema
 * Validates proper email format
 */
export const emailSchema = z.string().email('Invalid email format');

/**
 * URL validation schema
 * Validates proper URL format (http/https)
 */
export const urlSchema = z.string().url('Invalid URL format');

/**
 * ISO 8601 datetime validation schema
 * Validates ISO datetime strings
 */
export const isoDateSchema = z.string().datetime('Invalid ISO 8601 datetime format');

/**
 * Slug validation schema
 * Validates URL-friendly slugs (lowercase alphanumeric with hyphens)
 */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens');

/**
 * Ghost ID validation schema
 * Validates 24-character hexadecimal Ghost object IDs
 */
export const ghostIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/, 'Invalid Ghost ID format (must be 24 hex characters)');

// ----- Security Validators -----

/**
 * NQL (Ghost Query Language) filter validation schema
 * Prevents injection attacks by restricting allowed characters
 * Allows: alphanumeric, underscores, hyphens, colons, dots, quotes, spaces, commas, brackets, comparison operators
 */
export const nqlFilterSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_\-:.'"\s,[\]<>=!+]+$/, 'Invalid NQL filter: contains disallowed characters')
  .optional();

// ----- Pagination Validators -----

/**
 * Limit validation schema for pagination
 * Restricts result count between 1 and 100
 */
export const limitSchema = z
  .number()
  .int('Limit must be an integer')
  .min(1, 'Limit must be at least 1')
  .max(100, 'Limit cannot exceed 100')
  .default(15);

/**
 * Page number validation schema for pagination
 * Must be a positive integer starting from 1
 */
export const pageSchema = z
  .number()
  .int('Page must be an integer')
  .min(1, 'Page must be at least 1')
  .default(1);

/**
 * Complete pagination options schema
 */
export const paginationSchema = z.object({
  limit: limitSchema,
  page: pageSchema,
});

// ----- Status Enum Validators -----

/**
 * Post/Page status validation schema
 * Valid values: draft, published, scheduled
 */
export const postStatusSchema = z.enum(['draft', 'published', 'scheduled'], {
  errorMap: () => ({ message: 'Status must be draft, published, or scheduled' }),
});

/**
 * Visibility validation schema
 * Controls content visibility (public, members, paid, tiers)
 */
export const visibilitySchema = z.enum(['public', 'members', 'paid', 'tiers'], {
  errorMap: () => ({ message: 'Visibility must be public, members, paid, or tiers' }),
});

// ----- Common Field Validators -----

/**
 * HTML content validation schema
 * Validates that content is a non-empty string
 * Note: HTML sanitization should be performed separately
 */
export const htmlContentSchema = z.string().min(1, 'HTML content cannot be empty');

/**
 * Title validation schema
 * Validates post/page titles (1-255 characters)
 */
export const titleSchema = z
  .string()
  .min(1, 'Title cannot be empty')
  .max(255, 'Title cannot exceed 255 characters');

/**
 * Excerpt/description validation schema
 * Optional text snippet (max 500 characters)
 */
export const excerptSchema = z.string().max(500, 'Excerpt cannot exceed 500 characters').optional();

/**
 * Meta title validation schema (SEO)
 * Optional SEO title (max 300 characters)
 */
export const metaTitleSchema = z
  .string()
  .max(300, 'Meta title cannot exceed 300 characters')
  .optional();

/**
 * Meta description validation schema (SEO)
 * Optional SEO description (max 500 characters)
 */
export const metaDescriptionSchema = z
  .string()
  .max(500, 'Meta description cannot exceed 500 characters')
  .optional();

/**
 * Featured flag validation schema
 * Boolean indicating if content is featured
 */
export const featuredSchema = z.boolean().default(false);

/**
 * Feature image URL validation schema
 * Optional URL for featured image
 */
export const featureImageSchema = z.string().url('Invalid feature image URL').optional();

/**
 * Feature image alt text validation schema
 * Optional alt text for accessibility
 */
export const featureImageAltSchema = z
  .string()
  .max(125, 'Feature image alt text cannot exceed 125 characters')
  .optional();

/**
 * Tag name validation schema
 * Tag names (1-191 characters)
 */
export const tagNameSchema = z
  .string()
  .min(1, 'Tag name cannot be empty')
  .max(191, 'Tag name cannot exceed 191 characters');

/**
 * Authors array validation schema
 * Array of Ghost author IDs or email addresses
 */
export const authorsSchema = z.array(z.string()).optional();

/**
 * Tags array validation schema
 * Array of tag names or Ghost tag IDs
 */
export const tagsSchema = z.array(z.string()).optional();

// ----- Utility Validators -----

/**
 * Canonical URL validation schema
 * Optional canonical URL for SEO
 */
export const canonicalUrlSchema = z.string().url('Invalid canonical URL').optional();

/**
 * Code injection validation schema
 * Optional HTML/JS code injection (use with caution)
 */
export const codeInjectionSchema = z
  .object({
    head: z.string().optional(),
    foot: z.string().optional(),
  })
  .optional();

/**
 * OG (Open Graph) image validation schema
 * Optional social media image URL
 */
export const ogImageSchema = z.string().url('Invalid OG image URL').optional();

/**
 * Twitter image validation schema
 * Optional Twitter card image URL
 */
export const twitterImageSchema = z.string().url('Invalid Twitter image URL').optional();

/**
 * Custom excerpt validation schema for social media
 * Optional custom excerpt for social sharing
 */
export const customExcerptSchema = z
  .string()
  .max(300, 'Custom excerpt cannot exceed 300 characters')
  .optional();
