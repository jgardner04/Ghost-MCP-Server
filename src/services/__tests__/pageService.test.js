import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock ghostServiceImproved functions
vi.mock('../ghostServiceImproved.js', () => ({
  createPage: vi.fn(),
}));

// Import after mocks are set up
import { createPageService } from '../pageService.js';
import { createPage } from '../ghostServiceImproved.js';

describe('pageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPageService - validation', () => {
    it('should accept valid input and create a page', async () => {
      const validInput = {
        title: 'Test Page',
        html: '<p>Test content</p>',
      };
      const expectedPage = { id: '1', title: 'Test Page', status: 'draft' };
      createPage.mockResolvedValue(expectedPage);

      const result = await createPageService(validInput);

      expect(result).toEqual(expectedPage);
      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Page',
          html: '<p>Test content</p>',
          status: 'draft',
        })
      );
    });

    it('should reject input with missing title', async () => {
      const invalidInput = {
        html: '<p>Test content</p>',
      };

      await expect(createPageService(invalidInput)).rejects.toThrow(
        'Invalid page input: "title" is required'
      );
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should reject input with missing html', async () => {
      const invalidInput = {
        title: 'Test Page',
      };

      await expect(createPageService(invalidInput)).rejects.toThrow(
        'Invalid page input: "html" is required'
      );
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should reject input with invalid status', async () => {
      const invalidInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        status: 'invalid-status',
      };

      await expect(createPageService(invalidInput)).rejects.toThrow(
        'Invalid page input: "status" must be one of [draft, published, scheduled]'
      );
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should accept valid status values', async () => {
      const statuses = ['draft', 'published', 'scheduled'];
      createPage.mockResolvedValue({ id: '1', title: 'Test' });

      for (const status of statuses) {
        const input = {
          title: 'Test Page',
          html: '<p>Content</p>',
          status,
        };

        await createPageService(input);

        expect(createPage).toHaveBeenCalledWith(expect.objectContaining({ status }));
        vi.clearAllMocks();
      }
    });

    it('should reject tags field (pages do not support tags)', async () => {
      const invalidInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        tags: ['tag1', 'tag2'],
      };

      // Tags field should cause validation error since it's not in the schema
      await expect(createPageService(invalidInput)).rejects.toThrow('Invalid page input:');
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should validate feature_image is a valid URI', async () => {
      const invalidInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        feature_image: 'not-a-valid-url',
      };

      await expect(createPageService(invalidInput)).rejects.toThrow('Invalid page input:');
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should accept valid feature_image URI', async () => {
      const validInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        feature_image: 'https://example.com/image.jpg',
      };
      createPage.mockResolvedValue({ id: '1', title: 'Test' });

      await createPageService(validInput);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          feature_image: 'https://example.com/image.jpg',
        })
      );
    });

    it('should validate title max length', async () => {
      const invalidInput = {
        title: 'a'.repeat(256), // 256 chars exceeds max of 255
        html: '<p>Content</p>',
      };

      await expect(createPageService(invalidInput)).rejects.toThrow('Invalid page input:');
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should validate custom_excerpt max length', async () => {
      const invalidInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        custom_excerpt: 'a'.repeat(501), // 501 chars exceeds max of 500
      };

      await expect(createPageService(invalidInput)).rejects.toThrow('Invalid page input:');
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should validate meta_title max length', async () => {
      const invalidInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        meta_title: 'a'.repeat(71), // 71 chars exceeds max of 70
      };

      await expect(createPageService(invalidInput)).rejects.toThrow('Invalid page input:');
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should validate meta_description max length', async () => {
      const invalidInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        meta_description: 'a'.repeat(161), // 161 chars exceeds max of 160
      };

      await expect(createPageService(invalidInput)).rejects.toThrow('Invalid page input:');
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should validate published_at is ISO date format', async () => {
      const invalidInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        published_at: 'invalid-date',
      };

      await expect(createPageService(invalidInput)).rejects.toThrow('Invalid page input:');
      expect(createPage).not.toHaveBeenCalled();
    });

    it('should accept valid published_at ISO date', async () => {
      const validInput = {
        title: 'Test Page',
        html: '<p>Content</p>',
        published_at: '2024-12-31T12:00:00.000Z',
      };
      createPage.mockResolvedValue({ id: '1', title: 'Test' });

      await createPageService(validInput);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          published_at: '2024-12-31T12:00:00.000Z',
        })
      );
    });
  });

  describe('createPageService - metadata generation', () => {
    beforeEach(() => {
      createPage.mockResolvedValue({ id: '1', title: 'Test' });
    });

    it('should default meta_title to title when not provided', async () => {
      const input = {
        title: 'My Page Title',
        html: '<p>Content</p>',
      };

      await createPageService(input);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_title: 'My Page Title',
        })
      );
    });

    it('should use provided meta_title instead of defaulting', async () => {
      const input = {
        title: 'My Page Title',
        html: '<p>Content</p>',
        meta_title: 'Custom Meta Title',
      };

      await createPageService(input);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_title: 'Custom Meta Title',
        })
      );
    });

    it('should default meta_description to custom_excerpt when provided', async () => {
      const input = {
        title: 'Test Page',
        html: '<p>Content</p>',
        custom_excerpt: 'This is my custom excerpt',
      };

      await createPageService(input);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_description: 'This is my custom excerpt',
        })
      );
    });

    it('should generate meta_description from HTML when not provided', async () => {
      const input = {
        title: 'Test Page',
        html: '<p>This is the page content that will be used for meta description.</p>',
      };

      await createPageService(input);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_description: expect.stringContaining('This is the page content'),
        })
      );
    });

    it('should use provided meta_description over custom_excerpt', async () => {
      const input = {
        title: 'Test Page',
        html: '<p>Content</p>',
        custom_excerpt: 'This is the excerpt',
        meta_description: 'This is the explicit meta description',
      };

      await createPageService(input);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_description: 'This is the explicit meta description',
        })
      );
    });

    it('should strip HTML tags when generating meta_description', async () => {
      const input = {
        title: 'Test Page',
        html: '<h1>Heading</h1><p><strong>Bold</strong> and <em>italic</em> text</p>',
      };

      await createPageService(input);

      const calledWith = createPage.mock.calls[0][0];
      expect(calledWith.meta_description).not.toContain('<');
      expect(calledWith.meta_description).not.toContain('>');
      expect(calledWith.meta_description).toContain('Heading');
      expect(calledWith.meta_description).toContain('Bold');
      expect(calledWith.meta_description).toContain('italic');
    });

    it('should truncate meta_description to 500 characters', async () => {
      const longContent = 'a'.repeat(600);
      const input = {
        title: 'Test Page',
        html: `<p>${longContent}</p>`,
      };

      await createPageService(input);

      const calledWith = createPage.mock.calls[0][0];
      expect(calledWith.meta_description.length).toBeLessThanOrEqual(500);
      expect(calledWith.meta_description).toContain('...');
    });

    it('should handle empty HTML content gracefully', async () => {
      const input = {
        title: 'Test Page',
        html: '',
      };

      // Empty html should fail validation
      await expect(createPageService(input)).rejects.toThrow('Invalid page input:');
    });
  });

  describe('createPageService - complete page creation', () => {
    it('should create page with all optional fields', async () => {
      const fullInput = {
        title: 'Complete Page',
        html: '<p>Full content</p>',
        custom_excerpt: 'Page excerpt',
        status: 'published',
        published_at: '2024-12-31T12:00:00.000Z',
        feature_image: 'https://example.com/image.jpg',
        feature_image_alt: 'Alt text',
        feature_image_caption: 'Image caption',
        meta_title: 'SEO Title',
        meta_description: 'SEO Description',
      };
      const expectedPage = { id: '1', ...fullInput };
      createPage.mockResolvedValue(expectedPage);

      const result = await createPageService(fullInput);

      expect(result).toEqual(expectedPage);
      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Complete Page',
          html: '<p>Full content</p>',
          custom_excerpt: 'Page excerpt',
          status: 'published',
          published_at: '2024-12-31T12:00:00.000Z',
          feature_image: 'https://example.com/image.jpg',
          feature_image_alt: 'Alt text',
          feature_image_caption: 'Image caption',
          meta_title: 'SEO Title',
          meta_description: 'SEO Description',
        })
      );
    });

    it('should default status to draft when not provided', async () => {
      const input = {
        title: 'Test Page',
        html: '<p>Content</p>',
      };
      createPage.mockResolvedValue({ id: '1', title: 'Test', status: 'draft' });

      await createPageService(input);

      expect(createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
        })
      );
    });

    it('should propagate errors from ghostServiceImproved', async () => {
      const input = {
        title: 'Test Page',
        html: '<p>Content</p>',
      };
      createPage.mockRejectedValue(new Error('Ghost API error'));

      await expect(createPageService(input)).rejects.toThrow('Ghost API error');
    });
  });
});
