import { describe, it, expect } from 'vitest';
import {
  createTagSchema,
  updateTagSchema,
  tagQuerySchema,
  tagIdSchema,
  tagOutputSchema,
} from '../tagSchemas.js';

describe('Tag Schemas', () => {
  describe('createTagSchema', () => {
    it('should accept valid tag creation data', () => {
      const validTag = {
        name: 'Technology',
        slug: 'technology',
        description: 'Posts about technology',
        visibility: 'public',
      };

      expect(() => createTagSchema.parse(validTag)).not.toThrow();
    });

    it('should accept minimal tag creation data (name only)', () => {
      const minimalTag = {
        name: 'News',
      };

      const result = createTagSchema.parse(minimalTag);
      expect(result.name).toBe('News');
      expect(result.visibility).toBe('public'); // default value
    });

    it('should accept tag with all optional fields', () => {
      const fullTag = {
        name: 'Technology',
        slug: 'tech',
        description: 'Tech posts',
        feature_image: 'https://example.com/image.jpg',
        visibility: 'public',
        meta_title: 'Technology Posts',
        meta_description: 'All about tech',
        og_image: 'https://example.com/og.jpg',
        og_title: 'Tech on Our Blog',
        og_description: 'Technology articles',
        twitter_image: 'https://example.com/twitter.jpg',
        twitter_title: 'Tech Posts',
        twitter_description: 'Latest tech news',
        codeinjection_head: '<script>console.log("head")</script>',
        codeinjection_foot: '<script>console.log("foot")</script>',
        canonical_url: 'https://example.com/tech',
        accent_color: '#FF5733',
      };

      expect(() => createTagSchema.parse(fullTag)).not.toThrow();
    });

    it('should reject tag without name', () => {
      const invalidTag = {
        slug: 'tech',
      };

      expect(() => createTagSchema.parse(invalidTag)).toThrow();
    });

    it('should reject tag with invalid slug', () => {
      const invalidTag = {
        name: 'Technology',
        slug: 'Tech_Posts', // uppercase and underscore not allowed
      };

      expect(() => createTagSchema.parse(invalidTag)).toThrow();
    });

    it('should reject tag with invalid accent color', () => {
      const invalidTag = {
        name: 'Technology',
        accent_color: 'red', // must be hex format
      };

      expect(() => createTagSchema.parse(invalidTag)).toThrow();
    });

    it('should reject tag with too long description', () => {
      const invalidTag = {
        name: 'Technology',
        description: 'A'.repeat(501),
      };

      expect(() => createTagSchema.parse(invalidTag)).toThrow();
    });

    it('should reject tag with invalid visibility', () => {
      const invalidTag = {
        name: 'Technology',
        visibility: 'private', // not a valid value
      };

      expect(() => createTagSchema.parse(invalidTag)).toThrow();
    });
  });

  describe('updateTagSchema', () => {
    it('should accept partial tag updates', () => {
      const update = {
        description: 'Updated description',
      };

      expect(() => updateTagSchema.parse(update)).not.toThrow();
    });

    it('should accept empty update object', () => {
      expect(() => updateTagSchema.parse({})).not.toThrow();
    });

    it('should accept full tag update', () => {
      const update = {
        name: 'Updated Name',
        slug: 'updated-slug',
        description: 'Updated description',
      };

      expect(() => updateTagSchema.parse(update)).not.toThrow();
    });
  });

  describe('tagQuerySchema', () => {
    it('should accept valid query parameters', () => {
      const query = {
        name: 'Technology',
        limit: 20,
        page: 2,
      };

      expect(() => tagQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with NQL filter', () => {
      const query = {
        filter: 'visibility:public+featured:true',
        limit: 10,
      };

      expect(() => tagQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with include parameter', () => {
      const query = {
        include: 'count.posts',
      };

      expect(() => tagQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept query with order parameter', () => {
      const query = {
        order: 'name ASC',
      };

      expect(() => tagQuerySchema.parse(query)).not.toThrow();
    });

    it('should reject query with invalid filter characters', () => {
      const query = {
        filter: 'status;DROP TABLE',
      };

      expect(() => tagQuerySchema.parse(query)).toThrow();
    });

    it('should accept empty query object', () => {
      const result = tagQuerySchema.parse({});
      expect(result).toBeDefined();
      // Note: optional fields with defaults don't apply when field is omitted
    });

    it('should accept limit as "all" string', () => {
      const query = {
        limit: 'all',
      };

      const result = tagQuerySchema.parse(query);
      expect(result.limit).toBe('all');
    });

    it('should accept limit as number within range', () => {
      const query = {
        limit: 50,
      };

      const result = tagQuerySchema.parse(query);
      expect(result.limit).toBe(50);
    });

    it('should reject limit as invalid string', () => {
      const query = {
        limit: 'invalid',
      };

      expect(() => tagQuerySchema.parse(query)).toThrow();
    });

    it('should reject limit greater than 100', () => {
      const query = {
        limit: 101,
      };

      expect(() => tagQuerySchema.parse(query)).toThrow();
    });

    it('should reject limit less than 1', () => {
      const query = {
        limit: 0,
      };

      expect(() => tagQuerySchema.parse(query)).toThrow();
    });

    it('should accept limit as string number and transform to number', () => {
      const query = {
        limit: '50',
      };

      const result = tagQuerySchema.parse(query);
      expect(result.limit).toBe(50);
      expect(typeof result.limit).toBe('number');
    });

    it('should accept page as string number and transform to number', () => {
      const query = {
        page: '3',
      };

      const result = tagQuerySchema.parse(query);
      expect(result.page).toBe(3);
      expect(typeof result.page).toBe('number');
    });

    it('should reject query with both name and filter parameters', () => {
      const query = {
        name: 'Technology',
        filter: 'visibility:public',
      };

      expect(() => tagQuerySchema.parse(query)).toThrow();
      try {
        tagQuerySchema.parse(query);
      } catch (error) {
        expect(error.errors[0].message).toContain('Cannot specify both "name" and "filter"');
      }
    });

    it('should reject name with invalid characters', () => {
      const query = {
        name: 'test;DROP',
      };

      expect(() => tagQuerySchema.parse(query)).toThrow(/invalid characters/);
    });

    it('should accept name with apostrophe', () => {
      const query = {
        name: "O'Reilly",
      };

      expect(() => tagQuerySchema.parse(query)).not.toThrow();
    });

    it('should accept name with spaces, hyphens, and underscores', () => {
      const query = {
        name: 'Tech News 2024-Web_Dev',
      };

      expect(() => tagQuerySchema.parse(query)).not.toThrow();
    });
  });

  describe('tagIdSchema', () => {
    it('should accept valid Ghost ID', () => {
      const validId = {
        id: '507f1f77bcf86cd799439011',
      };

      expect(() => tagIdSchema.parse(validId)).not.toThrow();
    });

    it('should reject invalid Ghost ID', () => {
      const invalidId = {
        id: 'invalid-id',
      };

      expect(() => tagIdSchema.parse(invalidId)).toThrow();
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
        meta_title: 'Tech Posts',
        meta_description: 'Technology articles',
        og_image: 'https://example.com/og.jpg',
        og_title: 'Tech',
        og_description: 'Tech posts',
        twitter_image: 'https://example.com/twitter.jpg',
        twitter_title: 'Tech',
        twitter_description: 'Tech posts',
        codeinjection_head: null,
        codeinjection_foot: null,
        canonical_url: 'https://example.com/tech',
        accent_color: '#FF5733',
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        url: 'https://example.com/tag/technology',
      };

      expect(() => tagOutputSchema.parse(apiTag)).not.toThrow();
    });

    it('should accept tag with null optional fields', () => {
      const apiTag = {
        id: '507f1f77bcf86cd799439011',
        name: 'Technology',
        slug: 'technology',
        description: null,
        feature_image: null,
        visibility: 'public',
        meta_title: null,
        meta_description: null,
        og_image: null,
        og_title: null,
        og_description: null,
        twitter_image: null,
        twitter_title: null,
        twitter_description: null,
        codeinjection_head: null,
        codeinjection_foot: null,
        canonical_url: null,
        accent_color: null,
        created_at: '2024-01-15T10:30:00.000Z',
        updated_at: '2024-01-15T10:30:00.000Z',
        url: 'https://example.com/tag/technology',
      };

      expect(() => tagOutputSchema.parse(apiTag)).not.toThrow();
    });

    it('should reject tag output without required fields', () => {
      const invalidTag = {
        name: 'Technology',
        slug: 'technology',
        // missing id, created_at, updated_at, url, visibility
      };

      expect(() => tagOutputSchema.parse(invalidTag)).toThrow();
    });
  });
});
