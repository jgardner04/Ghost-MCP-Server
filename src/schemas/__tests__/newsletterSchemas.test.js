import { describe, it, expect } from 'vitest';
import {
  createNewsletterSchema,
  updateNewsletterSchema,
  newsletterQuerySchema,
  newsletterIdSchema,
  newsletterSlugSchema,
  newsletterOutputSchema,
} from '../newsletterSchemas.js';

describe('Newsletter Schemas', () => {
  describe('createNewsletterSchema', () => {
    it('should accept valid newsletter creation data', () => {
      const validNewsletter = {
        name: 'Weekly Newsletter',
        description: 'Our weekly updates',
        slug: 'weekly-newsletter',
      };

      expect(() => createNewsletterSchema.parse(validNewsletter)).not.toThrow();
    });

    it('should accept minimal newsletter creation data (name only)', () => {
      const minimalNewsletter = {
        name: 'Simple Newsletter',
      };

      const result = createNewsletterSchema.parse(minimalNewsletter);
      expect(result.name).toBe('Simple Newsletter');
      expect(result.sender_reply_to).toBe('newsletter'); // default
      expect(result.status).toBe('active'); // default
      expect(result.visibility).toBe('members'); // default
      expect(result.subscribe_on_signup).toBe(true); // default
      expect(result.show_header_icon).toBe(true); // default
      expect(result.show_header_title).toBe(true); // default
      expect(result.title_font_category).toBe('sans-serif'); // default
      expect(result.title_alignment).toBe('center'); // default
      expect(result.show_feature_image).toBe(true); // default
      expect(result.body_font_category).toBe('sans-serif'); // default
      expect(result.show_badge).toBe(true); // default
    });

    it('should accept newsletter with all fields', () => {
      const fullNewsletter = {
        name: 'Complete Newsletter',
        description: 'Full description',
        slug: 'complete-newsletter',
        sender_name: 'Blog Team',
        sender_email: 'team@example.com',
        sender_reply_to: 'support',
        status: 'archived',
        visibility: 'paid',
        subscribe_on_signup: false,
        sort_order: 5,
        header_image: 'https://example.com/header.jpg',
        show_header_icon: false,
        show_header_title: false,
        title_font_category: 'serif',
        title_alignment: 'left',
        show_feature_image: false,
        body_font_category: 'serif',
        footer_content: 'Custom footer',
        show_badge: false,
        show_header_name: false,
        show_post_title_section: false,
      };

      expect(() => createNewsletterSchema.parse(fullNewsletter)).not.toThrow();
    });

    it('should reject newsletter without name', () => {
      const invalidNewsletter = {
        description: 'Missing name',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with empty name', () => {
      const invalidNewsletter = {
        name: '',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with too long name', () => {
      const invalidNewsletter = {
        name: 'A'.repeat(192),
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with too long description', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        description: 'A'.repeat(2001),
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid slug', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        slug: 'Invalid_Slug', // uppercase and underscore not allowed
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with too long sender name', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        sender_name: 'A'.repeat(192),
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid sender email', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        sender_email: 'not-an-email',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid sender_reply_to', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        sender_reply_to: 'invalid',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid status', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        status: 'invalid',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid visibility', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        visibility: 'public',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with negative sort_order', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        sort_order: -1,
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid header_image URL', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        header_image: 'not-a-url',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid title_font_category', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        title_font_category: 'invalid',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid title_alignment', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        title_alignment: 'right',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter with invalid body_font_category', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        body_font_category: 'monospace',
      };

      expect(() => createNewsletterSchema.parse(invalidNewsletter)).toThrow();
    });
  });

  describe('updateNewsletterSchema', () => {
    it('should accept partial newsletter updates', () => {
      const update = {
        description: 'Updated description',
      };

      expect(() => updateNewsletterSchema.parse(update)).not.toThrow();
    });

    it('should accept empty update object', () => {
      expect(() => updateNewsletterSchema.parse({})).not.toThrow();
    });

    it('should accept full newsletter update', () => {
      const update = {
        name: 'Updated Newsletter',
        description: 'Updated description',
        status: 'archived',
        visibility: 'paid',
      };

      expect(() => updateNewsletterSchema.parse(update)).not.toThrow();
    });
  });

  describe('newsletterQuerySchema', () => {
    it('should accept valid query parameters', () => {
      const query = {
        limit: 20,
        page: 2,
        filter: 'status:active',
      };

      expect(() => newsletterQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with order parameter', () => {
      const query = {
        order: 'sort_order ASC',
      };

      expect(() => newsletterQuerySchema.parse(query)).not.toThrow();
    });

    it('should reject query with invalid filter characters', () => {
      const query = {
        filter: 'status;DROP TABLE',
      };

      expect(() => newsletterQuerySchema.parse(query)).toThrow();
    });

    it('should accept empty query object', () => {
      const result = newsletterQuerySchema.parse({});
      expect(result).toBeDefined();
    });
  });

  describe('newsletterIdSchema', () => {
    it('should accept valid Ghost ID', () => {
      const validId = {
        id: '507f1f77bcf86cd799439011',
      };

      expect(() => newsletterIdSchema.parse(validId)).not.toThrow();
    });

    it('should reject invalid Ghost ID', () => {
      const invalidId = {
        id: 'invalid-id',
      };

      expect(() => newsletterIdSchema.parse(invalidId)).toThrow();
    });
  });

  describe('newsletterSlugSchema', () => {
    it('should accept valid slug', () => {
      const validSlug = {
        slug: 'weekly-newsletter',
      };

      expect(() => newsletterSlugSchema.parse(validSlug)).not.toThrow();
    });

    it('should reject invalid slug', () => {
      const invalidSlug = {
        slug: 'Invalid_Slug',
      };

      expect(() => newsletterSlugSchema.parse(invalidSlug)).toThrow();
    });
  });

  describe('newsletterOutputSchema', () => {
    it('should accept valid newsletter output from Ghost API', () => {
      const apiNewsletter = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Weekly Newsletter',
        description: 'Our weekly updates',
        slug: 'weekly-newsletter',
        sender_name: 'Blog Team',
        sender_email: 'team@example.com',
        sender_reply_to: 'newsletter',
        status: 'active',
        visibility: 'members',
        subscribe_on_signup: true,
        sort_order: 0,
        header_image: 'https://example.com/header.jpg',
        show_header_icon: true,
        show_header_title: true,
        title_font_category: 'sans-serif',
        title_alignment: 'center',
        show_feature_image: true,
        body_font_category: 'sans-serif',
        footer_content: 'Footer text',
        show_badge: true,
        show_header_name: true,
        show_post_title_section: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        count: {
          members: 150,
          posts: 25,
        },
      };

      expect(() => newsletterOutputSchema.parse(apiNewsletter)).not.toThrow();
    });

    it('should accept newsletter with null optional fields', () => {
      const apiNewsletter = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Newsletter',
        description: null,
        slug: 'newsletter',
        sender_name: null,
        sender_email: null,
        sender_reply_to: 'newsletter',
        status: 'active',
        visibility: 'members',
        subscribe_on_signup: true,
        sort_order: 0,
        header_image: null,
        show_header_icon: true,
        show_header_title: true,
        title_font_category: 'sans-serif',
        title_alignment: 'center',
        show_feature_image: true,
        body_font_category: 'sans-serif',
        footer_content: null,
        show_badge: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => newsletterOutputSchema.parse(apiNewsletter)).not.toThrow();
    });

    it('should reject newsletter output without required fields', () => {
      const invalidNewsletter = {
        name: 'Newsletter',
        slug: 'newsletter',
      };

      expect(() => newsletterOutputSchema.parse(invalidNewsletter)).toThrow();
    });

    it('should reject newsletter output with invalid status', () => {
      const invalidNewsletter = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Newsletter',
        slug: 'newsletter',
        sender_reply_to: 'newsletter',
        status: 'invalid_status',
        visibility: 'members',
        subscribe_on_signup: true,
        sort_order: 0,
        show_header_icon: true,
        show_header_title: true,
        title_font_category: 'sans-serif',
        title_alignment: 'center',
        show_feature_image: true,
        body_font_category: 'sans-serif',
        show_badge: true,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
      };

      expect(() => newsletterOutputSchema.parse(invalidNewsletter)).toThrow();
    });
  });
});
