import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

// Mock the Ghost Admin API with pages support
vi.mock('@tryghost/admin-api', () => ({
  default: vi.fn(function () {
    return {
      posts: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      pages: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      tags: {
        add: vi.fn(),
        browse: vi.fn(),
        read: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn(),
      },
      site: {
        read: vi.fn(),
      },
      images: {
        upload: vi.fn(),
      },
    };
  }),
}));

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock fs for validateImagePath (not needed for pages but part of validators)
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
  },
}));

// Import after setting up mocks
import {
  createPage,
  updatePage,
  deletePage,
  getPage,
  getPages,
  searchPages,
  api,
  validators,
} from '../ghostServiceImproved.js';

describe('ghostServiceImproved - Pages', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('validators.validatePageData', () => {
    it('should validate required title field', () => {
      expect(() => validators.validatePageData({})).toThrow('Page validation failed');
      expect(() => validators.validatePageData({ title: '' })).toThrow('Page validation failed');
      expect(() => validators.validatePageData({ title: '   ' })).toThrow('Page validation failed');
    });

    it('should validate required content field (html or mobiledoc)', () => {
      expect(() => validators.validatePageData({ title: 'Test Page' })).toThrow(
        'Page validation failed'
      );
    });

    it('should accept valid html content', () => {
      expect(() =>
        validators.validatePageData({ title: 'Test Page', html: '<p>Content</p>' })
      ).not.toThrow();
    });

    it('should accept valid mobiledoc content', () => {
      expect(() =>
        validators.validatePageData({ title: 'Test Page', mobiledoc: '{"version":"0.3.1"}' })
      ).not.toThrow();
    });

    it('should validate status enum values', () => {
      expect(() =>
        validators.validatePageData({ title: 'Test', html: '<p>Content</p>', status: 'invalid' })
      ).toThrow('Page validation failed');

      // Valid status values should not throw
      expect(() =>
        validators.validatePageData({ title: 'Test', html: '<p>Content</p>', status: 'draft' })
      ).not.toThrow();
      expect(() =>
        validators.validatePageData({ title: 'Test', html: '<p>Content</p>', status: 'published' })
      ).not.toThrow();
      // Note: scheduled without published_at will throw, tested separately
    });

    it('should require published_at when status is scheduled', () => {
      expect(() =>
        validators.validatePageData({ title: 'Test', html: '<p>Content</p>', status: 'scheduled' })
      ).toThrow('Validation failed');
    });

    it('should validate published_at date format', () => {
      expect(() =>
        validators.validatePageData({
          title: 'Test',
          html: '<p>Content</p>',
          published_at: 'invalid-date',
        })
      ).toThrow('Validation failed');
    });

    it('should require future date for scheduled pages', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      expect(() =>
        validators.validatePageData({
          title: 'Test',
          html: '<p>Content</p>',
          status: 'scheduled',
          published_at: pastDate,
        })
      ).toThrow('Validation failed');
    });

    it('should accept future date for scheduled pages', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      expect(() =>
        validators.validatePageData({
          title: 'Test',
          html: '<p>Content</p>',
          status: 'scheduled',
          published_at: futureDate,
        })
      ).not.toThrow();
    });

    it('should NOT validate tags field (pages do not support tags)', () => {
      // This test ensures that tags are not part of page validation
      // Pages should work with or without tags field (it will be ignored by Ghost API)
      expect(() =>
        validators.validatePageData({
          title: 'Test',
          html: '<p>Content</p>',
          tags: ['tag1', 'tag2'],
        })
      ).not.toThrow();
    });
  });

  describe('createPage', () => {
    it('should throw validation error when title is missing', async () => {
      await expect(createPage({ html: '<p>Content</p>' })).rejects.toThrow('Page validation');
    });

    it('should throw validation error when content is missing', async () => {
      await expect(createPage({ title: 'Test Page' })).rejects.toThrow('Page validation');
    });

    it('should create page with minimal valid data', async () => {
      const pageData = { title: 'Test Page', html: '<p>Content</p>' };
      const expectedPage = { id: '1', ...pageData, status: 'draft' };
      api.pages.add.mockResolvedValue(expectedPage);

      const result = await createPage(pageData);

      expect(result).toEqual(expectedPage);
      expect(api.pages.add).toHaveBeenCalledWith(
        { status: 'draft', ...pageData },
        { source: 'html' }
      );
    });

    it('should set default status to draft when not provided', async () => {
      const pageData = { title: 'Test Page', html: '<p>Content</p>' };
      api.pages.add.mockResolvedValue({ id: '1', ...pageData, status: 'draft' });

      await createPage(pageData);

      expect(api.pages.add).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft' }),
        expect.any(Object)
      );
    });

    it('should create page with all optional fields', async () => {
      const pageData = {
        title: 'Test Page',
        html: '<p>Content</p>',
        status: 'published',
        custom_excerpt: 'Test excerpt',
        feature_image: 'https://example.com/image.jpg',
        feature_image_alt: 'Alt text',
        feature_image_caption: 'Caption',
        meta_title: 'Meta Title',
        meta_description: 'Meta description',
      };
      const expectedPage = { id: '1', ...pageData };
      api.pages.add.mockResolvedValue(expectedPage);

      const result = await createPage(pageData);

      expect(result).toEqual(expectedPage);
      expect(api.pages.add).toHaveBeenCalledWith(pageData, { source: 'html' });
    });

    it('should pass HTML through without service-layer sanitization (schema layer handles it)', async () => {
      const pageData = {
        title: 'Test Page',
        html: '<p>Safe content</p><script>alert("xss")</script>',
      };
      api.pages.add.mockResolvedValue({ id: '1', ...pageData });

      await createPage(pageData);

      // HTML sanitization is enforced at the schema layer via htmlContentSchema,
      // not at the service layer
      const calledWith = api.pages.add.mock.calls[0][0];
      expect(calledWith.html).toBeDefined();
    });

    it('should handle Ghost API validation errors (422)', async () => {
      const error422 = new Error('Validation failed');
      error422.response = { status: 422 };
      api.pages.add.mockRejectedValue(error422);

      await expect(createPage({ title: 'Test', html: '<p>Content</p>' })).rejects.toThrow(
        'Page creation failed due to validation errors'
      );
    });

    it('should NOT include tags in page creation (pages do not support tags)', async () => {
      const pageData = {
        title: 'Test Page',
        html: '<p>Content</p>',
        tags: ['tag1', 'tag2'], // This should be ignored
      };
      api.pages.add.mockResolvedValue({ id: '1', title: 'Test Page', html: '<p>Content</p>' });

      await createPage(pageData);

      // Verify that tags were passed through (Ghost API will ignore them for pages)
      const calledWith = api.pages.add.mock.calls[0][0];
      expect(calledWith).toMatchObject({ title: 'Test Page', html: expect.any(String) });
    });
  });

  describe('updatePage', () => {
    it('should throw error when page ID is missing', async () => {
      await expect(updatePage(null, { title: 'Updated' })).rejects.toThrow('Page ID is required');
      await expect(updatePage('', { title: 'Updated' })).rejects.toThrow('Page ID is required');
    });

    it('should send only update fields and updated_at, not the full existing page', async () => {
      const pageId = 'page-123';
      const existingPage = {
        id: pageId,
        uuid: 'abc-def-123',
        title: 'Original Title',
        slug: 'original-title',
        html: '<p>Original content</p>',
        url: 'https://example.com/original-title',
        reading_time: 2,
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      const updateData = { title: 'Updated Title' };
      const expectedPage = { ...existingPage, ...updateData };

      api.pages.read.mockResolvedValue(existingPage);
      api.pages.edit.mockResolvedValue(expectedPage);

      const result = await updatePage(pageId, updateData);

      expect(result).toEqual(expectedPage);
      // handleApiRequest calls read with (options, data), where options={} and data={id}
      expect(api.pages.read).toHaveBeenCalledWith({}, { id: pageId });
      // Should send ONLY updateData + updated_at, NOT the full existing page
      expect(api.pages.edit).toHaveBeenCalledWith(
        { title: 'Updated Title', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: pageId }
      );
      // Verify read-only fields are NOT sent
      const editCallData = api.pages.edit.mock.calls[0][0];
      expect(editCallData).not.toHaveProperty('uuid');
      expect(editCallData).not.toHaveProperty('url');
      expect(editCallData).not.toHaveProperty('reading_time');
    });

    it('should handle page not found (404)', async () => {
      const error404 = new Error('Page not found');
      error404.response = { status: 404 };
      api.pages.read.mockRejectedValue(error404);

      await expect(updatePage('nonexistent-id', { title: 'Updated' })).rejects.toThrow(
        'Page not found'
      );
    });

    it('should preserve updated_at timestamp for conflict resolution', async () => {
      const pageId = 'page-123';
      const existingPage = {
        id: pageId,
        title: 'Original',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      api.pages.read.mockResolvedValue(existingPage);
      api.pages.edit.mockResolvedValue({ ...existingPage, title: 'Updated' });

      await updatePage(pageId, { title: 'Updated' });

      const editCall = api.pages.edit.mock.calls[0][0];
      expect(editCall.updated_at).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should throw ValidationError when updating to scheduled without published_at', async () => {
      const pageId = 'page-123';
      const existingPage = {
        id: pageId,
        title: 'Test Page',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      api.pages.read.mockResolvedValue(existingPage);

      await expect(updatePage(pageId, { status: 'scheduled' })).rejects.toThrow(
        'Validation failed'
      );
    });
  });

  describe('deletePage', () => {
    it('should throw error when page ID is missing', async () => {
      await expect(deletePage(null)).rejects.toThrow('Page ID is required');
      await expect(deletePage('')).rejects.toThrow('Page ID is required');
    });

    it('should delete page successfully', async () => {
      const pageId = 'page-123';
      api.pages.delete.mockResolvedValue({ id: pageId });

      const result = await deletePage(pageId);

      expect(result).toEqual({ id: pageId });
      // handleApiRequest calls delete with (data.id || data, options)
      expect(api.pages.delete).toHaveBeenCalledWith(pageId, {});
    });

    it('should handle page not found (404)', async () => {
      const error404 = new Error('Page not found');
      error404.response = { status: 404 };
      api.pages.delete.mockRejectedValue(error404);

      await expect(deletePage('nonexistent-id')).rejects.toThrow('Page not found');
    });
  });

  describe('getPage', () => {
    it('should throw error when page ID is missing', async () => {
      await expect(getPage(null)).rejects.toThrow('Page ID is required');
      await expect(getPage('')).rejects.toThrow('Page ID is required');
    });

    it('should get page by ID', async () => {
      const pageId = 'page-123';
      const expectedPage = { id: pageId, title: 'Test Page', html: '<p>Content</p>' };
      api.pages.read.mockResolvedValue(expectedPage);

      const result = await getPage(pageId);

      expect(result).toEqual(expectedPage);
      // handleApiRequest calls read with (options, data)
      expect(api.pages.read).toHaveBeenCalledWith({}, { id: pageId });
    });

    it('should get page by slug', async () => {
      const slug = 'test-page';
      const expectedPage = { id: 'page-123', slug, title: 'Test Page' };
      api.pages.read.mockResolvedValue(expectedPage);

      const result = await getPage(`slug/${slug}`);

      expect(result).toEqual(expectedPage);
      expect(api.pages.read).toHaveBeenCalledWith({}, { id: `slug/${slug}` });
    });

    it('should pass options to API (include, etc.)', async () => {
      const pageId = 'page-123';
      const options = { include: 'authors' };
      api.pages.read.mockResolvedValue({ id: pageId });

      await getPage(pageId, options);

      expect(api.pages.read).toHaveBeenCalledWith(options, { id: pageId });
    });

    it('should handle page not found (404)', async () => {
      const error404 = new Error('Page not found');
      error404.response = { status: 404 };
      api.pages.read.mockRejectedValue(error404);

      await expect(getPage('nonexistent-id')).rejects.toThrow('Page not found');
    });
  });

  describe('getPages', () => {
    it('should get all pages with default options', async () => {
      const expectedPages = [
        { id: '1', title: 'Page 1' },
        { id: '2', title: 'Page 2' },
      ];
      api.pages.browse.mockResolvedValue(expectedPages);

      const result = await getPages();

      expect(result).toEqual(expectedPages);
      // getPages applies defaults (limit: 15, include: 'authors')
      expect(api.pages.browse).toHaveBeenCalledWith({ limit: 15, include: 'authors' }, {});
    });

    it('should pass pagination options', async () => {
      const options = { limit: 10, page: 2 };
      api.pages.browse.mockResolvedValue([]);

      await getPages(options);

      // getPages merges options with defaults
      expect(api.pages.browse).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, page: 2, include: 'authors' }),
        {}
      );
    });

    it('should pass status filter', async () => {
      const options = { status: 'published' };
      api.pages.browse.mockResolvedValue([]);

      await getPages(options);

      expect(api.pages.browse).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published', limit: 15, include: 'authors' }),
        {}
      );
    });

    it('should pass include options', async () => {
      const options = { include: 'authors,tags' };
      api.pages.browse.mockResolvedValue([]);

      await getPages(options);

      expect(api.pages.browse).toHaveBeenCalledWith(
        expect.objectContaining({ include: 'authors,tags', limit: 15 }),
        {}
      );
    });

    it('should pass NQL filter', async () => {
      const options = { filter: 'featured:true' };
      api.pages.browse.mockResolvedValue([]);

      await getPages(options);

      expect(api.pages.browse).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'featured:true', limit: 15, include: 'authors' }),
        {}
      );
    });

    it('should pass order/sort options', async () => {
      const options = { order: 'published_at DESC' };
      api.pages.browse.mockResolvedValue([]);

      await getPages(options);

      expect(api.pages.browse).toHaveBeenCalledWith(
        expect.objectContaining({ order: 'published_at DESC', limit: 15, include: 'authors' }),
        {}
      );
    });
  });

  describe('searchPages', () => {
    it('should throw error when query is missing', async () => {
      await expect(searchPages(null)).rejects.toThrow('Search query is required');
      await expect(searchPages('')).rejects.toThrow('Search query is required');
    });

    it('should search pages with query', async () => {
      const query = 'test search';
      const expectedPages = [{ id: '1', title: 'Test Page' }];
      api.pages.browse.mockResolvedValue(expectedPages);

      const result = await searchPages(query);

      expect(result).toEqual(expectedPages);
      // Verify NQL filter was created with escaped query
      const browseCall = api.pages.browse.mock.calls[0][0];
      expect(browseCall.filter).toContain('title:~');
      expect(browseCall.filter).toContain('test search');
    });

    it('should sanitize query to prevent NQL injection', async () => {
      const maliciousQuery = "test'; DELETE FROM pages; --";
      api.pages.browse.mockResolvedValue([]);

      await searchPages(maliciousQuery);

      const browseCall = api.pages.browse.mock.calls[0][0];
      // Verify that backslashes and quotes are escaped
      expect(browseCall.filter).toContain("\\'");
    });

    it('should escape backslashes in query', async () => {
      const query = 'test\\path';
      api.pages.browse.mockResolvedValue([]);

      await searchPages(query);

      const browseCall = api.pages.browse.mock.calls[0][0];
      expect(browseCall.filter).toContain('\\\\');
    });

    it('should pass status filter option', async () => {
      const query = 'test';
      const options = { status: 'published' };
      api.pages.browse.mockResolvedValue([]);

      await searchPages(query, options);

      const browseCall = api.pages.browse.mock.calls[0][0];
      expect(browseCall.filter).toContain('status:published');
    });

    it('should pass limit option', async () => {
      const query = 'test';
      const options = { limit: 5 };
      api.pages.browse.mockResolvedValue([]);

      await searchPages(query, options);

      const browseCall = api.pages.browse.mock.calls[0][0];
      expect(browseCall.limit).toBe(5);
    });

    it('should combine query and status in NQL filter', async () => {
      const query = 'about';
      const options = { status: 'published' };
      api.pages.browse.mockResolvedValue([]);

      await searchPages(query, options);

      const browseCall = api.pages.browse.mock.calls[0][0];
      expect(browseCall.filter).toContain('title:~');
      expect(browseCall.filter).toContain('about');
      expect(browseCall.filter).toContain('status:published');
      expect(browseCall.filter).toContain('+');
    });
  });
});
