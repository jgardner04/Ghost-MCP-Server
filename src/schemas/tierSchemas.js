import { z } from 'zod';
import { ghostIdSchema, slugSchema } from './common.js';

/**
 * Tier (Membership/Product) Schemas for Ghost CMS
 * Tiers represent membership levels and pricing plans
 * Provides input/output validation for tier operations
 */

// ----- Input Schemas -----

/**
 * Schema for tier benefits (features)
 */
export const tierBenefitSchema = z.object({
  name: z.string().min(1, 'Benefit name cannot be empty').max(191, 'Benefit name too long'),
});

/**
 * Schema for monthly price configuration
 */
export const monthlyPriceSchema = z.object({
  amount: z.number().int().min(0, 'Monthly price must be non-negative'),
  currency: z
    .string()
    .length(3, 'Currency must be 3-letter ISO code (e.g., USD, EUR)')
    .regex(/^[A-Z]{3}$/, 'Currency must be uppercase 3-letter code'),
});

/**
 * Schema for yearly price configuration
 */
export const yearlyPriceSchema = z.object({
  amount: z.number().int().min(0, 'Yearly price must be non-negative'),
  currency: z
    .string()
    .length(3, 'Currency must be 3-letter ISO code (e.g., USD, EUR)')
    .regex(/^[A-Z]{3}$/, 'Currency must be uppercase 3-letter code'),
});

/**
 * Schema for creating a new tier
 * Required: name
 * Optional: description, benefits, pricing, visibility
 */
export const createTierSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(191, 'Name cannot exceed 191 characters'),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').optional(),
  slug: slugSchema.optional(),
  active: z.boolean().default(true).describe('Whether tier is currently active/available'),
  type: z
    .enum(['free', 'paid'], {
      error: () => ({ message: 'Type must be free or paid' }),
    })
    .default('paid'),
  welcome_page_url: z.string().url('Invalid welcome page URL').optional(),
  visibility: z
    .enum(['public', 'none'], {
      error: () => ({ message: 'Visibility must be public or none' }),
    })
    .default('public'),
  trial_days: z
    .number()
    .int()
    .min(0, 'Trial days must be non-negative')
    .default(0)
    .describe('Number of trial days for paid tiers'),
  currency: z
    .string()
    .length(3, 'Currency must be 3-letter ISO code')
    .regex(/^[A-Z]{3}$/, 'Currency must be uppercase')
    .optional(),
  monthly_price: z.number().int().min(0, 'Monthly price must be non-negative').optional(),
  yearly_price: z.number().int().min(0, 'Yearly price must be non-negative').optional(),
  benefits: z.array(z.string()).optional().describe('Array of benefit names/descriptions'),
});

/**
 * Schema for updating an existing tier
 * All fields optional
 */
export const updateTierSchema = createTierSchema.partial();

/**
 * Schema for tier query/filter parameters
 */
export const tierQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(15).optional(),
  page: z.number().int().min(1).default(1).optional(),
  filter: z
    .string()
    .regex(/^[a-zA-Z0-9_\-:.'"\s,[\]<>=!+]+$/, 'Invalid filter: contains disallowed characters')
    .optional()
    .describe('NQL filter string (e.g., "type:paid+active:true")'),
  include: z.string().optional().describe('Comma-separated list of relations to include'),
  order: z
    .string()
    .optional()
    .describe('Order results (e.g., "monthly_price ASC", "created_at DESC")'),
});

/**
 * Schema for tier ID parameter
 */
export const tierIdSchema = z.object({
  id: ghostIdSchema,
});

/**
 * Schema for tier slug parameter
 */
export const tierSlugSchema = z.object({
  slug: slugSchema,
});

// ----- Output Schemas -----

/**
 * Schema for a benefit object (as returned by the API)
 */
export const benefitOutputSchema = z.object({
  id: ghostIdSchema,
  name: z.string(),
  slug: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Schema for monthly price object (as returned by the API)
 */
export const monthlyPriceOutputSchema = z.object({
  id: z.string(),
  tier_id: ghostIdSchema,
  nickname: z.string(),
  amount: z.number(),
  interval: z.literal('month'),
  type: z.enum(['recurring', 'one-time']),
  currency: z.string(),
  active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Schema for yearly price object (as returned by the API)
 */
export const yearlyPriceOutputSchema = z.object({
  id: z.string(),
  tier_id: ghostIdSchema,
  nickname: z.string(),
  amount: z.number(),
  interval: z.literal('year'),
  type: z.enum(['recurring', 'one-time']),
  currency: z.string(),
  active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Schema for a Ghost tier object (as returned by the API)
 */
export const tierOutputSchema = z.object({
  id: ghostIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  active: z.boolean(),
  type: z.enum(['free', 'paid']),
  welcome_page_url: z.string().url().nullable().optional(),
  visibility: z.enum(['public', 'none']),
  trial_days: z.number(),
  currency: z.string().nullable().optional(),
  monthly_price: z.number().nullable().optional(),
  yearly_price: z.number().nullable().optional(),
  monthly_price_id: z.string().nullable().optional(),
  yearly_price_id: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  benefits: z.array(benefitOutputSchema).optional(),
  monthly_price_object: monthlyPriceOutputSchema.nullable().optional(),
  yearly_price_object: yearlyPriceOutputSchema.nullable().optional(),
});

/**
 * Schema for array of tiers
 */
export const tiersArraySchema = z.array(tierOutputSchema);

/**
 * Schema for paginated tier response
 */
export const tiersPaginatedSchema = z.object({
  tiers: tiersArraySchema,
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
