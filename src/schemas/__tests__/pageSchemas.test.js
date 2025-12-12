import { describe, it, expect } from 'vitest';
import {
  createPageSchema,
  updatePageSchema,
  pageQuerySchema,
  pageIdSchema,
  pageSlugSchema,
  pageOutputSchema,
  authorOutputSchema,
  tagOutputSchema,
} from '../pageSchemas.js';

describe('Page Schemas', () => {
  describe('createPageSchema', () => {
    it('should accept valid page creation data', () => {
      const validPage = {
        title: 'About Us',
        html: '<p>This is our about page.</p>',
        status: 'published',
      };

      expect(() => createPageSchema.parse(validPage)).not.toThrow();
    });

    it('should accept minimal page creation data', () => {
      const minimalPage = {
        title: 'Contact',
        html: '<p>Contact information</p>',
      };

      const result = createPageSchema.parse(minimalPage);
      expect(result.title).toBe('Contact');
      expect(result.status).toBe('draft'); // default
      expect(result.visibility).toBe('public'); // default
      expect(result.featured).toBe(false); // default
      expect(result.show_title_and_feature_image).toBe(true); // default
    });

    it('should accept page with all fields', () => {
      const fullPage = {
        title: 'Complete Page',
        html: '<p>Full content</p>',
        slug: 'complete-page',
        status: 'published',
        visibility: 'members',
        featured: true,
        feature_image: 'https://example.com/image.jpg',
        feature_image_alt: 'Image description',
        feature_image_caption: 'Photo caption',
        excerpt: 'Brief summary',
        custom_excerpt: 'Custom summary',
        meta_title: 'SEO Title',
        meta_description: 'SEO Description',
        og_image: 'https://example.com/og.jpg',
        og_title: 'OG Title',
        og_description: 'OG Description',
        twitter_image: 'https://example.com/twitter.jpg',
        twitter_title: 'Twitter Title',
        twitter_description: 'Twitter Description',
        canonical_url: 'https://example.com/original',
        tags: ['about'],
        authors: ['author@example.com'],
        published_at: '2024-01-15T10:30:00.000Z',
        codeinjection_head: '<script>console.log("head")</script>',
        codeinjection_foot: '<script>console.log("foot")</script>',
        custom_template: 'custom-about.hbs',
        show_title_and_feature_image: false,
      };

      expect(() => createPageSchema.parse(fullPage)).not.toThrow();
    });

    it('should reject page without title', () => {
      const invalidPage = {
        html: '<p>Content</p>',
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page without html', () => {
      const invalidPage = {
        title: 'Title',
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with invalid status', () => {
      const invalidPage = {
        title: 'Title',
        html: '<p>Content</p>',
        status: 'invalid',
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with too long title', () => {
      const invalidPage = {
        title: 'A'.repeat(256),
        html: '<p>Content</p>',
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with invalid slug', () => {
      const invalidPage = {
        title: 'Page',
        html: '<p>Content</p>',
        slug: 'Invalid_Slug',
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with too long feature_image_caption', () => {
      const invalidPage = {
        title: 'Page',
        html: '<p>Content</p>',
        feature_image_caption: 'A'.repeat(501),
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with too long og_title', () => {
      const invalidPage = {
        title: 'Page',
        html: '<p>Content</p>',
        og_title: 'A'.repeat(301),
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with too long og_description', () => {
      const invalidPage = {
        title: 'Page',
        html: '<p>Content</p>',
        og_description: 'A'.repeat(501),
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with too long twitter_title', () => {
      const invalidPage = {
        title: 'Page',
        html: '<p>Content</p>',
        twitter_title: 'A'.repeat(301),
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with too long twitter_description', () => {
      const invalidPage = {
        title: 'Page',
        html: '<p>Content</p>',
        twitter_description: 'A'.repeat(501),
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with invalid canonical_url', () => {
      const invalidPage = {
        title: 'Page',
        html: '<p>Content</p>',
        canonical_url: 'not-a-url',
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page with empty html', () => {
      const invalidPage = {
        title: 'Page',
        html: '',
      };

      expect(() => createPageSchema.parse(invalidPage)).toThrow();
    });

    // XSS Prevention Tests for HTML content
    describe('XSS sanitization', () => {
      it('should sanitize script tags in html content', () => {
        const page = {
          title: 'Page',
          html: '<p>Safe</p><script>alert("xss")</script>',
        };

        const result = createPageSchema.parse(page);
        expect(result.html).not.toContain('<script>');
        expect(result.html).not.toContain('alert');
        expect(result.html).toContain('<p>Safe</p>');
      });

      it('should sanitize onclick handlers in html content', () => {
        const page = {
          title: 'Page',
          html: '<p onclick="alert(1)">Click me</p>',
        };

        const result = createPageSchema.parse(page);
        expect(result.html).not.toContain('onclick');
        expect(result.html).toContain('<p>Click me</p>');
      });
    });
  });

  describe('updatePageSchema', () => {
    it('should accept partial page updates', () => {
      const update = {
        title: 'Updated Title',
      };

      expect(() => updatePageSchema.parse(update)).not.toThrow();
    });

    it('should accept empty update object', () => {
      expect(() => updatePageSchema.parse({})).not.toThrow();
    });

    it('should accept full page update', () => {
      const update = {
        title: 'Updated Page',
        html: '<p>Updated content</p>',
        status: 'published',
      };

      expect(() => updatePageSchema.parse(update)).not.toThrow();
    });
  });

  describe('pageQuerySchema', () => {
    it('should accept valid query parameters', () => {
      const query = {
        limit: 20,
        page: 2,
        filter: 'status:published+featured:true',
      };

      expect(() => pageQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with include parameter', () => {
      const query = {
        include: 'tags,authors',
      };

      expect(() => pageQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with fields parameter', () => {
      const query = {
        fields: 'title,slug,html',
      };

      expect(() => pageQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with formats parameter', () => {
      const query = {
        formats: 'html,plaintext',
      };

      expect(() => pageQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with order parameter', () => {
      const query = {
        order: 'published_at DESC',
      };

      expect(() => pageQuerySchema.parse(query)).not.toThrow();
    });

    it('should reject query with invalid filter characters', () => {
      const query = {
        filter: 'status;DROP TABLE',
      };

      expect(() => pageQuerySchema.parse(query)).toThrow();
    });

    it('should accept empty query object', () => {
      const result = pageQuerySchema.parse({});
      expect(result).toBeDefined();
    });
  });

  describe('pageIdSchema', () => {
    it('should accept valid Ghost ID', () => {
      const validId = {
        id: '507f1f77bcf86cd799439011',
      };

      expect(() => pageIdSchema.parse(validId)).not.toThrow();
    });

    it('should reject invalid Ghost ID', () => {
      const invalidId = {
        id: 'invalid-id',
      };

      expect(() => pageIdSchema.parse(invalidId)).toThrow();
    });
  });

  describe('pageSlugSchema', () => {
    it('should accept valid slug', () => {
      const validSlug = {
        slug: 'about-us',
      };

      expect(() => pageSlugSchema.parse(validSlug)).not.toThrow();
    });

    it('should reject invalid slug', () => {
      const invalidSlug = {
        slug: 'About_Us',
      };

      expect(() => pageSlugSchema.parse(invalidSlug)).toThrow();
    });
  });

  describe('authorOutputSchema', () => {
    it('should accept valid author output from Ghost API', () => {
      const apiAuthor = {
        id: '507f1f77bcf86cd799439011',
        name: 'John Doe',
        slug: 'john-doe',
        email: 'john@example.com',
        profile_image: 'https://example.com/profile.jpg',
        cover_image: 'https://example.com/cover.jpg',
        bio: 'Writer and blogger',
        website: 'https://johndoe.com',
        location: 'New York',
        facebook: 'johndoe',
        twitter: '@johndoe',
        url: 'https://example.com/author/john-doe',
      };

      expect(() => authorOutputSchema.parse(apiAuthor)).not.toThrow();
    });

    it('should accept author with null optional fields', () => {
      const apiAuthor = {
        id: '507f1f77bcf86cd799439011',
        name: 'Jane Smith',
        slug: 'jane-smith',
        profile_image: null,
        cover_image: null,
        bio: null,
        website: null,
        location: null,
        facebook: null,
        twitter: null,
        url: 'https://example.com/author/jane-smith',
      };

      expect(() => authorOutputSchema.parse(apiAuthor)).not.toThrow();
    });
  });

  describe('tagOutputSchema', () => {
    it('should accept valid tag output from Ghost API', () => {
      const apiTag = {
        id: '507f1f77bcf86cd799439011',
        name: 'Technology',
        slug: 'technology',
        description: 'Tech posts',
        feature_image: 'https://example.com/image.jpg',
        visibility: 'public',
        url: 'https://example.com/tag/technology',
      };

      expect(() => tagOutputSchema.parse(apiTag)).not.toThrow();
    });

    it('should accept tag with null optional fields', () => {
      const apiTag = {
        id: '507f1f77bcf86cd799439011',
        name: 'News',
        slug: 'news',
        description: null,
        feature_image: null,
        visibility: 'public',
        url: 'https://example.com/tag/news',
      };

      expect(() => tagOutputSchema.parse(apiTag)).not.toThrow();
    });
  });

  describe('pageOutputSchema', () => {
    it('should accept valid page output from Ghost API', () => {
      const apiPage = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        title: 'About Us',
        slug: 'about-us',
        html: '<p>About content</p>',
        comment_id: null,
        feature_image: 'https://example.com/image.jpg',
        feature_image_alt: 'Alt text',
        feature_image_caption: 'Caption',
        featured: false,
        status: 'published',
        visibility: 'public',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        published_at: '2024-01-15T10:30:00.000Z',
        custom_excerpt: 'Excerpt',
        codeinjection_head: null,
        codeinjection_foot: null,
        custom_template: null,
        canonical_url: null,
        url: 'https://example.com/about-us',
        excerpt: 'Auto excerpt',
        reading_time: 3,
        og_image: null,
        og_title: null,
        og_description: null,
        twitter_image: null,
        twitter_title: null,
        twitter_description: null,
        meta_title: null,
        meta_description: null,
        show_title_and_feature_image: true,
        authors: [],
        tags: [],
        primary_author: null,
        primary_tag: null,
      };

      expect(() => pageOutputSchema.parse(apiPage)).not.toThrow();
    });

    it('should accept page with authors and tags', () => {
      const apiPage = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Contact',
        slug: 'contact',
        html: '<p>Contact content</p>',
        featured: false,
        status: 'published',
        visibility: 'public',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        url: 'https://example.com/contact',
        authors: [
          {
            id: '507f1f77bcf86cd799439011',
            name: 'John Doe',
            slug: 'john-doe',
            url: 'https://example.com/author/john-doe',
          },
        ],
        tags: [
          {
            id: '507f1f77bcf86cd799439012',
            name: 'Info',
            slug: 'info',
            visibility: 'public',
            url: 'https://example.com/tag/info',
          },
        ],
        primary_author: {
          id: '507f1f77bcf86cd799439011',
          name: 'John Doe',
          slug: 'john-doe',
          url: 'https://example.com/author/john-doe',
        },
        primary_tag: {
          id: '507f1f77bcf86cd799439012',
          name: 'Info',
          slug: 'info',
          visibility: 'public',
          url: 'https://example.com/tag/info',
        },
      };

      expect(() => pageOutputSchema.parse(apiPage)).not.toThrow();
    });

    it('should reject page output without required fields', () => {
      const invalidPage = {
        title: 'About',
        slug: 'about',
      };

      expect(() => pageOutputSchema.parse(invalidPage)).toThrow();
    });

    it('should reject page output with invalid status', () => {
      const invalidPage = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        title: 'About',
        slug: 'about',
        featured: false,
        status: 'invalid_status',
        visibility: 'public',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        url: 'https://example.com/about',
      };

      expect(() => pageOutputSchema.parse(invalidPage)).toThrow();
    });
  });
});
