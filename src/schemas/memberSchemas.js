import { z } from 'zod';
import { ghostIdSchema, emailSchema } from './common.js';

/**
 * Member Schemas for Ghost CMS
 * Provides input/output validation for member operations
 */

// ----- Input Schemas -----

/**
 * Schema for creating a new member
 * Required: email
 * Optional: name, note, subscribed, labels, etc.
 */
export const createMemberSchema = z.object({
  email: emailSchema,
  name: z.string().max(191, 'Name cannot exceed 191 characters').optional(),
  note: z.string().max(2000, 'Note cannot exceed 2000 characters').optional(),
  subscribed: z.boolean().default(true).describe('Whether member is subscribed to newsletter'),
  comped: z.boolean().default(false).describe('Whether member has complimentary subscription'),
  labels: z.array(z.string()).optional().describe('Array of label names to associate with member'),
  newsletters: z
    .array(ghostIdSchema)
    .optional()
    .describe('Array of newsletter IDs to subscribe member to'),
});

/**
 * Schema for updating an existing member
 * All fields optional
 */
export const updateMemberSchema = createMemberSchema.partial();

/**
 * Schema for member query/filter parameters
 */
export const memberQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(15).optional(),
  page: z.number().int().min(1).default(1).optional(),
  filter: z
    .string()
    .regex(/^[a-zA-Z0-9_\-:.'"\s,[\]<>=!+]+$/, 'Invalid filter: contains disallowed characters')
    .optional()
    .describe('NQL filter string (e.g., "status:paid+subscribed:true")'),
  include: z
    .string()
    .optional()
    .describe('Comma-separated list of relations (e.g., "labels,newsletters")'),
  order: z.string().optional().describe('Order results (e.g., "created_at DESC", "name ASC")'),
  search: z.string().optional().describe('Search members by name or email'),
});

/**
 * Schema for member ID parameter
 */
export const memberIdSchema = z.object({
  id: ghostIdSchema,
});

/**
 * Schema for member email parameter
 */
export const memberEmailSchema = z.object({
  email: emailSchema,
});

// ----- Output Schemas -----

/**
 * Schema for a label object (nested in member)
 */
export const labelOutputSchema = z.object({
  id: ghostIdSchema,
  name: z.string(),
  slug: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Schema for a newsletter object (nested in member)
 */
export const newsletterOutputSchema = z.object({
  id: ghostIdSchema,
  uuid: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  sender_name: z.string().nullable().optional(),
  sender_email: z.string().email().nullable().optional(),
  sender_reply_to: z.enum(['newsletter', 'support']).optional(),
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
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Schema for member subscription (tier/product)
 */
export const memberSubscriptionSchema = z.object({
  id: z.string(),
  customer: z.object({
    id: z.string(),
    name: z.string().nullable().optional(),
    email: z.string().email(),
  }),
  plan: z.object({
    id: z.string(),
    nickname: z.string(),
    amount: z.number(),
    interval: z.enum(['month', 'year']),
    currency: z.string(),
  }),
  status: z.enum(['active', 'trialing', 'past_due', 'canceled', 'unpaid']),
  start_date: z.string().datetime(),
  current_period_end: z.string().datetime(),
  cancel_at_period_end: z.boolean(),
  cancellation_reason: z.string().nullable().optional(),
  trial_start_date: z.string().datetime().nullable().optional(),
  trial_end_date: z.string().datetime().nullable().optional(),
});

/**
 * Schema for a Ghost member object (as returned by the API)
 */
export const memberOutputSchema = z.object({
  id: ghostIdSchema,
  uuid: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  geolocation: z.string().nullable().optional(),
  enable_comment_notifications: z.boolean(),
  email_count: z.number(),
  email_opened_count: z.number(),
  email_open_rate: z.number().nullable().optional(),
  status: z.enum(['free', 'paid', 'comped']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  subscribed: z.boolean(),
  comped: z.boolean(),
  email_suppression: z
    .object({
      suppressed: z.boolean(),
      info: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  labels: z.array(labelOutputSchema).optional(),
  subscriptions: z.array(memberSubscriptionSchema).optional(),
  newsletters: z.array(newsletterOutputSchema).optional(),
  avatar_image: z.string().url().nullable().optional(),
});

/**
 * Schema for array of members
 */
export const membersArraySchema = z.array(memberOutputSchema);

/**
 * Schema for paginated member response
 */
export const membersPaginatedSchema = z.object({
  members: membersArraySchema,
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
