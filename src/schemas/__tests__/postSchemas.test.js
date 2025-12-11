import { describe, it, expect } from 'vitest';
import {
  createPostSchema,
  updatePostSchema,
  postQuerySchema,
  postIdSchema,
  postOutputSchema,
} from '../postSchemas.js';

describe('Post Schemas', () => {
  describe('createPostSchema', () => {
    it('should accept valid post creation data', () => {
      const validPost = {
        title: 'My Blog Post',
        html: '<p>This is the content of the post.</p>',
        status: 'draft',
      };

      expect(() => createPostSchema.parse(validPost)).not.toThrow();
    });

    it('should accept minimal post creation data', () => {
      const minimalPost = {
        title: 'Title',
        html: '<p>Content</p>',
      };

      const result = createPostSchema.parse(minimalPost);
      expect(result.title).toBe('Title');
      expect(result.status).toBe('draft'); // default
      expect(result.visibility).toBe('public'); // default
      expect(result.featured).toBe(false); // default
    });

    it('should accept post with all fields', () => {
      const fullPost = {
        title: 'Complete Post',
        html: '<p>Full content</p>',
        slug: 'complete-post',
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
        tags: ['tech', 'news'],
        authors: ['author@example.com'],
        published_at: '2024-01-15T10:30:00.000Z',
        canonical_url: 'https://example.com/original',
      };

      expect(() => createPostSchema.parse(fullPost)).not.toThrow();
    });

    it('should reject post without title', () => {
      const invalidPost = {
        html: '<p>Content</p>',
      };

      expect(() => createPostSchema.parse(invalidPost)).toThrow();
    });

    it('should reject post without html', () => {
      const invalidPost = {
        title: 'Title',
      };

      expect(() => createPostSchema.parse(invalidPost)).toThrow();
    });

    it('should reject post with invalid status', () => {
      const invalidPost = {
        title: 'Title',
        html: '<p>Content</p>',
        status: 'invalid',
      };

      expect(() => createPostSchema.parse(invalidPost)).toThrow();
    });

    it('should reject post with too long title', () => {
      const invalidPost = {
        title: 'A'.repeat(256),
        html: '<p>Content</p>',
      };

      expect(() => createPostSchema.parse(invalidPost)).toThrow();
    });
  });

  describe('updatePostSchema', () => {
    it('should accept partial post updates', () => {
      const update = {
        title: 'Updated Title',
      };

      expect(() => updatePostSchema.parse(update)).not.toThrow();
    });

    it('should accept empty update object', () => {
      expect(() => updatePostSchema.parse({})).not.toThrow();
    });
  });

  describe('postQuerySchema', () => {
    it('should accept valid query parameters', () => {
      const query = {
        limit: 20,
        page: 2,
        filter: 'status:published+featured:true',
      };

      expect(() => postQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with include parameter', () => {
      const query = {
        include: 'tags,authors',
      };

      expect(() => postQuerySchema.parse(query)).not.toThrow();
    });

    it('should use default values', () => {
      const result = postQuerySchema.parse({});
      expect(result.limit).toBe(15);
      expect(result.page).toBe(1);
    });
  });

  describe('postIdSchema', () => {
    it('should accept valid Ghost ID', () => {
      const validId = {
        id: '507f1f77bcf86cd799439011',
      };

      expect(() => postIdSchema.parse(validId)).not.toThrow();
    });

    it('should reject invalid Ghost ID', () => {
      const invalidId = {
        id: 'invalid-id',
      };

      expect(() => postIdSchema.parse(invalidId)).toThrow();
    });
  });

  describe('postOutputSchema', () => {
    it('should accept valid post output from Ghost API', () => {
      const apiPost = {
        id: '507f1f77bcf86cd799439011',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        title: 'My Post',
        slug: 'my-post',
        html: '<p>Content</p>',
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
        url: 'https://example.com/my-post',
        excerpt: 'Auto excerpt',
        reading_time: 5,
        email_only: false,
        og_image: null,
        og_title: null,
        og_description: null,
        twitter_image: null,
        twitter_title: null,
        twitter_description: null,
        meta_title: null,
        meta_description: null,
        email_subject: null,
      };

      expect(() => postOutputSchema.parse(apiPost)).not.toThrow();
    });
  });
});
