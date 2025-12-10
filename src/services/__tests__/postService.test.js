import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock ghostService functions - must use factory pattern to avoid hoisting issues
vi.mock('../ghostService.js', () => ({
  createPost: vi.fn(),
  getTags: vi.fn(),
  createTag: vi.fn(),
}));

// Import after mocks are set up
import { createPostService } from '../postService.js';
import { createPost, getTags, createTag } from '../ghostService.js';

describe('postService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPostService - validation', () => {
    it('should accept valid input and create a post', async () => {
      const validInput = {
        title: 'Test Post',
        html: '<p>Test content</p>',
      };
      const expectedPost = { id: '1', title: 'Test Post', status: 'draft' };
      createPost.mockResolvedValue(expectedPost);

      const result = await createPostService(validInput);

      expect(result).toEqual(expectedPost);
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Post',
          html: '<p>Test content</p>',
          status: 'draft',
        })
      );
    });

    it('should reject input with missing title', async () => {
      const invalidInput = {
        html: '<p>Test content</p>',
      };

      await expect(createPostService(invalidInput)).rejects.toThrow(
        'Invalid post input: "title" is required'
      );
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should reject input with missing html', async () => {
      const invalidInput = {
        title: 'Test Post',
      };

      await expect(createPostService(invalidInput)).rejects.toThrow(
        'Invalid post input: "html" is required'
      );
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should reject input with invalid status', async () => {
      const invalidInput = {
        title: 'Test Post',
        html: '<p>Content</p>',
        status: 'invalid-status',
      };

      await expect(createPostService(invalidInput)).rejects.toThrow(
        'Invalid post input: "status" must be one of [draft, published, scheduled]'
      );
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should accept valid status values', async () => {
      const statuses = ['draft', 'published', 'scheduled'];
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      for (const status of statuses) {
        const input = {
          title: 'Test Post',
          html: '<p>Content</p>',
          status,
        };

        await createPostService(input);

        expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ status }));
        vi.clearAllMocks();
      }
    });

    it('should validate tags array with maximum length', async () => {
      const invalidInput = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: Array(11).fill('tag'), // 11 tags exceeds max of 10
      };

      await expect(createPostService(invalidInput)).rejects.toThrow('Invalid post input:');
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should validate tag string max length', async () => {
      const invalidInput = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: ['a'.repeat(51)], // 51 chars exceeds max of 50
      };

      await expect(createPostService(invalidInput)).rejects.toThrow('Invalid post input:');
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should validate feature_image is a valid URI', async () => {
      const invalidInput = {
        title: 'Test Post',
        html: '<p>Content</p>',
        feature_image: 'not-a-valid-url',
      };

      await expect(createPostService(invalidInput)).rejects.toThrow('Invalid post input:');
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should accept valid feature_image URI', async () => {
      const validInput = {
        title: 'Test Post',
        html: '<p>Content</p>',
        feature_image: 'https://example.com/image.jpg',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(validInput);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          feature_image: 'https://example.com/image.jpg',
        })
      );
    });
  });

  describe('createPostService - tag resolution', () => {
    it('should find and reuse existing tag', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: ['existing-tag'],
      };
      const existingTag = { id: '1', name: 'existing-tag', slug: 'existing-tag' };
      getTags.mockResolvedValue([existingTag]);
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(getTags).toHaveBeenCalledWith('existing-tag');
      expect(createTag).not.toHaveBeenCalled();
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [{ name: 'existing-tag' }],
        })
      );
    });

    it('should create new tag when not found', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: ['new-tag'],
      };
      getTags.mockResolvedValue([]); // Tag not found
      const newTag = { id: '2', name: 'new-tag', slug: 'new-tag' };
      createTag.mockResolvedValue(newTag);
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(getTags).toHaveBeenCalledWith('new-tag');
      expect(createTag).toHaveBeenCalledWith({ name: 'new-tag' });
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [{ name: 'new-tag' }],
        })
      );
    });

    it('should handle errors during tag lookup gracefully', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: ['error-tag', 'good-tag'],
      };
      // First tag causes error, second tag exists
      getTags
        .mockRejectedValueOnce(new Error('Tag lookup failed'))
        .mockResolvedValueOnce([{ id: '1', name: 'good-tag' }]);
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      // Should skip error-tag and only include good-tag
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [{ name: 'good-tag' }],
        })
      );
    });

    it('should reject tags array with non-string values', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: [null, 'valid-tag'],
      };

      await expect(createPostService(input)).rejects.toThrow('Invalid post input:');
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should reject tags array with empty strings', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: ['', 'valid-tag'],
      };

      await expect(createPostService(input)).rejects.toThrow('Invalid post input:');
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should trim whitespace from tag names', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: ['  trimmed-tag  '],
      };
      getTags.mockResolvedValue([{ id: '1', name: 'trimmed-tag' }]);
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(getTags).toHaveBeenCalledWith('trimmed-tag');
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [{ name: 'trimmed-tag' }],
        })
      );
    });

    it('should handle mixed existing and new tags', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: ['existing-tag', 'new-tag'],
      };
      getTags
        .mockResolvedValueOnce([{ id: '1', name: 'existing-tag' }]) // First tag exists
        .mockResolvedValueOnce([]); // Second tag doesn't exist
      createTag.mockResolvedValue({ id: '2', name: 'new-tag' });
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(getTags).toHaveBeenCalledTimes(2);
      expect(createTag).toHaveBeenCalledTimes(1);
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [{ name: 'existing-tag' }, { name: 'new-tag' }],
        })
      );
    });
  });

  describe('createPostService - metadata defaults', () => {
    it('should default meta_title to title when not provided', async () => {
      const input = {
        title: 'Test Post Title',
        html: '<p>Content</p>',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_title: 'Test Post Title',
        })
      );
    });

    it('should use provided meta_title instead of defaulting to title', async () => {
      const input = {
        title: 'Test Post Title',
        html: '<p>Content</p>',
        meta_title: 'Custom Meta Title',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_title: 'Custom Meta Title',
        })
      );
    });

    it('should default meta_description to custom_excerpt when provided', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Long HTML content that would be stripped</p>',
        custom_excerpt: 'This is the custom excerpt',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_description: 'This is the custom excerpt',
        })
      );
    });

    it('should generate meta_description from HTML when no excerpt provided', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>This is HTML content with tags stripped</p>',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_description: 'This is HTML content with tags stripped',
        })
      );
    });

    it('should use provided meta_description over custom_excerpt and HTML', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>HTML content</p>',
        custom_excerpt: 'Custom excerpt',
        meta_description: 'Explicit meta description',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_description: 'Explicit meta description',
        })
      );
    });

    it('should truncate meta_description to 500 characters with ellipsis when generated from long HTML', async () => {
      const longHtml = '<p>' + 'a'.repeat(600) + '</p>';
      const input = {
        title: 'Test Post',
        html: longHtml,
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      const calledDescription = createPost.mock.calls[0][0].meta_description;
      expect(calledDescription).toHaveLength(500);
      expect(calledDescription.endsWith('...')).toBe(true);
      expect(calledDescription).toBe('a'.repeat(497) + '...');
    });

    it('should reject empty HTML content', async () => {
      const input = {
        title: 'Test Post',
        html: '',
      };

      await expect(createPostService(input)).rejects.toThrow('Invalid post input:');
      expect(createPost).not.toHaveBeenCalled();
    });

    it('should strip HTML tags and truncate when generating meta_description', async () => {
      const longHtml = '<p>' + 'word '.repeat(200) + '</p>';
      const input = {
        title: 'Test Post',
        html: longHtml,
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      const calledDescription = createPost.mock.calls[0][0].meta_description;
      expect(calledDescription).not.toContain('<p>');
      expect(calledDescription).not.toContain('</p>');
      expect(calledDescription.length).toBeLessThanOrEqual(500);
    });
  });

  describe('createPostService - complete post creation', () => {
    it('should create post with all optional fields', async () => {
      const input = {
        title: 'Complete Post',
        html: '<p>Full content</p>',
        custom_excerpt: 'Excerpt',
        status: 'published',
        published_at: '2025-12-10T12:00:00.000Z',
        tags: ['tag1', 'tag2'],
        feature_image: 'https://example.com/image.jpg',
        feature_image_alt: 'Image alt text',
        feature_image_caption: 'Image caption',
        meta_title: 'Custom Meta Title',
        meta_description: 'Custom meta description',
      };
      getTags.mockResolvedValue([]);
      createTag
        .mockResolvedValueOnce({ id: '1', name: 'tag1' })
        .mockResolvedValueOnce({ id: '2', name: 'tag2' });
      createPost.mockResolvedValue({ id: '1', title: 'Complete Post' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith({
        title: 'Complete Post',
        html: '<p>Full content</p>',
        custom_excerpt: 'Excerpt',
        status: 'published',
        published_at: '2025-12-10T12:00:00.000Z',
        tags: [{ name: 'tag1' }, { name: 'tag2' }],
        feature_image: 'https://example.com/image.jpg',
        feature_image_alt: 'Image alt text',
        feature_image_caption: 'Image caption',
        meta_title: 'Custom Meta Title',
        meta_description: 'Custom meta description',
      });
    });

    it('should default status to draft when not provided', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
        })
      );
    });

    it('should handle post creation with no tags', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [],
        })
      );
      expect(getTags).not.toHaveBeenCalled();
      expect(createTag).not.toHaveBeenCalled();
    });

    it('should handle post creation with empty tags array', async () => {
      const input = {
        title: 'Test Post',
        html: '<p>Content</p>',
        tags: [],
      };
      createPost.mockResolvedValue({ id: '1', title: 'Test' });

      await createPostService(input);

      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [],
        })
      );
      expect(getTags).not.toHaveBeenCalled();
      expect(createTag).not.toHaveBeenCalled();
    });
  });
});
