import { z } from 'zod';
import { ghostIdSchema, emailSchema, slugSchema } from './common.js';

/**
 * Newsletter Schemas for Ghost CMS
 * Provides input/output validation for newsletter operations
 */

// ----- Input Schemas -----

/**
 * Schema for creating a new newsletter
 * Required: name
 * Optional: description, sender details, design options, etc.
 */
export const createNewsletterSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(191, 'Name cannot exceed 191 characters'),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional(),
  slug: slugSchema.optional(),
  sender_name: z.string().max(191, 'Sender name cannot exceed 191 characters').optional(),
  sender_email: emailSchema.optional(),
  sender_reply_to: z
    .enum(['newsletter', 'support'], {
      errorMap: () => ({ message: 'Sender reply-to must be newsletter or support' }),
    })
    .default('newsletter'),
  status: z
    .enum(['active', 'archived'], {
      errorMap: () => ({ message: 'Status must be active or archived' }),
    })
    .default('active'),
  visibility: z
    .enum(['members', 'paid'], {
      errorMap: () => ({ message: 'Visibility must be members or paid' }),
    })
    .default('members'),
  subscribe_on_signup: z
    .boolean()
    .default(true)
    .describe('Whether new members are automatically subscribed'),
  sort_order: z
    .number()
    .int()
    .min(0, 'Sort order must be non-negative')
    .optional()
    .describe('Display order for newsletters'),
  header_image: z.string().url('Invalid header image URL').optional(),
  show_header_icon: z.boolean().default(true),
  show_header_title: z.boolean().default(true),
  title_font_category: z
    .enum(['serif', 'sans-serif'], {
      errorMap: () => ({ message: 'Title font category must be serif or sans-serif' }),
    })
    .default('sans-serif'),
  title_alignment: z
    .enum(['left', 'center'], {
      errorMap: () => ({ message: 'Title alignment must be left or center' }),
    })
    .default('center'),
  show_feature_image: z.boolean().default(true),
  body_font_category: z
    .enum(['serif', 'sans-serif'], {
      errorMap: () => ({ message: 'Body font category must be serif or sans-serif' }),
    })
    .default('sans-serif'),
  footer_content: z.string().optional(),
  show_badge: z.boolean().default(true),
  show_header_name: z.boolean().default(true).optional(),
  show_post_title_section: z.boolean().default(true).optional(),
});

/**
 * Schema for updating an existing newsletter
 * All fields optional
 */
export const updateNewsletterSchema = createNewsletterSchema.partial();

/**
 * Schema for newsletter query/filter parameters
 */
export const newsletterQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(15).optional(),
  page: z.number().int().min(1).default(1).optional(),
  filter: z
    .string()
    .regex(/^[a-zA-Z0-9_\-:.'"\s,[\]<>=!+]+$/, 'Invalid filter: contains disallowed characters')
    .optional()
    .describe('NQL filter string (e.g., "status:active")'),
  order: z
    .string()
    .optional()
    .describe('Order results (e.g., "sort_order ASC", "created_at DESC")'),
});

/**
 * Schema for newsletter ID parameter
 */
export const newsletterIdSchema = z.object({
  id: ghostIdSchema,
});

/**
 * Schema for newsletter slug parameter
 */
export const newsletterSlugSchema = z.object({
  slug: slugSchema,
});

// ----- Output Schemas -----

/**
 * Schema for a Ghost newsletter object (as returned by the API)
 */
export const newsletterOutputSchema = z.object({
  id: ghostIdSchema,
  uuid: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  sender_name: z.string().nullable().optional(),
  sender_email: z.string().email().nullable().optional(),
  sender_reply_to: z.enum(['newsletter', 'support']),
  status: z.enum(['active', 'archived']),
  visibility: z.enum(['members', 'paid']),
  subscribe_on_signup: z.boolean(),
  sort_order: z.number(),
  header_image: z.string().url().nullable().optional(),
  show_header_icon: z.boolean(),
  show_header_title: z.boolean(),
  title_font_category: z.string(),
  title_alignment: z.enum(['left', 'center']),
  show_feature_image: z.boolean(),
  body_font_category: z.string(),
  footer_content: z.string().nullable().optional(),
  show_badge: z.boolean(),
  show_header_name: z.boolean().optional(),
  show_post_title_section: z.boolean().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  count: z
    .object({
      members: z.number().optional(),
      posts: z.number().optional(),
    })
    .optional(),
});

/**
 * Schema for array of newsletters
 */
export const newslettersArraySchema = z.array(newsletterOutputSchema);

/**
 * Schema for paginated newsletter response
 */
export const newslettersPaginatedSchema = z.object({
  newsletters: newslettersArraySchema,
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
